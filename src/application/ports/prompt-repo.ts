import type { Prompt, FeedbackPrompt } from "../../domain/logseq";
import type { ChatPrompt } from "../../domain/chat/prompt";

export interface PromptRepository {
  getFeedbackPrompts(): Promise<FeedbackPrompt[]>;
  getChatPrompts(): Promise<ChatPrompt[]>;
}
