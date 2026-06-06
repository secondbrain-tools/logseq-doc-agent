import { describe, it, expect } from "vitest";
import { parseSubtree } from "./subtree-parser";

describe("parseSubtree issue", () => {
  it("should parse multi-line text and lists correctly", () => {
    const input = `---
Please write me an Evaluation rubric that uses the submitBlockEvaluation.
Write this prompt as a block tree into this page.

The tree structure should be like this:

- Identify Categories
- Identify Criteria for each Categories
- Define 5 Level Descriptors (Scoring Rubric) for each Criteria
  Use the following Anchoring (Level: Anchor)
  1:  Failing / Fundamentally inadequate 
  2:  Below expectations / Major issues 
  3:  Adequate / Meets minimum standard
  4:  Good / Exceeds expectations
  5:  Excellent / Exemplary 

If context is missing, ask the user for further information.

If you identify less than 5 criteria, omit the Categories.
Otherwise ensure that there are at least two Criteria in each Category.

Create the Block Tree as a proposal in the page - not in the chat:

---`;

    const result = parseSubtree(input);
    console.log(JSON.stringify(result, null, 2));
  });
});
