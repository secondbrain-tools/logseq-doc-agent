export interface Prompt {
    id: string; // The UUID of the block
    content: string; // The text content of the prompt
    type: string; // Extensible type
}

export interface FeedbackPrompt extends Prompt {
    type: 'feedback';
    // Potential future expansion: criteria extracted from content or children
}

/**
 * Represents a single block or a parent block with nested children.
 * If an array, the first element is the block's text, and the rest are its children.
 */
export type PromptBlockNode = string | [string, ...PromptBlockNode[]];
