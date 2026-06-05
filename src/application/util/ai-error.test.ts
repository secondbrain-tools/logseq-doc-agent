import { describe, it, expect } from "vitest";
import { normalizeAiErrorMessage } from "./ai-error";

describe("normalizeAiErrorMessage", () => {
  it("returns a generic message for null/undefined errors", () => {
    expect(normalizeAiErrorMessage(null)).toBe("An unknown error occurred.");
    expect(normalizeAiErrorMessage(undefined)).toBe("An unknown error occurred.");
  });

  it("returns the message property for generic Error objects", () => {
    const error = new Error("Something went wrong");
    expect(normalizeAiErrorMessage(error)).toBe("Something went wrong");
  });

  it("handles numeric status codes with generic hints", () => {
    const error = { statusCode: 401, message: "Unauthorized" };
    expect(normalizeAiErrorMessage(error)).toContain("Check that the API key is correct.");

    const error404 = { statusCode: 404, message: "Not Found" };
    expect(normalizeAiErrorMessage(error404)).toContain(
      "Check the provider base URL and model ID.",
    );

    const error429 = { statusCode: 429, message: "Too Many Requests" };
    expect(normalizeAiErrorMessage(error429)).toContain("Rate limit reached");

    const error500 = { statusCode: 500, message: "Internal Server Error" };
    expect(normalizeAiErrorMessage(error500)).toContain("The provider returned a server error");
  });

  it("includes URL origin in the message if provided", () => {
    const error = {
      statusCode: 400,
      message: "Bad Request",
      url: "http://127.0.0.1:11434/v1/chat/completions",
    };
    const result = normalizeAiErrorMessage(error);
    expect(result).toContain("(http://127.0.0.1:11434)");
  });

  it('appends detailed message if it provides extra context (e.g., Ollama "tools not supported")', () => {
    const error = {
      statusCode: 400,
      message: "registry.ollama.ai/library/gemma3:latest does not support tools",
      url: "http://127.0.0.1:11434/v1/chat/completions",
    };
    const result = normalizeAiErrorMessage(error);

    // Current behavior (this test will fail initially if I expect the new behavior)
    // expect(result).toBe('Request failed with status 400 (http://127.0.0.1:11434). Check the provider settings.');

    // Desired behavior:
    expect(result).toContain("does not support tools");
  });

  it('does not append detailed message if it is just the status code or generic "Bad Request"', () => {
    const error = { statusCode: 400, message: "Bad Request" };
    const result = normalizeAiErrorMessage(error);
    expect(result).not.toContain("Details:");

    const error2 = { statusCode: 400, message: "400" };
    expect(normalizeAiErrorMessage(error2)).not.toContain("Details:");
  });
});
