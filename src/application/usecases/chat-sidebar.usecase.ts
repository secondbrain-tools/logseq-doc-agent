import type { SidebarInjector } from '../ports/sidebar-injector';
import ChatInterface from '../../ui/components/ChatInterface.svelte';
import { type Message } from '../../ui/components/ChatInterface.svelte'; // Import types



// Rewriting file with STORE approach for reactivity
import { writable, type Writable } from 'svelte/store';

export class ChatSidebarUseCase {
    private isChatOpen = false;
    public messages: Writable<Message[]> = writable([]);
    private isLoading: Writable<boolean> = writable(false);

    constructor(
        private sidebarInjector: SidebarInjector
    ) { }

    openChat() {
        if (this.isChatOpen) return;
        this.isChatOpen = true;

        this.messages.set([
            { id: '1', role: 'assistant', content: "Hello! I'm your AI assistant. I can help you research, write, and critique content.", personality: 'Agent' }
        ]);

        this.sidebarInjector.injectIntoSidebar(ChatInterface, {
            messages: this.messages, // Pass the store! (Component needs to handle $messages or we pass the store itself)
            isLoading: this.isLoading,
            onSendMessage: (text: string) => this.handleUserMessage(text),
            onClose: () => {
                this.isChatOpen = false;
            }
        }, "AI Assistant", "ti-message");
    }

    private async handleUserMessage(text: string) {
        // 1. Add User Message
        this.updateMessages(msgs => [...msgs, {
            id: Date.now().toString(),
            role: 'user',
            content: text
        }]);

        // 2. Start Loading
        this.isLoading.set(true);

        // 3. Mock AI Response (Streaming simulation)
        // In real app, call AI Service here.
        setTimeout(async () => {
            const aiMsgId = (Date.now() + 1).toString();

            // Initial Empty Message
            this.updateMessages(msgs => [...msgs, {
                id: aiMsgId,
                role: 'assistant',
                content: '',
                personality: 'Agent',
                parts: []
            }]);

            // Simulate streaming
            const response = `I can help with **${text}**.`;
            const reasoning = "Analyzing user intent...";

            // Update with reasoning
            this.updateMessages(msgs => msgs.map(m => m.id === aiMsgId ? {
                ...m,
                parts: [{ type: 'reasoning', text: reasoning, isCollapsed: true }]
            } : m));

            await new Promise(r => setTimeout(r, 800));

            // Update with content partial
            this.updateMessages(msgs => msgs.map(m => m.id === aiMsgId ? {
                ...m,
                parts: [
                    ...m.parts!,
                    { type: 'content', text: response }
                ]
            } : m));

            this.isLoading.set(false);

        }, 500);
    }

    private updateMessages(fn: (msgs: Message[]) => Message[]) {
        this.messages.update(fn);
    }
}
