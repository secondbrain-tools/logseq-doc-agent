import type { SidebarInjector } from '../ports/sidebar-injector';
import ChatContainer from '../../ui/components/chat/ChatContainer.svelte';
import ChatHeaderActions from '../../ui/components/chat/ChatHeaderActions.svelte';
import type { Message } from '../../domain/chat/types';
import type { IAIService } from '../ports/ai-service';
import type { ChatlogService } from '../services/chatlog.service';
import type { ChatlogMetadata } from '../../domain/chatlog/types';

// Rewrite file with STORE approach for reactivity
import { writable, type Writable, get } from 'svelte/store';
import { PROVIDERS } from '../../domain/settings/index';

export class ChatSidebarUseCase {
    private isChatOpen = false;
    public messages: Writable<Message[]> = writable([]);
    private isLoading: Writable<boolean> = writable(false);

    // Chatlog state
    public currentChatlogId: Writable<string | null> = writable(null);
    private currentModel: string = '';
    private currentProvider: string = '';

    // History modal state (shared between ChatInterface and ChatHeaderActions)
    private historyModalOpen: Writable<boolean> = writable(false);

    constructor(
        private sidebarInjector: SidebarInjector,
        private aiService: IAIService,
        private chatlogService?: ChatlogService
    ) { }

    openChat() {
        if (this.isChatOpen) return;
        this.isChatOpen = true;

        if (get(this.messages).length === 0) {
            this.messages.set([
                { id: '1', role: 'assistant', content: "Hello! I'm your AI assistant. I can help you research, write, and critique content.", personality: 'Agent' }
            ]);
        }

        this.sidebarInjector.injectIntoSidebar(ChatContainer, {
            messages: this.messages,
            isLoading: this.isLoading,
            currentChatlogId: this.currentChatlogId,
            historyModalOpen: this.historyModalOpen,
            onSendMessage: (text: string, modelId: string, providerId: string, merge: boolean) => this.handleUserMessage(text, modelId, providerId, merge),
            onClose: () => {
                this.isChatOpen = false;
            },
            onNewChat: () => this.newChat(),
            onLoadChatlog: (id: string) => this.loadChatlog(id),
            onListChatlogs: () => this.listChatlogs(),
            onDeleteChatlog: (id: string) => this.deleteChatlog(id),
            headerActions: ChatHeaderActions,
            headerActionsProps: {
                onReset: () => this.resetChat(),
                onHistoryClick: () => this.historyModalOpen.set(true)
            }
        }, "Doc Agent", '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-message-2" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 20l-3 -3h-2a3 3 0 0 1 -3 -3v-6a3 3 0 0 1 3 -3h10a3 3 0 0 1 3 3v6a3 3 0 0 1 -3 3h-2l-3 3" /><path d="M8 9l8 0" /><path d="M8 13l6 0" /></svg>');
    }

    /**
     * Start a new chat session
     */
    newChat() {
        this.currentChatlogId.set(null);
        this.messages.set([
            { id: Date.now().toString(), role: 'assistant', content: "Hello! I'm your AI assistant. I can help you research, write, and critique content.", personality: 'Agent' }
        ]);
        this.isLoading.set(false);
        // Reset title cache for new chat - handled by service
    }

    resetChat() {
        this.newChat();
    }

    /**
     * Load a chatlog by ID
     */
    async loadChatlog(id: string): Promise<boolean> {
        if (!this.chatlogService) {
            console.warn('[ChatSidebarUseCase] ChatlogService not available');
            return false;
        }

        try {
            const entry = await this.chatlogService.loadChatlog(id);
            if (entry) {
                this.currentChatlogId.set(id);
                this.messages.set(entry.messages);
                this.currentModel = entry.metadata.model || '';
                this.currentProvider = entry.metadata.provider || '';
                return true;
            }
            return false;
        } catch (error) {
            console.error('[ChatSidebarUseCase] Error loading chatlog:', error);
            return false;
        }
    }

    /**
     * List all available chatlogs
     */
    async listChatlogs(): Promise<ChatlogMetadata[]> {
        if (!this.chatlogService) {
            return [];
        }
        return this.chatlogService.listChatlogs();
    }

    /**
     * Delete a chatlog
     */
    async deleteChatlog(id: string): Promise<void> {
        if (!this.chatlogService) return;
        await this.chatlogService.deleteChatlog(id);
    }

