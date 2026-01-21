import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { streamText } from 'ai';
import type { IAIService } from '../../application/ports/ai-service';
import type { Message } from '../../domain/chat/types';
import { PROVIDERS, getProviderForModel } from '../../domain/settings/index';

export class VercelAIAdapter implements IAIService {
    async streamResponse(messages: Message[], modelId: string, providerId: string): Promise<ReadableStream<any>> {
        const settings = (window as any).logseq?.settings || {};


        const apiKeyKey = PROVIDERS.find(p => p.id === providerId)?.apiKeySettingKey;
        const apiKey = apiKeyKey ? settings[apiKeyKey] : undefined;

        if (!apiKey) {
            throw new Error(`API Key for provider '${providerId}' is missing. Please configure it in settings.`);
        }

        const model = this.createModel(providerId, modelId, apiKey);

        const coreMessages = this.mapMessages(messages);

        const result = await streamText({
            model,
            messages: coreMessages,
        });

        return result.textStream;
    }



    private createModel(providerId: string, modelId: string, apiKey: string) {
        switch (providerId) {
            case 'openai':
                const openai = createOpenAI({ apiKey });
                return openai(modelId);
            case 'anthropic':
                const anthropic = createAnthropic({ apiKey });
                return anthropic(modelId);
            case 'google':
                const google = createGoogleGenerativeAI({ apiKey });
                return google(modelId);
            case 'mistral':
                const mistral = createMistral({ apiKey });
                return mistral(modelId);
            default:
                throw new Error(`Provider '${providerId}' not supported yet.`);
        }
    }

    private mapMessages(messages: Message[]): any[] {
        return messages.map(m => {
            // Simple text content mapping for now
            // TODO: Handle MessageParts (images, tool calls) when fully implemented
            return {
                role: m.role as any, // 'user' | 'assistant' | 'system'
                content: m.content
            };
        });
    }
}
