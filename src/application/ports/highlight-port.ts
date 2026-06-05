import type { TextQuoteSelector, Suggestion } from "../../domain/evaluation/entity";

export interface HighlightPort {
  /**
   * Highlights text ranges in the specified block based on the selectors.
   * Handles multiple selectors and child block references.
   * @param parentBlockId The ID of the block where the evaluation was triggered
   * @param selectors A list of text quotes and opitonal source IDs locating the text
   */
  highlight(
    parentBlockId: string,
    selectors: Array<{ selector: TextQuoteSelector; source_id?: string | null }>,
  ): void;

  /**
   * Removes all active highlights
   */
  clearHighlights(): void;

  /**
   * Previews a specific suggestion by applying inline DOM modifications
   * @param blockId The ID of the block where the evaluation was triggered
   * @param suggestion The suggestion to preview
   */
  previewSuggestion(blockId: string, suggestion: Suggestion): void;

  /**
   * Removes all active previews and restores original DOM content
   */
  clearPreview(): void;
}
