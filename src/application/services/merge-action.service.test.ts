import { describe, it, expect, vi, beforeEach } from "vitest";
import { MergeActionService } from "./merge-action.service";
import { LDA_MERGE_PROPERTY, LDA_MERGE_PROPERTY_CAMEL } from "../../domain/logseq/properties";

// Mock logseq global
const mockLogseq = {
  Editor: {
    getBlock: vi.fn(),
    updateBlock: vi.fn(),
    removeBlock: vi.fn(),
    removeBlockProperty: vi.fn(),
    getBlockPropertyContent: vi.fn(),
  },
};

vi.stubGlobal("logseq", mockLogseq);

describe("MergeActionService", () => {
  let service: MergeActionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MergeActionService();
  });

  describe("revertMerge", () => {
    it('should delete block if type is "add"', async () => {
      const uuid = "add-uuid";
      mockLogseq.Editor.getBlock.mockResolvedValue({
        uuid,
        properties: { [LDA_MERGE_PROPERTY]: { type: "add" } },
        content: "",
      });

      await service.revertMerge([uuid]);

      expect(mockLogseq.Editor.removeBlock).toHaveBeenCalledWith(uuid);
      expect(mockLogseq.Editor.removeBlockProperty).not.toHaveBeenCalled();
    });

    it('should restore original content if type is "update" and base exists', async () => {
      const uuid = "update-uuid";
      const originalContent = "Original Content";
      const mergeData = { type: "update", base: originalContent };

      mockLogseq.Editor.getBlock.mockResolvedValue({
        uuid,
        properties: { "logseq-doc-agent.merge": mergeData },
        content: "",
      });

      await service.revertMerge([uuid]);

      expect(mockLogseq.Editor.updateBlock).toHaveBeenCalledWith(uuid, originalContent);
      expect(mockLogseq.Editor.removeBlockProperty).toHaveBeenCalledWith(uuid, LDA_MERGE_PROPERTY);
      expect(mockLogseq.Editor.removeBlock).not.toHaveBeenCalled();
    });

    it("should fallback to removing property if block properties are missing but regex matches", async () => {
      const uuid = "fallback-uuid";

      // block has no properties object but content has tag
      mockLogseq.Editor.getBlock.mockResolvedValue({
        uuid,
        properties: {},
        content: `some content\n${LDA_MERGE_PROPERTY}:: {"type":"add"}`,
      });

      await service.revertMerge([uuid]);

      expect(mockLogseq.Editor.removeBlock).toHaveBeenCalledWith(uuid);
    });

    it('should just remove property if type is "update" but base is missing', async () => {
      const uuid = "update-no-base-uuid";
      const mergeData = { type: "update" }; // No base
      mockLogseq.Editor.getBlock.mockResolvedValue({
        uuid,
        properties: { [LDA_MERGE_PROPERTY]: mergeData },
        content: "",
      });

      await service.revertMerge([uuid]);

      expect(mockLogseq.Editor.updateBlock).not.toHaveBeenCalled(); // No content update
      expect(mockLogseq.Editor.removeBlockProperty).toHaveBeenCalledWith(uuid, LDA_MERGE_PROPERTY);
    });

    it("should handle camelCase property normalization (logseqDocAgent.merge)", async () => {
      const uuid = "normalized-uuid";

      mockLogseq.Editor.getBlock.mockResolvedValue({
        uuid,
        properties: {
          [LDA_MERGE_PROPERTY_CAMEL]: { type: "add" },
        },
        content: `some content`,
      });

      await service.revertMerge([uuid]);

      expect(mockLogseq.Editor.removeBlock).toHaveBeenCalledWith(uuid);
    });

    it("should fallback to parsing content regex if properties missing", async () => {
      const uuid = "regex-uuid";
      mockLogseq.Editor.getBlock.mockResolvedValue({
        uuid,
        properties: {},
        content: `some content\n${LDA_MERGE_PROPERTY}:: {"type":"add"}`,
      });

      await service.revertMerge([uuid]);

      expect(mockLogseq.Editor.removeBlock).toHaveBeenCalledWith(uuid);
    });
  });
});
