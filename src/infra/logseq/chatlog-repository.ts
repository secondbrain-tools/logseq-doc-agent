import type { IChatlogRepository } from '../../application/ports/chatlog-repository';
import type { LogseqApi } from '../../application/ports/logseq-ports';
import type { Message } from '../../domain/chat/types';
import type { ChatlogMetadata, ChatlogEntry } from '../../domain/chatlog/types';
import { CHATLOG_PROPERTIES } from '../../domain/chatlog/types';
import type { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';

/**
 * Logseq implementation of ChatlogRepository
 */
export class LogseqChatlogRepository implements IChatlogRepository {
    constructor(
        private logseqApi: LogseqApi,
        private getStorageRoot: () => string
    ) { }

    /**
     * Get the chatlogs parent page path
     */
    private getChatlogsPath(): string {
        return `${this.getStorageRoot()}/chatlogs`;
    }

    /**
     * Generate a unique ID for a new chatlog
     */
    generateId(): string {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
        const randomPart = Math.random().toString(36).substring(2, 8);
        return `${dateStr}-${randomPart}`;
    }

    /**
     * Find a chatlog page by its ID property
     * Returns the page name if found, null otherwise
     */
    private async findPageById(id: string): Promise<string | null> {
        // Use simple query which the user confirmed works: {{query (property :lda.chatlog.id "ID")}}
        const query = `(property :${CHATLOG_PROPERTIES.ID} "${id}")`;

        try {
            const results = await this.logseqApi.q(query);

            if (results && results.length > 0) {
                const result = results[0];

                // Result from simple query might be a block (pre-block) or a page
                // If it's a block, it has a 'page' property with metadata
                if (result.page) {
                    const foundName = result.page.originalName || result.page.name || null;
                    return foundName;
                }

                // Otherwise try direct properties (if it really is a page)
                const foundName = result.originalName || result.name || null;
                return foundName;
            } else {
            }
        } catch (error) {
            console.error('[LogseqChatlogRepository] Error finding page by ID:', error);
        }
        return null;
    }

    /**
     * Save a new chatlog or update an existing one
     * Pages are stored under: $storageRoot/chatlogs/[title]
     * ID is stored as a property for lookup
     * Messages are nested: each message is a child of the previous one
     */
    async saveChatlog(
        id: string,
        title: string,
        messages: Message[],
        model: string,
        provider: string
    ): Promise<void> {
        // First, try to find existing page by ID property
        let pageName = await this.findPageById(id);
        const desiredPageName = `${this.getChatlogsPath()}/${title}`;

        if (!pageName) {
            console.log('[LogseqChatlogRepository] Creating new page for chatlog since pagename not existing', pageName);
            // Create new page under title path
            pageName = desiredPageName;
            await this.logseqApi.createPage(pageName, {
                [CHATLOG_PROPERTIES.ID]: id
            }, { createFirstBlock: false, redirect: false });
        } else if (pageName !== desiredPageName) {
            // Rename page if title has changed
            console.log(`[LogseqChatlogRepository] Renaming chatlog page from "${pageName}" to "${desiredPageName}"`);
            await this.logseqApi.renamePage(pageName, desiredPageName, { silent: true });
            pageName = desiredPageName;
        }

        // Get existing blocks to determine what to append
        const existingBlocks = await this.logseqApi.getPageBlocksTree(pageName);
        const existingMsgCount = this.countNestedBlocks(existingBlocks);

        // Only append new messages
        const newMessages = messages.slice(existingMsgCount);

        // Find deepest block to append as child (or use page if no blocks)
        let parentBlockUuid: string | null = this.findDeepestBlockUuid(existingBlocks);

        for (const msg of newMessages) {
            const blockContent = this.formatMessageBlock(msg, model);

            if (parentBlockUuid) {
                // Insert as child of previous block
                const newBlock = await this.logseqApi.insertBlock(parentBlockUuid, blockContent, { sibling: false });
                if (newBlock?.uuid) {
                    parentBlockUuid = newBlock.uuid;
                }
            } else {
                // First block - append to page
                const newBlock = await this.logseqApi.appendBlockInPage(pageName, blockContent);
                if (newBlock?.uuid) {
                    parentBlockUuid = newBlock.uuid;
                }
            }
        }
    }

    /**
     * Load a chatlog by ID
     */
    async loadChatlog(id: string): Promise<ChatlogEntry | null> {
        const pageName = await this.findPageById(id);

        if (!pageName) {
            return null;
        }

        const page = await this.logseqApi.getPage(pageName);
        if (!page) {
            return null;
        }

        const blocks = await this.logseqApi.getPageBlocksTree(pageName);
        const messages = this.parseBlocksToMessages(blocks);

        // Extract title from page name (remove the chatlogs/ prefix)
        const chatlogsPath = this.getChatlogsPath();
        const title = pageName.replace(`${chatlogsPath}/`, '');

        const metadata: ChatlogMetadata = {
            id,
            title,
            created: page.createdAt ? new Date(page.createdAt).toISOString() : new Date().toISOString(),
            updated: page.updatedAt ? new Date(page.updatedAt).toISOString() : new Date().toISOString(),
            model: page.properties?.[CHATLOG_PROPERTIES.MODEL],
            provider: page.properties?.[CHATLOG_PROPERTIES.PROVIDER],
            messageCount: messages.length,
        };

        return { metadata, messages };
    }

    /**
     * List all chatlogs with metadata
     */
    async listChatlogs(): Promise<ChatlogMetadata[]> {
        const chatlogsPath = this.getChatlogsPath();

        // Query for all pages with the chatlog ID property
        const query = `(property :${CHATLOG_PROPERTIES.ID})`;

        try {
            const results = await this.logseqApi.q(query);
            const chatlogs: ChatlogMetadata[] = [];

            for (const result of results) {
                if (!result) continue;

                // Result might be a block (pre-block) or page
                let pageName = result.originalName || result.name || result['original-name'];

                if (result.page) {
                    pageName = result.page.originalName || result.page.name || result.page['original-name'];
                }

                if (!pageName) continue;

                try {
                    // Fetch full page to get correct metadata (createdAt, updatedAt)
                    // The query result might be a block or incomplete page object
                    const page = await this.logseqApi.getPage(pageName);
                    if (!page) continue;

                    // Title is the page name without the chatlogs/ prefix
                    const title = pageName.split('/').pop() || pageName;

                    // ID is stored as a property
                    // Helper to get property case-insensitively/normalized
                    const getProp = (obj: any, key: string) => {
                        if (!obj) return undefined;
                        return obj[key] ||
                            obj[key.replace(/\./g, '-')] ||
                            obj[key.replace(/\./g, '_')]; // specific Logseq normalization sometimes
                    };

                    const props = page.properties || {};
                    const id = getProp(props, CHATLOG_PROPERTIES.ID) || pageName;

                    // Get block count for message count
                    const blocks = await this.logseqApi.getPageBlocksTree(pageName);

                    chatlogs.push({
                        id,
                        title,
                        created: page.createdAt ? new Date(page.createdAt).toISOString() : new Date().toISOString(),
                        updated: page.updatedAt ? new Date(page.updatedAt).toISOString() : new Date().toISOString(),
                        model: getProp(props, CHATLOG_PROPERTIES.MODEL),
                        provider: getProp(props, CHATLOG_PROPERTIES.PROVIDER),
                        messageCount: blocks.length,
                    });
                } catch (e) {
                    console.error(`[LogseqChatlogRepository] Error processing chatlog page ${pageName}:`, e);
                }
            }

            // Sort by updated date, newest first
            chatlogs.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

            return chatlogs;
        } catch (error) {
            console.error('[LogseqChatlogRepository] Error listing chatlogs:', error);
            return [];
        }
    }

    /**
     * Delete a chatlog by ID
     */
    async deleteChatlog(id: string): Promise<void> {
        const pageName = await this.findPageById(id);
        if (pageName) {
            await this.logseqApi.deletePage(pageName);
        }
    }

    // --- Helpers ---

    /**
     * Count total messages in nested block structure
     */
    private countNestedBlocks(blocks: BlockEntity[]): number {
        if (!blocks || blocks.length === 0) return 0;

        let count = 0;
        for (const block of blocks) {
            count++;
            if (block.children && Array.isArray(block.children)) {
                count += this.countNestedBlocks(block.children as BlockEntity[]);
            }
        }
        return count;
    }

    /**
     * Find the deepest block's UUID in the tree (last message in conversation)
     */
    private findDeepestBlockUuid(blocks: BlockEntity[]): string | null {
        if (!blocks || blocks.length === 0) return null;

        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock.children && Array.isArray(lastBlock.children) && lastBlock.children.length > 0) {
            return this.findDeepestBlockUuid(lastBlock.children as BlockEntity[]);
        }
        return lastBlock.uuid;
    }

    /**
     * Escape content for Logseq markdown compatibility
     * - Replace markdown "-" list markers with "*" (Logseq uses "-" for outliner)
     */
    private escapeForLogseq(content: string): string {
        // Replace lines starting with optional whitespace + "-" with "*"
        return content.replace(/^(\s*)-\s/gm, '$1* ');
    }

    /**
     * Format a message as a block with properties
     */
    private formatMessageBlock(msg: Message, model?: string): string {
        const timestamp = new Date().toISOString();
        let block = `${CHATLOG_PROPERTIES.ROLE}:: ${msg.role}\n`;
        block += `${CHATLOG_PROPERTIES.TIMESTAMP}:: ${timestamp}\n`;

        if (msg.role === 'assistant' && model) {
            block += `${CHATLOG_PROPERTIES.MODEL}:: ${model}\n`;
        }

        if (msg.parts && msg.parts.length > 0) {
            try {
                const partsJson = JSON.stringify(msg.parts);
                block += `${CHATLOG_PROPERTIES.PARTS}:: ${partsJson}\n`;
            } catch (e) {
                console.warn('[LogseqChatlogRepository] Error stringifying parts:', e);
            }
        }

        // Escape content for Logseq compatibility
        block += this.escapeForLogseq(msg.content);
        return block;
    }

    /**
     * Parse block entities to Message objects
     */
    private parseBlocksToMessages(blocks: any[]): Message[] {
        const messages: Message[] = [];

        const processBlock = (block: any) => {
            if (!block.content) {
                return;
            }


            const role = this.extractProperty(block.content, CHATLOG_PROPERTIES.ROLE);
            if (role && ['user', 'assistant', 'system', 'tool'].includes(role)) {
                let content = this.extractContent(block.content);
                // For tool messages, content might be empty if it only has parts, but we strictly require content string in Message type
                if (!content && role === 'tool') content = '';
                const message: Message = {
                    id: block.uuid || Date.now().toString(),
                    role: role as Message['role'],
                    content,
                };

                // Extract parts if available
                const partsJson = this.extractProperty(block.content, CHATLOG_PROPERTIES.PARTS);
                if (partsJson) {
                    try {
                        message.parts = JSON.parse(partsJson);
                    } catch (e) {
                        console.warn('[LogseqChatlogRepository] Error parsing parts JSON:', e);
                    }
                }

                messages.push(message);
            }

            // Process children
            if (block.children && Array.isArray(block.children)) {
                block.children.forEach(processBlock);
            }
        };

        if (blocks) {
            blocks.forEach(processBlock);
        }

        return messages;
    }

    /**
     * Extract a property value from block content
     */
    private extractProperty(content: string, propertyName: string): string | null {
        const pattern = new RegExp(`${propertyName}::\\s*(.+)`);
        const match = content.match(pattern);
        return match ? match[1].trim() : null;
    }

    /**
     * Extract message content (non-property lines)
     */
    private extractContent(blockContent: string): string {
        const lines = blockContent.split('\n');
        const contentLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed && !trimmed.match(/^[^:]+::\s*.+$/);
        });
        return contentLines.join('\n');
    }
}
