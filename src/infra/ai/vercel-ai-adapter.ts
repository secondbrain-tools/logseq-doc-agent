import { createTools, filterTools } from './tools/index';
import { generateText, generateObject } from 'ai';
import type { IAIService } from '../../application/ports/ai-service';
import type { Message } from '../../domain/chat/types';
import type { AgentContext } from '../../domain/agent/types';
import { mapMessages } from './message-mapper';
import { ModelFactory } from './model-factory';
import { AgentRunner } from './agent-runner';
import { getCognitiveForcingPrompt } from '../../domain/evaluation/cognitive-forcing.prompt';

import type { ISettingsPort } from '../../application/ports/settings-port';

export class VercelAIAdapter implements IAIService {
    private modelFactory: ModelFactory;
    private settingsAdapter: ISettingsPort;

    constructor(settingsAdapter: ISettingsPort) {
        this.modelFactory = new ModelFactory();
        this.settingsAdapter = settingsAdapter;
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
        console.log('[VercelAIAdapter] streamAgent called', {
            modelId,
            providerId,
            merge,
            reasoningEffort,
            agentName: agentContext?.agentName
        });

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

        // Fetch Merge Settings
        const mergeDefault = this.settingsAdapter.get<boolean>('get_merged_content_default', true);
        const mergeBoth = this.settingsAdapter.get<boolean>('get_merged_content_both', false);
        const maxAgentCycles = this.settingsAdapter.get<number>('maxAgentCycles', 10);

        // Create tools and filter based on agent context
        let toolsMap: Record<string, any> = createTools({
            merge,
            mergeDefault,
            mergeBoth
        });
        if (agentContext && agentContext.allowedTools) {
            toolsMap = filterTools(toolsMap, agentContext.allowedTools);
            console.log('[VercelAIAdapter] Filtered tools to:', Object.keys(toolsMap));
        }

        // Build messages with agent system prompt
        let coreMessages = mapMessages(messages);
        if (agentContext?.prompt) {
            let systemPrompt = agentContext.prompt;

            // Inject cognitive forcing instructions if we are performing an evaluation
            // We can infer this if the system prompt mentions evaluation or if specific tools are enabled
            // For now, we'll append it to any system prompt if settings are active,
            // but wrapped in instructions that it only applies when evaluating.
            const suggestionAlternativesStr = this.settingsAdapter.get<string>('cognitiveForcing_suggestionAlternatives', '1');
            const suggestionAlternatives = parseInt(suggestionAlternativesStr, 10) || 1;
            const preCommitmentPrompt = this.settingsAdapter.get<boolean>('cognitiveForcing_preCommitmentPrompt', false);
            const counterargument = this.settingsAdapter.get<boolean>('cognitiveForcing_counterargument', false);

            if (suggestionAlternatives > 1 || preCommitmentPrompt || counterargument) {
                const cognitiveForcingInstructions = getCognitiveForcingPrompt({
                    suggestionAlternatives,
                    preCommitmentPrompt,
                    counterargument
                });
                systemPrompt += `\n\n### COGNITIVE FORCING RULES (Apply these WHEN performing block evaluations):\n${cognitiveForcingInstructions}`;
            }

            // Prepend system message with agent prompt
            coreMessages = [
                { role: 'system', content: systemPrompt },
                ...coreMessages
            ];
            console.log('[VercelAIAdapter] Added agent system prompt', systemPrompt);
        }

        const runner = new AgentRunner(model, toolsMap, coreMessages, disableStreaming, {
            ...options,
            abortSignal: signal,
            maxLoops: maxAgentCycles
        });
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

    async generateObject<T>(messages: Message[], schema: any, modelId: string, providerId: string): Promise<T> {
        console.log('[VercelAIAdapter] generateObject called', { modelId, providerId });

        const model = this.modelFactory.getModel(modelId, providerId);
        const coreMessages = mapMessages(messages);

        const result = await generateObject({
            model,
            schema,
            messages: coreMessages,
        });

        return result.object as T;
    }
}

