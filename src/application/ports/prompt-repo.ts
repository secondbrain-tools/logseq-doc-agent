import type { Prompt, FeedbackPrompt } from '../../domain/logseq';

export interface PromptRepository {
    getFeedbackPrompts(): Promise<FeedbackPrompt[]>;
}
