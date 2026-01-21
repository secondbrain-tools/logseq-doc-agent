import type { Message } from '../../domain/chat/types';

export interface IAIService {
    /**
     * Streams a response from the AI model.
     * @param messages The full history of messages.
     * @param modelId The identifier of the model to use (e.g. 'gpt-4o', 'claude-3-5-sonnet-20240620').
     * @param providerId The identifier of the provider (e.g. 'openai', 'anthropic').
     */
    streamResponse(messages: Message[], modelId: string, providerId: string): Promise<ReadableStream<any>>;
}
