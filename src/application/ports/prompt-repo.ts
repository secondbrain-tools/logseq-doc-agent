import type { Prompt, FeedbackPrompt } from '../../domain/entities';

export interface PromptRepository {
    getFeedbackPrompts(): Promise<FeedbackPrompt[]>;
}
