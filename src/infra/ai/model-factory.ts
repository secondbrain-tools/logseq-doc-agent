
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

export class ModelFactory {
    private models: Map<string, LanguageModel> = new Map();

    public getModel(modelId: string, providerId: string): LanguageModel {
        const key = `${providerId}:${modelId}`;
        if (this.models.has(key)) {
            return this.models.get(key)!;
        }

        const model = this.createModel(modelId, providerId);
        this.models.set(key, model);
        return model;
    }

    private createModel(modelId: string, providerId: string): LanguageModel {
        // Access logseq settings from window object safely
        const logseq = (window as any).logseq;
        const settings = logseq?.settings || {};

        // Note: Settings keys are defined in src/domain/settings/index.ts and are camelCase
        // e.g. 'openaiApiKey', 'anthropicApiKey'
        const apiKey = settings[`${providerId}ApiKey`] as string;

        if (!apiKey) {
            throw new Error(`API key for provider ${providerId} not found in settings.`);
        }

        let model: LanguageModel;
        if (providerId === 'openai') {
            const openai = createOpenAI({
                apiKey: apiKey,
            });
            model = openai(modelId);
        } else if (providerId === 'anthropic') {
            const anthropic = createAnthropic({
                apiKey: apiKey,
            });
            model = anthropic(modelId);
        } else {
            throw new Error(`Provider ${providerId} not supported yet.`);
        }

        return model;
    }

    public isStreamingDisabled(modelId: string, providerId: string): boolean {
        const logseq = (window as any).logseq;
        const settings = logseq?.settings || {};
        const disableStreamingKey = `disable_streaming_${providerId}_${modelId}`;
        return settings[disableStreamingKey] === true;
    }
}
