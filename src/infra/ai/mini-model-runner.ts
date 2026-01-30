import { PROVIDERS } from '../../domain/settings/index';
import type { IAIService } from '../../application/ports/ai-service';
import type { ITitleGenerator } from '../../application/ports/title-generator';
import type { ISettingsPort } from '../../application/ports/settings-port';

/**
 * Simple AI runner for quick, single-turn tasks using the mini model.
 * Delegates to the shared IAIService for actual generation.
 * Implements ITitleGenerator for use in domain services.
 */
export class MiniModelRunner implements ITitleGenerator {
    constructor(
        private aiService: IAIService,
        private settings: ISettingsPort
    ) { }

    /**
     * Get the configured mini model settings
     * (Kept here as it's specific to the 'Mini Model' concept)
     */
    private getMiniModelSettings(): { modelId: string; providerId: string } {
        const miniModel = this.settings.get('miniModel') as string;

        if (!miniModel) {
            // Fallback to first available model
            const defaultModel = this.settings.get('model') as string;
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
        try {
            const customModelsJson = this.settings.get('custom_models', '{}');
            const customModels = JSON.parse(customModelsJson);
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

        // Construct messages for the service
        const messages: any[] = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        return this.aiService.generateText(messages, modelId, providerId);
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
