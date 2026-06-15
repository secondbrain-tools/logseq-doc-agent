import { describe, it, expect } from "vitest";
import { parseSubtree } from "./subtree-parser";

describe("parseSubtree continuations", () => {
  it("should treat unbulleted lines without blank lines as continuations", () => {
    const input = `[single block:]
## [Prompt Name]
\`logseq- doc - agent.prompt:: [Prompt Name]\`
Please evaluate the current page using submitBlockEvaluation tool. Here are the necessary information.`;
    const result = parseSubtree(input);

    expect(result.content).toBe("[single block:]");
    expect(result.children.length).toBe(1);

    const h1 = result.children[0];
    expect(h1.content).toBe(
      "## [Prompt Name]\n`logseq- doc - agent.prompt:: [Prompt Name]`\nPlease evaluate the current page using submitBlockEvaluation tool. Here are the necessary information.",
    );
  });

  it("should NOT create new blocks for unbulleted lines after a blank line (treat as continuation)", () => {
    const input = `- List item 1

If context is missing, ask the user for further information.`;
    const result = parseSubtree(input);

    expect(result.content).toBe("");
    expect(result.children.length).toBe(1);
    expect(result.children[0].content).toBe(
      "List item 1\n\nIf context is missing, ask the user for further information.",
    );
  });
});
