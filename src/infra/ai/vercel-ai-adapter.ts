import { createTools } from './tools/index';
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

    async streamResponse(messages: Message[], modelId: string, providerId: string, merge: boolean = true): Promise<ReadableStream<any>> {
        console.log('[VercelAIAdapter] streamResponse called', { modelId, providerId, merge });

        const disableStreaming = this.modelFactory.isStreamingDisabled(modelId, providerId);
        const model = this.modelFactory.getModel(modelId, providerId);
        const toolsMap = createTools({ merge });
        const coreMessages = mapMessages(messages);

        const runner = new AgentRunner(model, toolsMap, coreMessages, disableStreaming);
        return runner.run();
    }
}
