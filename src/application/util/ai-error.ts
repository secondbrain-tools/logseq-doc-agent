/**
 * Normalizes an unknown error thrown by the Vercel AI SDK (or any HTTP layer)
 * into a short, actionable message suitable for display in the chat UI.
 *
 * Handles:
 *   - AI SDK `AI_APICallError` shape (has `statusCode`, `url`, `message`)
 *   - Generic Error objects
 *   - Anything else (falls back to String())
 */
export function normalizeAiErrorMessage(error: unknown): string {
  if (error == null) return "An unknown error occurred.";

  const e = error as Record<string, any>;

  const statusCode: number | undefined =
    typeof e.statusCode === "number" ? e.statusCode : undefined;
  const rawMessage: string = typeof e.message === "string" ? e.message : String(error);
  const url: string | undefined = typeof e.url === "string" ? e.url : undefined;

  if (statusCode !== undefined) {
    let hint = "";
    if (statusCode === 401 || statusCode === 403) {
      hint = "Check that the API key is correct.";
    } else if (statusCode === 404) {
      hint = "Check the provider base URL and model ID.";
    } else if (statusCode === 429) {
      hint = "Rate limit reached — try again later.";
    } else if (statusCode >= 500) {
      hint = "The provider returned a server error — try again or check its status page.";
    } else {
      hint = "Check the provider settings.";
    }

    let urlHint = "";
    if (url) {
      try {
        urlHint = ` (${new URL(url).origin})`;
      } catch {
        // ignore malformed URLs
      }
    }

    const hasDetailedMessage =
      rawMessage &&
      !rawMessage.toLowerCase().includes(`status ${statusCode}`) &&
      rawMessage !== String(statusCode) &&
      rawMessage.toLowerCase() !== "bad request";

    const details = hasDetailedMessage ? ` Details: ${rawMessage}` : "";

    return `Request failed with status ${statusCode}${urlHint}. ${hint}${details}`;
  }

  return rawMessage || "An unknown error occurred.";
}
