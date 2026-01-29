import { generateText } from 'ai';
import { ModelFactory } from './model-factory';
import { PROVIDERS } from '../../domain/settings/index';

/**
 * Simple AI runner for quick, single-turn tasks using the mini model.
 * No streaming, no tools - just a simple prompt -> response.
 */
export class MiniModelRunner {
    private modelFactory: ModelFactory;

    constructor() {
        this.modelFactory = new ModelFactory();
    }

    /**
     * Get the configured mini model settings
     */
    private getMiniModelSettings(): { modelId: string; providerId: string } {
        const logseq = (window as any).logseq;
        const settings = logseq?.settings || {};
        const miniModel = settings['miniModel'] as string;

        if (!miniModel) {
            // Fallback to first available model
            const defaultModel = settings['model'] as string;
            if (defaultModel) {
                const providerId = this.findProviderForModel(defaultModel);
                return { modelId: defaultModel, providerId };
            }
            throw new Error('No mini model configured in settings');
        }

        const providerId = this.findProviderForModel(miniModel);
        return { modelId: miniModel, providerId };
    }

    /**
     * Find which provider a model belongs to
     */
    private findProviderForModel(modelId: string): string {
        for (const provider of PROVIDERS) {
            // Check built-in models
            if (provider.models.some(m => m.value === modelId)) {
                return provider.id;
            }
        }

        // Check custom models
        const logseq = (window as any).logseq;
        const settings = logseq?.settings || {};
        try {
            const customModels = JSON.parse(settings['custom_models'] || '{}');
            for (const [providerId, models] of Object.entries(customModels)) {
                if ((models as string[]).includes(modelId)) {
                    return providerId;
                }
            }
        } catch (e) {
            console.warn('[MiniModelRunner] Failed to parse custom_models:', e);
        }

        // Default to openai if we can't determine
        return 'openai';
    }

    /**
     * Simple text generation without tools or streaming
     */
    async generate(prompt: string, systemPrompt?: string): Promise<string> {
        const { modelId, providerId } = this.getMiniModelSettings();

        console.log('[MiniModelRunner] Generating with', { modelId, providerId });

        const model = this.modelFactory.getModel(modelId, providerId);

        const result = await generateText({
            model,
            system: systemPrompt,
            prompt,
        });

        return result.text;
    }

    /**
     * Generate a concise title from a user message
     */
    async generateTitle(userMessage: string): Promise<string> {
        const systemPrompt = `You are a concise title generator. Generate a brief, descriptive title (max 30 chars) for a conversation based on the user's first message. 
Output ONLY the title, no quotes, no explanations.`;

        const prompt = `Generate a title for this message: "${userMessage}"`;

        try {
            const title = await this.generate(prompt, systemPrompt);
            // Clean up the title - remove quotes if present
            return title.trim().replace(/^["']|["']$/g, '').substring(0, 50);
        } catch (error) {
            console.error('[MiniModelRunner] Error generating title:', error);
            // Fallback to truncated user message
            return userMessage.length > 47 ? userMessage.substring(0, 44) + '...' : userMessage;
        }
    }
}
