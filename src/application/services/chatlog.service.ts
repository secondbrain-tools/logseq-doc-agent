import type { LogseqApi } from '../ports/logseq-ports';
import type { Message } from '../../domain/chat/types';
import type { ChatlogMetadata, ChatlogEntry } from '../../domain/chatlog/types';
import { CHATLOG_PROPERTIES } from '../../domain/chatlog/types';
import type { MiniModelRunner } from '../../infra/ai/mini-model-runner';
import type { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';

/**
 * Service for managing chatlog persistence in Logseq pages
 */
export class ChatlogService {
    // Save concurrency control (per chatlog ID)
    private saveState: Map<string, {
        isSaving: boolean;
        pendingSave: { messages: Message[]; model: string; provider: string } | null;
        cachedTitle: string | null;
        lastTitleMessageCount: number;
    }> = new Map();

    constructor(
        private logseqApi: LogseqApi,
        private getStorageRoot: () => string,
        private miniModelRunner?: MiniModelRunner
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
     * Generate a simple fallback title from the first user message (sync)
     */
    generateTitle(messages: Message[]): string {
        const firstUserMsg = messages.find(m => m.role === 'user');
        if (!firstUserMsg) {
            return 'New Chat';
        }
        const content = firstUserMsg.content.trim();
        if (content.length <= 50) {
            return content;
        }
        return content.substring(0, 47) + '...';
    }

    /**
     * Generate an AI-powered title using the mini model
     */
    async generateTitleAsync(messages: Message[]): Promise<string> {
        const firstUserIdx = messages.findIndex(m => m.role === 'user');
        if (firstUserIdx === -1) {
            return 'New Chat';
        }

        if (this.miniModelRunner) {
            try {
                let context = '';

                // First interaction
                context += `First User Message: ${messages[firstUserIdx].content}\n`;
                if (messages[firstUserIdx + 1]?.role === 'assistant') {
                    // Truncate very long answers to save context window if needed, but for titles full context is usually fine
                    context += `First Model Answer: ${messages[firstUserIdx + 1].content.substring(0, 500)}\n`;
                }

                // Last interaction (if different and exists)
                let lastUserIdx = -1;
                for (let i = messages.length - 1; i > firstUserIdx; i--) {
                    if (messages[i].role === 'user') {
                        lastUserIdx = i;
                        break;
                    }
                }

                if (lastUserIdx !== -1) {
                    context += `\nLast User Message: ${messages[lastUserIdx].content}\n`;
                    if (messages[lastUserIdx + 1]?.role === 'assistant') {
                        context += `Last Model Answer: ${messages[lastUserIdx + 1].content.substring(0, 500)}\n`;
                    }
                }

                return await this.miniModelRunner.generateTitle(context.trim());
            } catch (error) {
                console.warn('[ChatlogService] AI title generation failed, using fallback:', error);
            }
        }

        // Fallback to simple truncation
        return this.generateTitle(messages);
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
                    return result.page.originalName || result.page.name || null;
                }

                // Otherwise try direct properties (if it really is a page)
                return result.originalName || result.name || null;
            }
        } catch (error) {
            console.error('[ChatlogService] Error finding page by ID:', error);
        }
        return null;
    }

    /**
     * Get or initialize save state for a chatlog
     */
    private getSaveState(id: string) {
        if (!this.saveState.has(id)) {
            this.saveState.set(id, {
                isSaving: false,
                pendingSave: null,
                cachedTitle: null,
                lastTitleMessageCount: 0
            });
        }
        return this.saveState.get(id)!;
    }

    /**
     * Request to save a chatlog. Handles concurrency:
     * - Only one save can run at a time per chatlog
     * - If save in progress, queues the latest request (replaces any previous pending)
     * - Automatically generates and caches titles
     */
    async requestSave(
        id: string,
        messages: Message[],
        model: string,
        provider: string
    ): Promise<void> {
        const state = this.getSaveState(id);

        if (state.isSaving) {
            // Queue only the latest save request
            state.pendingSave = { messages, model, provider };
            console.log('[ChatlogService] Save already in progress, queuing latest');
            return;
        }

        await this.executeSave(id, messages, model, provider);
    }

    /**
     * Execute save operation with lock and title management
     */
    private async executeSave(
        id: string,
        messages: Message[],
        model: string,
        provider: string
    ): Promise<void> {
        const state = this.getSaveState(id);
        state.isSaving = true;

        console.log('[ChatlogService] saving chatlog', id, messages.length);

        try {
            // Count user messages to determine if we should regenerate title
            const userMsgCount = this.countUserMessages(messages);

            // Generate title only if:
            // 1. We don't have a cached title yet (first save)
            // 2. User message count increased by 3 or more since last title generation
            let title = state.cachedTitle;
            if (!title || (userMsgCount - state.lastTitleMessageCount >= 3)) {
                title = await this.generateTitleAsync(messages);
                console.log('[ChatlogService] Generated new title', title);
                state.cachedTitle = title;
                state.lastTitleMessageCount = userMsgCount;
            }

            await this.saveChatlog(id, title, messages, model, provider);
        } catch (error) {
            console.error('[ChatlogService] Error saving chatlog:', error);
        } finally {
            state.isSaving = false;

            // Process pending save if one was queued
            if (state.pendingSave) {
                const pending = state.pendingSave;
                state.pendingSave = null;
                console.log('[ChatlogService] Processing pending save');
                // Use setTimeout to avoid deep recursion
                setTimeout(() => this.executeSave(id, pending.messages, pending.model, pending.provider), 0);
            }
        }
    }

    /**
     * Save a new chatlog or update an existing one (internal)
     * Pages are stored under: $storageRoot/chatlogs/[title]
     * ID is stored as a property for lookup
     * Messages are nested: each message is a child of the previous one
     */
    private async saveChatlog(
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
            console.log('[ChatlogService] Creating new page for chatlog since pagename not existing', pageName);
            // Create new page under title path
            pageName = desiredPageName;
            await this.logseqApi.createPage(pageName, {
                [CHATLOG_PROPERTIES.ID]: id
            }, { createFirstBlock: false, redirect: false });
        } else if (pageName !== desiredPageName) {
            // Rename page if title has changed
            console.log(`[ChatlogService] Renaming chatlog page from "${pageName}" to "${desiredPageName}"`);
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

        // Escape content for Logseq compatibility
        block += this.escapeForLogseq(msg.content);
        return block;
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
     * Parse block entities to Message objects
     */
    private parseBlocksToMessages(blocks: any[]): Message[] {
        const messages: Message[] = [];

        for (const block of blocks) {
            if (!block.content) continue;

            const role = this.extractProperty(block.content, CHATLOG_PROPERTIES.ROLE);
            if (!role || !['user', 'assistant', 'system'].includes(role)) continue;

            const content = this.extractContent(block.content);

            messages.push({
                id: block.uuid || Date.now().toString(),
                role: role as Message['role'],
                content,
            });
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

    /**
     * List all chatlogs with metadata
     */
    async listChatlogs(): Promise<ChatlogMetadata[]> {
        const chatlogsPath = this.getChatlogsPath();

        // Query for all pages with the chatlog ID property
        // Using simple query is more reliable than Datalog path matching in this context
        const query = `(property :${CHATLOG_PROPERTIES.ID})`;

        try {
            const results = await this.logseqApi.q(query);
            const chatlogs: ChatlogMetadata[] = [];

            for (const result of results) {
                if (!result) continue;

                // Result might be a block (pre-block) or page
                // We need the page name
                let pageName = result.originalName || result.name || result['original-name'];
                let props = result.properties || {};
                let createdAt = result.createdAt || result['created-at'];
                let updatedAt = result.updatedAt || result['updated-at'];

                if (result.page) {
                    pageName = result.page.originalName || result.page.name || result.page['original-name'];
                    // Properties are usually on the block itself for page properties
                }

                if (!pageName) continue;

                // Title is the page name without the chatlogs/ prefix
                // If stored elsewhere, just use the last part of the name
                const title = pageName.split('/').pop() || pageName;

                // ID is stored as a property
                // Logseq API returns properties in camelCase or original format in the object
                const id = props[CHATLOG_PROPERTIES.ID] ||
                    props[CHATLOG_PROPERTIES.ID.replace(/\./g, '-')] ||
                    props['lda-chatlog-id'] || // Common normalization
                    pageName;

                // Get block count for message count
                // Optimization: If we have blocks in result, use it, otherwise fetch
                const blocks = await this.logseqApi.getPageBlocksTree(pageName);

                chatlogs.push({
                    id,
                    title,
                    created: createdAt ? new Date(createdAt).toISOString() : '',
                    updated: updatedAt ? new Date(updatedAt).toISOString() : '',
                    // Check various property key formats
                    model: props[CHATLOG_PROPERTIES.MODEL] || props['lda-chatlog-model'],
                    provider: props[CHATLOG_PROPERTIES.PROVIDER] || props['lda-chatlog-provider'],
                    messageCount: blocks.length,
                });
            }

            // Sort by updated date, newest first
            chatlogs.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

            return chatlogs;
        } catch (error) {
            console.error('[ChatlogService] Error listing chatlogs:', error);
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

    /**
     * Get the count of user messages (for title update trigger)
     */
    countUserMessages(messages: Message[]): number {
        return messages.filter(m => m.role === 'user').length;
    }
}
