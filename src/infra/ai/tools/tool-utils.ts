/**
 * Sanitizes a Logseq block ID input.
 * Handles IDs that might be passed as strings with a '#' prefix (e.g., "#123")
 * or numeric strings (e.g., "123").
 *
 * @param rawId The raw ID input (number or string).
 * @returns The sanitized ID as a number (if numeric/numeric string) or string (if UUID/other).
 */
export const sanitizeBlockId = (rawId: number | string): number | string => {
  if (typeof rawId === "number") {
    return rawId;
  }

  const trimmed = rawId.trim();
  if (trimmed.startsWith("#")) {
    const numberPart = trimmed.substring(1);
    if (!isNaN(Number(numberPart))) {
      return Number(numberPart);
    }
    // If it starts with # but isn't a number, return trimmed (e.g. #uuid?)
    return trimmed;
  }

  if (!isNaN(Number(trimmed)) && trimmed !== "") {
    // It's a numeric string like "123", convert to number
    return Number(trimmed);
  }

  return trimmed;
};

/**
 * Sanitizes block content to ensure compatibility with Logseq format.
 * Specifically replaces markdown list bullets '-' with '+' to avoid
 * Logseq interpreting them as nested blocks when pasting/updating.
 *
 * @param content The raw string content.
 * @returns The sanitized content string.
 */
export const sanitizeContent = (content: string): string => {
  // Replace lines starting with "- " (allowing for indentation) with "+ "
  // Regex: Start of line (^), optional whitespace (\s*), hyphen (-), one or more spaces (\s+)
  return content.replace(/^(\s*)-\s+/gm, "$1+ ");
};
