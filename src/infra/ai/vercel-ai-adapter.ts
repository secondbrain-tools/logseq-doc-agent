import { createTools, filterTools } from './tools/index';
import { generateText, generateObject } from 'ai';
import type { IAIService } from '../../application/ports/ai-service';
import type { Message } from '../../domain/chat/types';
import type { AgentContext } from '../../domain/agent/types';
import { mapMessages } from './message-mapper';
import { ModelFactory } from './model-factory';
import { AgentRunner } from './agent-runner';
import { getCognitiveForcingPrompt } from '../../domain/evaluation/cognitive-forcing.prompt';
import { ChatlogReplayAIService } from './chatlog-replay-ai';

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
        // E2E TEST REPLAY: If a pre-scripted chatlog was injected, delegate to the replay service
        const win = (window as any);
        if (win.__LDA_REPLAY_CHATLOG__) {
            console.log('[VercelAIAdapter] Replay chatlog detected — delegating to ChatlogReplayAIService');
            const mergeDefault = this.settingsAdapter.get<boolean>('get_merged_content_default', true);
            const mergeBoth = this.settingsAdapter.get<boolean>('get_merged_content_both', false);
            const tools = createTools({ merge, mergeDefault, mergeBoth });
            const replayService = new ChatlogReplayAIService(win.__LDA_REPLAY_CHATLOG__, tools);
            // Consume the chatlog so subsequent calls don't replay again
            delete win.__LDA_REPLAY_CHATLOG__;
            return replayService.streamAgent(messages, modelId, providerId, merge, reasoningEffort, agentContext, signal);
        }

        console.log('[VercelAIAdapter] streamAgent called', {
            modelId,
            providerId,
            merge,
            reasoningEffort,
            agentName: agentContext?.agentName
        });

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

    async generateText(messages: Message[], modelId: string, providerId: string, signal?: AbortSignal): Promise<string> {
        console.log('[VercelAIAdapter] generateText called', { modelId, providerId });

        const model = this.modelFactory.getModel(modelId, providerId);
        const coreMessages = mapMessages(messages);

        const result = await generateText({
            model,
            messages: coreMessages,
            abortSignal: signal
        });

        return result.text;
    }

    async generateObject<T>(messages: Message[], schema: any, modelId: string, providerId: string, signal?: AbortSignal): Promise<T> {
        console.log('[VercelAIAdapter] generateObject called', { modelId, providerId });

        const model = this.modelFactory.getModel(modelId, providerId);
        const coreMessages = mapMessages(messages);

        const result = await generateObject({
            model,
            schema,
            messages: coreMessages,
            abortSignal: signal
        });

        return result.object as T;
    }

    dispose() {
        // No persistent resources currently, but added for consistency
    }
}

