import type { Message } from '../../domain/chat/types';
import type { ChatlogMetadata, ChatlogEntry } from '../../domain/chatlog/types';
import type { ITitleGenerator } from '../ports/title-generator';
import type { IChatlogRepository } from '../ports/chatlog-repository';

/**
 * Service for managing chatlog persistence
 * Now decoupled from Logseq via IChatlogRepository
 */
export class ChatlogService {
    // Save concurrency control (per chatlog ID)
    private saveState: Map<string, {
        isSaving: boolean;
        pendingSave: { messages: Message[]; model: string; provider: string } | null;
        cachedTitle: string | null;
    }> = new Map();

    constructor(
        private repository: IChatlogRepository,
        private titleGenerator?: ITitleGenerator
    ) { }

    /**
     * Generate a unique ID for a new chatlog
     */
    generateId(): string {
        return this.repository.generateId();
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

        if (this.titleGenerator) {
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

                return await this.titleGenerator.generateTitle(context.trim());
            } catch (error) {
                console.warn('[ChatlogService] AI title generation failed, using fallback:', error);
            }
        }

        // Fallback to simple truncation
        return this.generateTitle(messages);
    }

    /**
     * Get or initialize save state for a chatlog
     */
    private getSaveState(id: string) {
        if (!this.saveState.has(id)) {
            this.saveState.set(id, {
                isSaving: false,
                pendingSave: null,
                cachedTitle: null
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

            // Generate title only if we don't have a cached title yet (first save)
            let title = state.cachedTitle;
            if (!title) {
                title = await this.generateTitleAsync(messages);
                console.log('[ChatlogService] Generated new title', title);
                state.cachedTitle = title;
            }

            await this.repository.saveChatlog(id, title, messages, model, provider);
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
     * Load a chatlog by ID
     */
    async loadChatlog(id: string): Promise<ChatlogEntry | null> {
        const entry = await this.repository.loadChatlog(id);
        if (entry) {
            // Cache the existing title so we don't regenerate it on next save
            const state = this.getSaveState(id);
            state.cachedTitle = entry.metadata.title;
        }
        return entry;
    }

    /**
     * List all chatlogs with metadata
     */
    async listChatlogs(): Promise<ChatlogMetadata[]> {
        return this.repository.listChatlogs();
    }

    /**
     * Delete a chatlog by ID
     */
    async deleteChatlog(id: string): Promise<void> {
        return this.repository.deleteChatlog(id);
    }

    /**
     * Get the count of user messages (for title update trigger)
     */
    countUserMessages(messages: Message[]): number {
        return messages.filter(m => m.role === 'user').length;
    }
}
