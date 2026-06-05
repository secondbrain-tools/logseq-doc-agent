import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LegacyLogseqApi, detectLogseqRuntime } from "./logseq-runtime";

// Mock the global window.logseq object
const mockGetBlock = vi.fn();
const mockLogseq = {
  App: {},
  Editor: {
    getBlock: mockGetBlock,
  },
};

describe("LogseqApiImpl", () => {
  let api: LegacyLogseqApi;

  beforeEach(() => {
    // Setup global mock
    (window as any).logseq = mockLogseq;
    api = new LegacyLogseqApi();
    mockGetBlock.mockReset();
  });

  afterEach(() => {
    delete (window as any).logseq;
  });

  describe("getBlockText", () => {
    it("should return empty string if block is not found or has no content", async () => {
      mockGetBlock.mockResolvedValue(null);
      expect(await api.Editor.getBlockText("uuid-1")).toBe("");

      mockGetBlock.mockResolvedValue({ content: null });
      expect(await api.Editor.getBlockText("uuid-2")).toBe("");
    });

    it("should filter out property lines and empty lines", async () => {
      const rawContent = [
        "This is content",
        "",
        "author:: me",
        "id:: 123",
        "",
        "More content",
        "status:: active",
      ].join("\n");

      mockGetBlock.mockResolvedValue({ content: rawContent });

      const result = await api.Editor.getBlockText("uuid-3");

      // Should match:
      // "This is content"
      // "More content"
      // Joined by newlines
      expect(result).toBe("This is content\nMore content");
    });

    it("should handle content with no properties correctly", async () => {
      const rawContent = `Just plain text`;
      mockGetBlock.mockResolvedValue({ content: rawContent });

      const result = await api.Editor.getBlockText("uuid-4");
      expect(result).toBe("Just plain text");
    });
  });

  it("detects legacy runtime by default", async () => {
    const runtime = await detectLogseqRuntime();
    expect(runtime.mode).toBe("legacy");
  });
});
