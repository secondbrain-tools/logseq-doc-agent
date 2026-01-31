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
    public isMergeOn: Writable<boolean> = writable(true);
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

        const toggleMerge = () => {
            this.isMergeOn.update(v => !v);
            // Re-inject sidebar to update the menu state?
            // Actually, Svelte should handle reactivity if we passed the store?
            // SidebarWindow Props: menuOptions is an array, not a store.
            // So we need to re-inject sidebar options when this changes?
            // Or we make menuOptions reactive in SidebarWindow?
            // The simplest 'mvp' way to update the menu visually (the checkmark) is to update the props.
            this.updateSidebar();
        };

        this.sidebarInjector.injectIntoSidebar(ChatContainer, {
            messages: this.messages,
            isLoading: this.isLoading,
            currentChatlogId: this.currentChatlogId,
            historyModalOpen: this.historyModalOpen,
            isMergeOn: this.isMergeOn,
            onSendMessage: (text: string, modelId: string, providerId: string, merge: boolean, reasoningEffort?: 'none' | 'low' | 'medium' | 'high') => this.handleUserMessage(text, modelId, providerId, merge, reasoningEffort),
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
            },
            menuOptions: [
                {
                    label: 'Merge',
                    action: toggleMerge,
                    checked: get(this.isMergeOn)
                }
            ]
        }, "Doc Agent", '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-message-2" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 20l-3 -3h-2a3 3 0 0 1 -3 -3v-6a3 3 0 0 1 3 -3h10a3 3 0 0 1 3 3v6a3 3 0 0 1 -3 3h-2l-3 3" /><path d="M8 9l8 0" /><path d="M8 13l6 0" /></svg>');
    }

    private updateSidebar() {
        if (!this.isChatOpen) return;
        // Re-inject to update menu options state (checked)
        // This is a bit heavy but ensures the checkmark updates in the non-reactive SidebarWindow prop
        // Ideally SidebarWindow would accept a store for options, but for now this works.
        const toggleMerge = () => {
            this.isMergeOn.update(v => !v);
            this.updateSidebar();
        };

        this.sidebarInjector.injectIntoSidebar(ChatContainer, {
            messages: this.messages,
            isLoading: this.isLoading,
            currentChatlogId: this.currentChatlogId,
            historyModalOpen: this.historyModalOpen,
            isMergeOn: this.isMergeOn,
            onSendMessage: (text: string, modelId: string, providerId: string, merge: boolean, reasoningEffort?: 'none' | 'low' | 'medium' | 'high') => this.handleUserMessage(text, modelId, providerId, merge, reasoningEffort),
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
            },
            menuOptions: [
                {
                    label: 'Merge',
                    action: toggleMerge,
                    checked: get(this.isMergeOn)
                }
            ]
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

    private async handleUserMessage(text: string, modelId: string, providerId: string, merge: boolean, reasoningEffort?: 'none' | 'low' | 'medium' | 'high') {
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
            const stream = await this.aiService.streamAgent(currentMessages, modelId, providerId, merge, reasoningEffort);

            let currentText = "";
            let currentParts: any[] = [];

            // 4. Consume Stream
            try {
                for await (const chunk of stream) {
                    const partType = (chunk as any).type;

                    if (partType === 'text-delta') {
                        // Collapse reasoning if switching to content
                        this.tryCollapseLastReasoning(currentParts, aiMsgId);

                        const textDelta = (chunk as any).text || (chunk as any).textDelta || "";
                        currentText += textDelta;
                        this.appendPartText(currentParts, 'content', textDelta);

                    } else if (partType === 'tool-call') {
                        // Collapse reasoning if switching to tool
                        this.tryCollapseLastReasoning(currentParts, aiMsgId);

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

                    } else if (partType === 'reasoning' || partType === 'reasoning-delta') {
                        console.log(`[ChatSidebar] ${partType} chunk:`, chunk); // DEBUG LOG

                        let reasoningDelta = "";
                        if (partType === 'reasoning') {
                            reasoningDelta = (chunk as any).textDelta || "";
                        } else {
                            // reasoning-delta fallback
                            reasoningDelta = (chunk as any).textDelta || (chunk as any).text || "";
                            if (!reasoningDelta && (chunk as any).textDelta === undefined && (chunk as any).text === undefined) {
                                console.warn('[ChatSidebar] Received reasoning-delta without textDelta or text', chunk);
                            }
                        }

                        this.appendPartText(currentParts, 'reasoning', reasoningDelta);
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

    private appendPartText(parts: any[], type: 'content' | 'reasoning', text: string) {
        if (parts.length === 0 || parts[parts.length - 1].type !== type) {
            parts.push({ type, text });
        } else {
            // Safe string concatenation
            const lastIdx = parts.length - 1;
            const current = parts[lastIdx].text || "";
            // IMMUTABLE UPDATE: Create a new object for the updated part
            parts[lastIdx] = { ...parts[lastIdx], text: current + text };
        }
    }

    private tryCollapseLastReasoning(parts: any[], aiMsgId: string) {
        if (parts.length === 0) return;

        const lastIdx = parts.length - 1;
        const lastPart = parts[lastIdx];

        if (lastPart.type === 'reasoning' && !lastPart.isCollapsed) {
            // Delayed collapse (2 seconds)
            setTimeout(() => {
                // Check strict bounds and type again in case of race/mutation
                // We re-access 'parts' via closure reference 'currentParts' from the caller, 
                // but here 'parts' is passed by reference.
                // Ideally we should double check against the ACTUAL store or just trust the ref if it's the same array object.
                // The caller passes 'currentParts' which is the array being mutated.
                // However, by the time this executes, 'parts' might have new items pushed. 
                // We specifically want to collapse parts[lastIdx].

                if (parts[lastIdx] && parts[lastIdx].type === 'reasoning') {
                    parts[lastIdx] = { ...parts[lastIdx], isCollapsed: true };
                    // Trigger store update to reflect change
                    this.updateMessages(msgs => msgs.map(m => m.id === aiMsgId ? {
                        ...m,
                        parts: [...parts]
                    } : m));
                }
            }, 2000);
        }
    }
}
