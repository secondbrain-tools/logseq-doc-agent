import type { SidebarInjector } from '../ports/sidebar-injector';
import ChatContainer from '../../ui/components/ChatContainer.svelte';
import type { Message } from '../../domain/chat/types';
import type { IAIService } from '../ports/ai-service';

// Rewrite file with STORE approach for reactivity
import { writable, type Writable, get } from 'svelte/store';
import { PROVIDERS } from '../../domain/settings/index';

export class ChatSidebarUseCase {
    private isChatOpen = false;
    public messages: Writable<Message[]> = writable([]);
    private isLoading: Writable<boolean> = writable(false);

    constructor(
        private sidebarInjector: SidebarInjector,
        private aiService: IAIService
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
            onSendMessage: (text: string, modelId: string, providerId: string) => this.handleUserMessage(text, modelId, providerId),
            onClose: () => {
                this.isChatOpen = false;
            }
        }, "AI Assistant", "ti-message");
    }

    private async handleUserMessage(text: string, modelId: string, providerId: string) {
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
            const stream = await this.aiService.streamResponse(currentMessages, modelId, providerId);

            let accumulatedContent = "";

            // 4. Consume Stream
            for await (const chunk of stream) {
                accumulatedContent += chunk;

                // Update the last message (AI response)
                this.updateMessages(msgs => msgs.map(m => m.id === aiMsgId ? {
                    ...m,
                    content: accumulatedContent,
                    // If we want to use parts, we would update parts here.
                    // For now, mirroring content to parts if needed or just using content.
                    // The UI prefers parts if present, but falls back to content.
                    // Let's stick to updating content for now as VercelAIAdapter maps text stream.
                } : m));
            }

        } catch (error) {
            console.error('[ChatSidebar] Error getting AI response:', error);
            this.updateMessages(msgs => msgs.map(m => m.id === aiMsgId ? {
                ...m,
                content: `**Error:** Failed to get response. ${(error as any).message || error}`
            } : m));
        } finally {
            this.isLoading.set(false);
        }
    }

    private updateMessages(fn: (msgs: Message[]) => Message[]) {
        this.messages.update(fn);
    }
}
