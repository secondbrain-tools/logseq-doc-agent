/**
 * Pure text manipulation utilities for the chat textarea.
 * Extracted for testability — no DOM or component dependencies.
 */

/**
 * Removes the slash command trigger and typed filter from the input text
 * after a prompt has been selected via the prompt picker.
 */
export function applyPromptSelection(
  inputText: string,
  lastSlash: number,
  promptFilter: string,
): string {
  if (lastSlash === -1) return inputText;
  const end = lastSlash + 1 + promptFilter.length;
  return inputText.substring(0, lastSlash) + inputText.substring(end);
}

/**
 * Replaces the typed trigger and partial name with the selected context
 * identifier, closing the bracket pair. Returns the new text and cursor
 * position to restore after the DOM update.
 *
 * @param inputText   - Current textarea value
 * @param trigger     - Opening bracket sequence, e.g. `[[` or `((`
 * @param closingTag  - Closing bracket sequence, e.g. `]]` or `))`
 * @param identifier  - The resolved name/id to insert
 * @param filterLength - Length of the partial text already typed after the trigger
 */
export function applyContextSelection(
  inputText: string,
  trigger: string,
  closingTag: string,
  identifier: string,
  filterLength: number,
): { text: string; cursorPos: number } {
  const lastTrigger = inputText.lastIndexOf(trigger);
  if (lastTrigger === -1) {
    return { text: inputText, cursorPos: inputText.length };
  }

  const before = inputText.substring(0, lastTrigger + 2);
  const after = inputText.substring(lastTrigger + 2 + filterLength);

  let finalAfter: string;
  if (after.startsWith(closingTag)) {
    finalAfter = after;
  } else if (after.startsWith(closingTag.substring(0, 1))) {
    finalAfter = closingTag.substring(1) + after.substring(1);
  } else {
    finalAfter = closingTag + after;
  }

  return {
    text: before + identifier + finalAfter,
    cursorPos: lastTrigger + 2 + identifier.length + closingTag.length,
  };
}
