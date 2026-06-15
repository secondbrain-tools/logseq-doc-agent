export interface Prompt {
  id: string; // The UUID of the block
  content: string; // The text content of the prompt
  type: string; // Extensible type
}

export interface FeedbackPrompt extends Prompt {
  type: "feedback";
  // Potential future expansion: criteria extracted from content or children
}
