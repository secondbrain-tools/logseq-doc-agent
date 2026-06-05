import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSubmitBlockEvaluationTool,
  normalizeCategories,
} from "./submit_block_evaluation_tool";
import {
  LDA_EVALUATION_PROPERTY,
  LDA_EVALUATION_PROPERTY_CAMEL,
} from "../../../domain/logseq/properties";

// Mock types
const mockLogseq = {
  Editor: {
    getBlock: vi.fn(),
    upsertBlockProperty: vi.fn(),
    removeBlockProperty: vi.fn(),
  },
};

// Global mock
vi.stubGlobal("logseq", mockLogseq);
vi.stubGlobal("window", { logseq: mockLogseq });

describe("submitBlockEvaluation tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should submit evaluation and save to block property", async () => {
    mockLogseq.Editor.getBlock.mockResolvedValueOnce({ uuid: "uuid-1" });

    const tool = createSubmitBlockEvaluationTool() as any;
    const mockEvaluation = {
      results: [
        {
          criterion_id: "clarity",
          category: "Writing",
          score: 5,
          reason: "Very clear",
          confidence: 90,
          issues: [],
        },
      ],
      summary: {
        overall_score: 5,
        overall_reason: "Good",
        category_aggregates: [],
      },
    };

    const result = await tool.execute(
      { block_id: 1, evaluation: mockEvaluation },
      { toolCallId: "test", messages: [] },
    );

    expect(mockLogseq.Editor.getBlock).toHaveBeenCalledWith(1);
    expect(mockLogseq.Editor.upsertBlockProperty).toHaveBeenCalledWith(
      "uuid-1",
      LDA_EVALUATION_PROPERTY,
      JSON.stringify(mockEvaluation),
    );
    expect(result).toContain("Successfully submitted evaluation");
  });

  it("should remove all known evaluation key variants before upserting to guarantee overwrite", async () => {
    mockLogseq.Editor.getBlock.mockResolvedValue({ uuid: "uuid-1" });

    const tool = createSubmitBlockEvaluationTool() as any;
    const firstEvaluation = {
      results: [
        {
          criterion_id: "clarity",
          category: "Writing",
          score: 3,
          reason: "OK",
          confidence: 60,
          issues: [],
        },
      ],
      summary: { overall_score: 3, overall_reason: "Average", category_aggregates: [] },
    };
    const secondEvaluation = {
      results: [
        {
          criterion_id: "clarity",
          category: "Writing",
          score: 5,
          reason: "Excellent",
          confidence: 95,
          issues: [],
        },
      ],
      summary: { overall_score: 5, overall_reason: "Excellent", category_aggregates: [] },
    };

    await tool.execute(
      { block_id: 1, evaluation: firstEvaluation },
      { toolCallId: "test-1", messages: [] },
    );
    await tool.execute(
      { block_id: 1, evaluation: secondEvaluation },
      { toolCallId: "test-2", messages: [] },
    );

    // Each call should remove all three known key variants
    expect(mockLogseq.Editor.removeBlockProperty).toHaveBeenCalledWith(
      "uuid-1",
      LDA_EVALUATION_PROPERTY,
    );
    expect(mockLogseq.Editor.removeBlockProperty).toHaveBeenCalledWith(
      "uuid-1",
      LDA_EVALUATION_PROPERTY_CAMEL,
    );
    expect(mockLogseq.Editor.removeBlockProperty).toHaveBeenCalledWith("uuid-1", "evaluation");

    // The last upsert should use the second (newer) evaluation
    const upsertCalls = mockLogseq.Editor.upsertBlockProperty.mock.calls;
    const lastUpsert = upsertCalls[upsertCalls.length - 1];
    expect(lastUpsert[0]).toBe("uuid-1");
    expect(lastUpsert[1]).toBe(LDA_EVALUATION_PROPERTY);
    expect(JSON.parse(lastUpsert[2])).toMatchObject({ summary: { overall_score: 5 } });
  });

  it("should handle missing block gracefully", async () => {
    mockLogseq.Editor.getBlock.mockResolvedValueOnce(null);

    const tool = createSubmitBlockEvaluationTool() as any;
    const mockEvaluation = {
      results: [
        {
          criterion_id: "clarity",
          category: "Writing",
          score: 5,
          reason: "Very clear",
          confidence: 90,
          issues: [],
        },
      ],
      summary: null,
    };

    const result = await tool.execute(
      { block_id: "invalid", evaluation: mockEvaluation },
      { toolCallId: "test", messages: [] },
    );

    expect(mockLogseq.Editor.upsertBlockProperty).not.toHaveBeenCalled();
    expect(result).toContain("Error: Block not found");
  });
});

describe("normalizeCategories", () => {
  it("should nullify categories when all categories have only 1 criterion", () => {
    const evaluation = {
      results: [
        { category: "A", criterion_id: "a" },
        { category: "B", criterion_id: "b" },
        { category: "C", criterion_id: "c" },
      ],
    };
    normalizeCategories(evaluation);
    expect(evaluation.results[0].category).toBeNull();
    expect(evaluation.results[1].category).toBeNull();
    expect(evaluation.results[2].category).toBeNull();
  });

  it('should group singles into "Other" when there is a mix of single and grouped criteria', () => {
    const evaluation = {
      results: [
        { category: "Group1", criterion_id: "a" },
        { category: "Group1", criterion_id: "b" },
        { category: "SingleX", criterion_id: "x" },
        { category: "SingleY", criterion_id: "y" },
      ],
    };
    normalizeCategories(evaluation);
    expect(evaluation.results[0].category).toBe("Group1");
    expect(evaluation.results[1].category).toBe("Group1");
    expect(evaluation.results[2].category).toBe("Other");
    expect(evaluation.results[3].category).toBe("Other");
  });

  it("should not modify categories when all categories have multiple criteria", () => {
    const evaluation = {
      results: [
        { category: "Group1", criterion_id: "a" },
        { category: "Group1", criterion_id: "b" },
        { category: "Group2", criterion_id: "c" },
        { category: "Group2", criterion_id: "d" },
      ],
    };
    normalizeCategories(evaluation);
    expect(evaluation.results[0].category).toBe("Group1");
    expect(evaluation.results[1].category).toBe("Group1");
    expect(evaluation.results[2].category).toBe("Group2");
    expect(evaluation.results[3].category).toBe("Group2");
  });

  it("should not modify anything if there is only 1 result overall", () => {
    const evaluation = {
      results: [{ category: "Single", criterion_id: "a" }],
    };
    normalizeCategories(evaluation);
    expect(evaluation.results[0].category).toBe("Single");
  });
});
