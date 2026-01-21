import type { SidebarInjector } from '../ports/sidebar-injector';
import ChatContainer from '../../ui/components/ChatContainer.svelte';
import { type Message } from '../../ui/components/ChatInterface.svelte'; // Import types

// Rewriting file with STORE approach for reactivity
import { writable, type Writable } from 'svelte/store';
import { PROVIDERS } from '../../domain/settings/index';

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

        this.sidebarInjector.injectIntoSidebar(ChatContainer, {
            messages: this.messages,
            isLoading: this.isLoading,
            onSendMessage: (text: string, modelId: string) => this.handleUserMessage(text, modelId),
            onClose: () => {
                this.isChatOpen = false;
            }
        }, "AI Assistant", "ti-message");
    }

    private async handleUserMessage(text: string, modelId: string) {
        // 1. Add User Message
        this.updateMessages(msgs => [...msgs, {
            id: Date.now().toString(),
            role: 'user',
            content: text
        }]);

        // 2. Start Loading
        this.isLoading.set(true);

        // Determine if streaming is disabled
        let disableStreaming = false;
        try {
            const settings = (window as any).logseq?.settings || {};

            // Find provider for this model
            let providerId = 'openai'; // default
            for (const p of PROVIDERS) {
                if (p.models.some(m => m.value === modelId)) {
                    providerId = p.id;
                    break;
                }
                // Check custom models if relevant, but for now we assume modelId matches known or custom ones associated with provider
                // Actually custom models are added to PROVIDERS structure or just saved in settings? 
                // Creating a custom model saves it to `custom_models` setting but doesn't add it to PROVIDERS constant.
                // We need to check custom models setting to find provider for custom model?
                // Or just loop all providers and check if settings `disable_streaming_${p.id}_${modelId}` is true?
                // The setting key relies on provider ID.
                // If it's a custom model, we might have to search where it belongs.
                // For simplicity, let's assume we can check all providers for the setting key presence?
                // Or better, let's check `custom_models` setting to find the provider.
            }
            // Better fallback/lookup:
            const customModelsJson = settings['custom_models'];
            let customModels: Record<string, string[]> = {};
            try { customModels = JSON.parse(customModelsJson || '{}'); } catch (e) { }

            // If not found in static providers, check custom
            if (!PROVIDERS.some(p => p.models.some(m => m.value === modelId))) {
                for (const pid in customModels) {
                    if (customModels[pid].includes(modelId)) {
                        providerId = pid;
                        break;
                    }
                }
            }

            disableStreaming = settings[`disable_streaming_${providerId}_${modelId}`] === true;
            console.log(`[ChatSidebar] Model: ${modelId}, Provider: ${providerId}, Disable Streaming: ${disableStreaming}`);

        } catch (e) {
            console.error('Error checking settings:', e);
        }

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

            // Simulate response
            const response = `I can help with **${text}**. (Model: ${modelId})`;
            const reasoning = "Analyzing user intent...";

            if (disableStreaming) {
                // Instant response after delay
                await new Promise(r => setTimeout(r, 1000)); // Simulate network latency

                this.updateMessages(msgs => msgs.map(m => m.id === aiMsgId ? {
                    ...m,
                    parts: [
                        { type: 'reasoning', text: reasoning, isCollapsed: true },
                        { type: 'content', text: response }
                    ]
                } : m));

            } else {
                // Streaming
                this.updateMessages(msgs => msgs.map(m => m.id === aiMsgId ? {
                    ...m,
                    parts: [{ type: 'reasoning', text: reasoning, isCollapsed: true }]
                } : m));

                await new Promise(r => setTimeout(r, 800));

                this.updateMessages(msgs => msgs.map(m => m.id === aiMsgId ? {
                    ...m,
                    parts: [
                        ...m.parts!,
                        { type: 'content', text: response }
                    ]
                } : m));
            }

            this.isLoading.set(false);

        }, 500);
    }

    private updateMessages(fn: (msgs: Message[]) => Message[]) {
        this.messages.update(fn);
    }
}
