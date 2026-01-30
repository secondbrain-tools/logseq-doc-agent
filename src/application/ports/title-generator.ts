/**
 * Interface for generating titles from user messages
 */
export interface ITitleGenerator {
    /**
     * Generate a concise title from a user message
     * @param userMessage The first message content from the user
     */
    generateTitle(userMessage: string): Promise<string>;
}
