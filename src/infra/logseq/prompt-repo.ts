import type { Prompt, FeedbackPrompt } from '../../domain/logseq';
import type { PromptRepository } from '../../application/ports/prompt-repo';
import type { LogseqApi } from '../../application/ports/logseq-ports';

export class LogseqPromptRepository implements PromptRepository {
    constructor(private logseqApi: LogseqApi) { }

    async getFeedbackPrompts(): Promise<FeedbackPrompt[]> {
        const blocks = await this.logseqApi.queryBlocks('(property :doc-agent-feedback-prompt)');

        if (!blocks || !Array.isArray(blocks)) {
            return [];
        }

        return blocks.map(block => ({
            id: block.uuid,
            content: block.content,
            type: 'feedback'
        }));
    }
}
