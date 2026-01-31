import { createTools } from './tools/index';
import { generateText } from 'ai';
import type { IAIService } from '../../application/ports/ai-service';
import type { Message } from '../../domain/chat/types';
import { mapMessages } from './message-mapper';
import { ModelFactory } from './model-factory';
import { AgentRunner } from './agent-runner';

export class VercelAIAdapter implements IAIService {
    private modelFactory: ModelFactory;

    constructor() {
        this.modelFactory = new ModelFactory();
    }

    async streamAgent(messages: Message[], modelId: string, providerId: string, merge: boolean = true, reasoningEffort?: 'none' | 'low' | 'medium' | 'high'): Promise<ReadableStream<any>> {
        console.log('[VercelAIAdapter] streamAgent called', { modelId, providerId, merge, reasoningEffort });

        // VERIFICATION MOCK: Trigger tool call for specific prompt
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.content.includes('test tool')) {
            console.log('[VercelAIAdapter] Returning MOCK TOOL STREAM');
            return new ReadableStream({
                start(controller) {
                    controller.enqueue({ type: 'text-delta', textDelta: 'I will now run the test tool.\n' });

                    const toolCallId = 'call_' + Date.now();
                    const toolCall = {
                        type: 'tool-call',
                        toolCallId: toolCallId,
                        toolName: 'test-tool',
                        args: { query: 'verification' }
                    };
                    controller.enqueue(toolCall);

                    // Simulate async tool execution
                    setTimeout(() => {
                        controller.enqueue({
                            type: 'tool-result',
                            toolCallId: toolCallId,
                            toolName: 'test-tool',
                            result: 'Success: Tool executed verification.'
                        });

                        controller.enqueue({ type: 'text-delta', textDelta: '\nTool execution finished.' });
                        controller.close();
                    }, 500);
                }
            });
        }

        const disableStreaming = this.modelFactory.isStreamingDisabled(modelId, providerId);

        // Use ModelConfig via configureModel to handle middleware and provider options
        const { model, options } = this.modelFactory.configureModel(modelId, providerId, reasoningEffort);

        const toolsMap = createTools({ merge });
        const coreMessages = mapMessages(messages);

        const runner = new AgentRunner(model, toolsMap, coreMessages, disableStreaming, options);
        return runner.run();
    }

    async generateText(messages: Message[], modelId: string, providerId: string): Promise<string> {
        console.log('[VercelAIAdapter] generateText called', { modelId, providerId });

        const model = this.modelFactory.getModel(modelId, providerId);
        const coreMessages = mapMessages(messages);

        const result = await generateText({
            model,
            messages: coreMessages,
        });

        return result.text;
    }
}