    /**
     * Request to save current chat session.
     * Delegates to ChatlogService which handles concurrency and title generation.
     */
    private async requestSave(modelId: string, providerId: string): Promise<void> {
        if (!this.chatlogService) return;

        let id = get(this.currentChatlogId);
        const msgs = get(this.messages);

        if (!id) {
            // Create new chatlog - generate ID here so we can track it
            id = this.chatlogService.generateId();
            this.currentChatlogId.set(id);
        }

        await this.chatlogService.requestSave(id, msgs, modelId, providerId);
    }

    private async handleUserMessage(text: string, modelId: string, providerId: string, merge: boolean) {
        // 1. Add User Message
        this.updateMessages(msgs => [...msgs, {
            id: Date.now().toString(),
            role: 'user',
            content: text
        }]);

        // 2. Start Loading
        this.isLoading.set(true);

        const aiMsgId = (Date.now() + 1).toString();

        try {
            // Initial Empty Message
            this.updateMessages(msgs => [...msgs, {
                id: aiMsgId,
                role: 'assistant',
                content: '',
                personality: 'Agent',
                parts: [] // Start with empty parts
            }]);

            // 3. Call AI Service
            // Pass current history including the new user message
            // Note: handleUserMessage has already added the user message to the store, so get(this.messages) includes it.
            const currentMessages = get(this.messages);
            const stream = await this.aiService.streamAgent(currentMessages, modelId, providerId, merge);

            let currentText = "";
            let currentParts: any[] = [];

            // 4. Consume Stream
            try {
                for await (const chunk of stream) {
                    const partType = (chunk as any).type;


                    if (partType === 'text-delta') {

                        const textDelta = (chunk as any).text || (chunk as any).textDelta || "";
                        currentText += textDelta;
                        // Update the last message content (legacy) AND parts.

                        // Logic for parts: Update the last "content" part or add a new one if the last one wasn't content
                        if (currentParts.length === 0 || currentParts[currentParts.length - 1].type !== 'content') {
                            currentParts.push({ type: 'content', text: textDelta });
                        } else {
                            const lastIdx = currentParts.length - 1;
                            const lastPart = currentParts[lastIdx];
                            currentParts[lastIdx] = { ...lastPart, text: lastPart.text + textDelta };
                        }

                    } else if (partType === 'tool-call') {
                        const toolCall = chunk as any;
                        currentParts.push({
                            type: 'tool_call',
                            toolCallId: toolCall.toolCallId,
                            toolName: toolCall.toolName,
                            toolArgs: toolCall.args || toolCall.input
                        });
                    } else if (partType === 'tool-result') {
                        const toolResult = chunk as any;
                        currentParts.push({
                            type: 'tool_result',
                            toolCallId: toolResult.toolCallId,
                            toolName: toolResult.toolName,
                            toolResult: toolResult.result || toolResult.output
                        });
                    } else if (partType === 'reasoning-delta') {
                        // Optional: Handle reasoning if you want to show it
                        const reasoningDelta = (chunk as any).textDelta; // or 'text' depending on sdk version
                        if (currentParts.length === 0 || currentParts[currentParts.length - 1].type !== 'reasoning') {
                            currentParts.push({ type: 'reasoning', text: reasoningDelta });
                        } else {
                            currentParts[currentParts.length - 1].text += reasoningDelta;
                        }
                    }

                    // Update the store
                    this.updateMessages(msgs => msgs.map(m => m.id === aiMsgId ? {
                        ...m,
                        content: currentText, // Keep simple content synced for legacy/simple views
                        parts: [...currentParts]
                    } : m));
                }
            } catch (streamError) {
                console.error('[ChatSidebar] Error consuming stream:', streamError);
                throw streamError;
            }

        } catch (error) {
            console.error('[ChatSidebar] Error getting AI response:', error);
            this.updateMessages(msgs => msgs.map(m => m.id === aiMsgId ? {
                ...m,
                content: `**Error:** Failed to get response. ${(error as any).message || error}`
            } : m));
        } finally {
            this.isLoading.set(false);
            // Auto-save chatlog after response
            this.requestSave(modelId, providerId);
        }
    }

    private updateMessages(fn: (msgs: Message[]) => Message[]) {
        this.messages.update(fn);
    }
}
