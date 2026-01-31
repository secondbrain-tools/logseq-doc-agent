import type { Message } from '../../domain/chat/types';

export interface IAIService {
    /**
     * Streams a response from the AI model (Agent mode with tools).
     * @param messages The full history of messages.
     * @param modelId The identifier of the model to use.
     * @param providerId The identifier of the provider.
     */
    streamAgent(messages: Message[], modelId: string, providerId: string, merge?: boolean, reasoningEffort?: 'none' | 'low' | 'medium' | 'high'): Promise<ReadableStream<any>>;

    /**
     * Generates a simple text response (No tools, no streaming).
     * @param messages The full history of messages.
     * @param modelId The identifier of the model to use.
     * @param providerId The identifier of the provider.
     */
    generateText(messages: Message[], modelId: string, providerId: string): Promise<string>;
}
