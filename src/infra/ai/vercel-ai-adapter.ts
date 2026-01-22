import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { streamText, ToolLoopAgent } from 'ai';
import type { IAIService } from '../../application/ports/ai-service';
import type { Message } from '../../domain/chat/types';
import { PROVIDERS } from '../../domain/settings/index';
import { tools } from './tools';

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

        const agent = new ToolLoopAgent({
            model,
            tools,
        });

        const result = await agent.stream({
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
            if (m.role === 'user') {
                return {
                    role: 'user',
                    content: m.content
                };
            }

            if (m.role === 'assistant') {
                if (m.parts && m.parts.length > 0) {
                    const content = m.parts.map(p => {
                        if (p.type === 'tool_call') {
                            return {
                                type: 'tool-call',
                                toolCallId: p.toolCallId || 'unknown',
                                toolName: p.toolName,
                                args: p.toolArgs
                            };
                        }
                        // Default to text
                        return {
                            type: 'text',
                            text: p.text || (p.type === 'content' ? m.content : '')
                        };
                    }).filter(p => p.type === 'tool-call' || (p.type === 'text' && p.text !== undefined));

                    return { role: 'assistant', content };
                }
                return { role: 'assistant', content: m.content };
            }

            if (m.role === 'tool') {
                if (m.parts && m.parts.length > 0) {
                    const content = m.parts.map(p => {
                        if (p.type === 'tool_result') {
                            return {
                                type: 'tool-result',
                                toolCallId: p.toolCallId || 'unknown',
                                toolName: p.toolName,
                                result: p.toolResult
                            };
                        }
                        return null;
                    }).filter(Boolean);

                    return { role: 'tool', content };
                }
            }

            // Fallback for system or other roles (`system` role is supported by CoreMessage)
            return {
                role: m.role,
                content: m.content
            };
        });
    }
}
