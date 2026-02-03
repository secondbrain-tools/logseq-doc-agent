import type { SidebarInjector } from '../ports/sidebar-injector';
import ChatContainer from '../../ui/components/chat/ChatContainer.svelte';
import ChatHeaderActions from '../../ui/components/chat/ChatHeaderActions.svelte';
import type { Message } from '../../domain/chat/types';
import type { IAIService } from '../ports/ai-service';
import type { ChatlogService } from '../services/chatlog.service';
import type { ChatlogMetadata } from '../../domain/chatlog/types';
import type { IAgentRepository } from '../ports/agent-repository';
import type { AgentDefinition, AgentContext } from '../../domain/agent/types';

// Rewrite file with STORE approach for reactivity
import { writable, type Writable, get } from 'svelte/store';
import { PROVIDERS } from '../../domain/settings/index';
import { getContextContent, type ContextItem } from '../../infra/logseq/context-utils';

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

    // Agent state
    public agents: Writable<AgentDefinition[]> = writable([]);
    public selectedAgent: Writable<string> = writable('');

    constructor(
        private sidebarInjector: SidebarInjector,
        private aiService: IAIService,
        private chatlogService?: ChatlogService,
        private agentRepository?: IAgentRepository
    ) { }

    /**
     * Load available agents from repository
     */
    async loadAgents(): Promise<void> {
        if (!this.agentRepository) {
            console.warn('[ChatSidebarUseCase] AgentRepository not available');
            return;
        }

        try {
            const agentList = await this.agentRepository.getAllAgents();
            this.agents.set(agentList);

            // Select default agent if none selected
            const currentSelected = get(this.selectedAgent);
            if (!currentSelected || !agentList.find(a => a.name === currentSelected)) {
                const defaultAgent = await this.agentRepository.getDefaultAgent();
                if (defaultAgent) {
                    this.selectedAgent.set(defaultAgent.name);
                } else if (agentList.length > 0) {
                    // Fallback to first agent alphabetically
                    const sorted = [...agentList].sort((a, b) => a.name.localeCompare(b.name));
                    this.selectedAgent.set(sorted[0].name);
                }
            }

            console.log(`[ChatSidebarUseCase] Loaded ${agentList.length} agents`);
        } catch (error) {
            console.error('[ChatSidebarUseCase] Error loading agents:', error);
        }
    }


    // Signal for focus request
    public focusSignal: Writable<number> = writable(0);
    // Signal for expand/collapse input request
    public expandSignal: Writable<number> = writable(0);



    private readonly TITLE = "Doc Agent";

    toggleExpand() {
        if (!this.isChatOpen) {
            this.openChat();
        }
        // Toggle Window Maximization
        this.sidebarInjector.toggleWindowMaximize(this.TITLE);
    }

    openChat(options?: { focus?: boolean }) {
        if (this.isChatOpen) {
            if (options?.focus) {
                this.focusSignal.update(n => n + 1);
            }
            return;
        }

        if (options?.focus) {
            this.focusSignal.update(n => n + 1);
        }

        this.isChatOpen = true;

        // Reset expand signal on new open to ensure clean state
        this.expandSignal.set(0);

        // Load agents on chat open
        this.loadAgents();

        // Don't show default greeting - agent prompt will provide context
        if (get(this.messages).length === 0) {
            this.messages.set([]);
        }

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
            agents: this.agents,
            selectedAgent: this.selectedAgent,

            focusSignal: this.focusSignal,
            expandSignal: this.expandSignal,
            onSendMessage: (text: string, modelId: string, providerId: string, merge: boolean, reasoningEffort?: 'none' | 'low' | 'medium' | 'high', agentName?: string, contextItems?: any[]) => this.handleUserMessage(text, modelId, providerId, merge, reasoningEffort, agentName, contextItems),
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
        }, "Doc Agent", '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-message-2" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 20l-3 -3h-2a3 3 0 0 1 -3 -3v-6a3 3 0 0 1 3 -3h10a3 3 0 0 1 3 3v6a3 3 0 0 1 -3 3h-2l-3 3" /><path d="M8 9l8 0" /><path d="M8 13l6 0" /></svg>', {
            onMaximize: () => {
                this.focusSignal.update(n => n + 1);
            }
        });
    }

    private updateSidebar() {
        if (!this.isChatOpen) return;
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
            agents: this.agents,
            selectedAgent: this.selectedAgent,

            focusSignal: this.focusSignal,
            expandSignal: this.expandSignal,
            onSendMessage: (text: string, modelId: string, providerId: string, merge: boolean, reasoningEffort?: 'none' | 'low' | 'medium' | 'high', agentName?: string, contextItems?: any[]) => this.handleUserMessage(text, modelId, providerId, merge, reasoningEffort, agentName, contextItems),
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
        }, "Doc Agent", '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-message-2" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 20l-3 -3h-2a3 3 0 0 1 -3 -3v-6a3 3 0 0 1 3 -3h10a3 3 0 0 1 3 3v6a3 3 0 0 1 -3 3h-2l-3 3" /><path d="M8 9l8 0" /><path d="M8 13l6 0" /></svg>', {
            onMaximize: () => {
                this.focusSignal.update(n => n + 1);
            }
        });
    }

    /**
     * Start a new chat session
     */
    newChat() {
        this.currentChatlogId.set(null);
        // Don't show default greeting - agent prompt provides context
        this.messages.set([]);
        this.isLoading.set(false);
        // Reload agents in case new ones were added
        this.loadAgents();
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
                // Reload agents when loading chatlog
                await this.loadAgents();
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

    /**
     * Build AgentContext from selected agent name
     */
    private buildAgentContext(agentName?: string): AgentContext | undefined {
        if (!agentName) return undefined;

        const agentList = get(this.agents);
        const agent = agentList.find(a => a.name === agentName);

        if (!agent) {
            console.warn(`[ChatSidebarUseCase] Agent not found: ${agentName}`);
            return undefined;
        }

        return {
            agentName: agent.name,
            prompt: agent.prompt,
            allowedTools: agent.tools
        };
    }

    private async handleUserMessage(text: string, modelId: string, providerId: string, merge: boolean, reasoningEffort?: 'none' | 'low' | 'medium' | 'high', agentName?: string, contextItems?: ContextItem[]) {
        // 0. Inject Context
        const parts: any[] = [];

        if (contextItems && contextItems.length > 0) {
            this.isLoading.set(true); // Show loading while fetching context
            try {
                for (const item of contextItems) {
                    const content = await getContextContent(item);
                    const formattedText = `\n\n--- Context: ${item.name} ---\n${content}\n---------------------------`;

                    parts.push({
                        type: 'context',
                        text: formattedText,
                        contextName: item.name,
                        contextContent: content
                    });
                }
            } catch (err) {
                console.error("Failed to fetch context", err);
                // proceed without context or maybe alert? proceeding for now.
            }
        }

        // 1. Add User Message
        // We use fullText for content if there are no parts, but here we want to separate them.
        // The user input 'text' goes to 'content'.

        // If we have context parts, we MUST add the text as a content part too
        if (parts.length > 0) {
            parts.unshift({
                type: "content",
                text: text
            });
        }
        this.updateMessages(msgs => [...msgs, {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            parts: parts.length > 0 ? parts : undefined
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

            // Build agent context if agent is selected
            const agentContext = this.buildAgentContext(agentName);

            const stream = await this.aiService.streamAgent(currentMessages, modelId, providerId, merge, reasoningEffort, agentContext);

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
