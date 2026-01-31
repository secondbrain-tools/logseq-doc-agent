
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { wrapLanguageModel, extractReasoningMiddleware, type LanguageModel } from 'ai';

export interface ModelConfig {
    model: LanguageModel;
    options: any;
}

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
        } else if (providerId === 'google') {
            const google = createGoogleGenerativeAI({
                apiKey: apiKey,
            });
            model = google(modelId);
        } else if (providerId === 'mistral') {
            const mistral = createMistral({
                apiKey: apiKey,
            });
            // Raw model, middleware applied in configureModel if needed
            model = mistral(modelId);
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

    public configureModel(modelId: string, providerId: string, reasoningEffort: 'none' | 'low' | 'medium' | 'high' | undefined): ModelConfig {
        let model = this.getModel(modelId, providerId);
        const options: any = {
            providerOptions: {}
        };

        if (!reasoningEffort || reasoningEffort === 'none') {
            return { model, options: {} };
        }

        if (providerId === 'openai') {
            options.providerOptions.openai = {
                reasoningEffort: reasoningEffort,
                reasoningSummary: 'auto'
            };
        } else if (providerId === 'anthropic') {
            options.providerOptions.anthropic = {
                effort: reasoningEffort
            };
        } else if (providerId === 'google') {
            options.providerOptions.google = {
                thinkingConfig: {
                    thinkingLevel: reasoningEffort,
                    includeThoughts: true,
                },
            };
        } else if (providerId === 'mistral') {
            // Mistral requires middleware for reasoning extraction
            model = wrapLanguageModel({
                model: model as any, // Cast to any to bypass strict type check for now, assuming compatible underlying model
                middleware: extractReasoningMiddleware({
                    tagName: 'think',
                }),
            });
        }

        return { model, options };
    }
}
