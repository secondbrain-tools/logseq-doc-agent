import type { IAIService } from '../../application/ports/ai-service';
import type { Message } from '../../domain/chat/types';
import type { AgentContext } from '../../domain/agent/types';

export class ChatlogReplayAIService implements IAIService {
    private chatlog: any;
    private toolsMap: Record<string, any>;

    constructor(chatlog: any, toolsMap: Record<string, any>) {
        this.chatlog = chatlog;
        this.toolsMap = toolsMap;
    }

    async streamAgent(
        messages: Message[],
        modelId: string,
        providerId: string,
        merge: boolean = true,
        reasoningEffort?: 'none' | 'low' | 'medium' | 'high',
        agentContext?: AgentContext,
        signal?: AbortSignal
    ): Promise<ReadableStream<any>> {
        console.log('[ChatlogReplayAIService] Replaying structured chatlog output');
        
        // Find the single intended assistant message from the recorded chatlog
        const assistantMsg = this.chatlog.messages.find((m: any) => m.role === 'assistant');

        if (!assistantMsg) {
            throw new Error(`[ChatlogReplayAIService] No assistant message found in remapped chatlog.`);
        }

        const tools = this.toolsMap;

        return new ReadableStream({
            async start(controller) {
                try {
                    for (const part of assistantMsg.parts) {
                        if (signal?.aborted) break;

                        switch (part.type) {
                            case 'reasoning':
                                controller.enqueue({ type: 'reasoning', textDelta: part.text });
                                break;
                            
                            case 'tool_call':
                            case 'tool-call':
                                console.log(`[ChatlogReplayAIService] Emitting tool-call & executing real tool: ${part.toolName}`);
                                
                                controller.enqueue({
                                    type: 'tool-call',
                                    toolCallId: part.toolCallId,
                                    toolName: part.toolName,
                                    args: part.toolArgs
                                });

                                const tool = tools[part.toolName];
                                if (!tool) {
                                    throw new Error(`[ChatlogReplayAIService] Tool ${part.toolName} not found in tools map.`);
                                }

                                // Execute real tool using remapped arguments!
                                // Ensure arguments are plain JSON to avoid Transit serialization errors in Logseq
                                const cleanArgs = JSON.parse(JSON.stringify(part.toolArgs));
                                const result = await tool.execute(cleanArgs, {});

                                controller.enqueue({
                                    type: 'tool-result',
                                    toolCallId: part.toolCallId,
                                    toolName: part.toolName,
                                    result: typeof result === 'string' ? result : JSON.stringify(result)
                                });
                                break;

                            case 'content':
                                controller.enqueue({ type: 'text-delta', textDelta: part.text });
                                break;

                            case 'tool_result':
                                // Skip recorded tool_results, as we generated our own fresh ones dynamically
                                break;
                        }
                    }
                } catch (e: any) {
                    controller.error(e);
                } finally {
                    controller.close();
                }
            }
        });
    }

    async generateText(): Promise<string> {
        throw new Error('[ChatlogReplayAIService] generateText not implemented for e2e replay mode.');
    }

    async generateObject<T>(): Promise<T> {
        throw new Error('[ChatlogReplayAIService] generateObject not implemented for e2e replay mode.');
    }

    dispose() {}
}
