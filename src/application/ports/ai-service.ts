import type { Message } from '../../domain/chat/types';
import type { AgentContext } from '../../domain/agent/types';

export interface IAIService {
    /**
     * Streams a response from the AI model (Agent mode with tools).
     * @param messages The full history of messages.
     * @param modelId The identifier of the model to use.
     * @param providerId The identifier of the provider.
     * @param merge Whether to use merge mode for block operations.
     * @param reasoningEffort Optional reasoning effort level.
     * @param agentContext Optional agent context for tool filtering and system prompt.
     */
    streamAgent(
        messages: Message[],
        modelId: string,
        providerId: string,
        merge?: boolean,
        reasoningEffort?: 'none' | 'low' | 'medium' | 'high',
        agentContext?: AgentContext,
        signal?: AbortSignal
    ): Promise<ReadableStream<any>>;

    /**
     * Generates a simple text response (No tools, no streaming).
     * @param messages The full history of messages.
     * @param modelId The identifier of the model to use.
     * @param providerId The identifier of the provider.
     */
    generateText(messages: Message[], modelId: string, providerId: string, signal?: AbortSignal): Promise<string>;

    /**
     * Generates a strongly typed JSON object natively using a Zod schema.
     * @param messages The full history of messages.
     * @param schema The Zod schema to enforce.
     * @param modelId The identifier of the model to use.
     * @param providerId The identifier of the provider.
     */
    generateObject<T>(messages: Message[], schema: any, modelId: string, providerId: string, signal?: AbortSignal): Promise<T>;
}

