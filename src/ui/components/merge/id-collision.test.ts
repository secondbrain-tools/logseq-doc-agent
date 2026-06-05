import { describe, it, expect } from "vitest";
import { calculateDiffLines } from "./diff-utils";

describe("calculateDiffLines - ID Collision Check", () => {
  it("should generate unique IDs for parts in multi-line replacement blocks", () => {
    const original = `Line 1 old\nLine 2 old`;
    const modified = `Line 1 new\nLine 2 new`;

    const { diffLines } = calculateDiffLines(original, modified, "words", {});

    // Filter for modified-unified lines
    const unifiedLines = diffLines.filter((l) => l.type === "modified-unified");
    expect(unifiedLines.length).toBe(2);

    const ids = new Set<string>();
    let duplicateCount = 0;

    unifiedLines.forEach((line) => {
      if (line.unifiedParts) {
        line.unifiedParts.forEach((part) => {
          if (part.id) {
            if (ids.has(part.id)) {
              duplicateCount++;
              console.error(`Duplicate ID found: ${part.id}`);
            }
            ids.add(part.id);
          }
        });
      }
    });

    expect(duplicateCount).toBe(0);
    // Ensure IDs reflect line numbers properly (e.g., "1-0", "2-0")
    // assuming old starts at 1
    const line1Part = unifiedLines[0].unifiedParts?.find((p) => p.type !== "common");
    const line2Part = unifiedLines[1].unifiedParts?.find((p) => p.type !== "common");

    expect(line1Part?.id).not.toBe(line2Part?.id);
  });
});
