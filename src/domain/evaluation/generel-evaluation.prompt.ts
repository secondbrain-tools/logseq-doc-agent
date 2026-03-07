import type { BuiltInPromptConfig } from '../prompt/built-in-prompts';

/**
 * Meta-prompt: Evaluation Rubric Builder
 *
 * This prompt instructs an AI agent to interview the user and collaboratively
 * build a structured evaluation rubric. The output is a ready-to-use evaluation
 * prompt formatted for the `submit_block_evaluation` tool.
 *
 * The prompt is split into a parent block (intro + rules) and child blocks
 * (one per phase), so it renders nicely in Logseq's outliner.
 *
 * Terminology:
 *  * Category:         Broad thematic grouping (e.g. "Language & Style")
 *  * Criterion:        Single evaluable dimension within a category (e.g. "Clarity")
 *  * Level / Score:    A discrete point on the 1-5 rating scale
 *  * Level Descriptor: Concrete description of what a score means for a criterion
 *  * Rubric:           The complete matrix of Categories → Criteria → Level Descriptors
 */


export const RUBRIC_BUILDER_PROMPT_CONFIG: BuiltInPromptConfig = {
  version: 1,
  name: 'Meta: Evaluation Rubric Builder',
  text: `\
Please write me aneEvaluation rubric that uses the submitBlockEvaluation.
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

If you identify less then 5 criteria, omit the Cagegories. 
Otherwise Ensure that there are at least two Criera in each Category.

Create the Block Tree as a proposal in the page - not in the chat:

[single block:]
  ## [Prompt Name]
  logseq-doc-agent.prompt:: [Prompt Name]  
  Please evaluate the current page using submitBlockEvaluation tool. Here are the necessary information.
[subtree of parent block:]
  ├─ Category: [Name]
      ├─ Criterion: [Name]
      │   ├─ Score 1: [descriptor]
      │   ├─ Score 2: [descriptor]
      │   ├─ Score 3: [descriptor]
      │   ├─ Score 4: [descriptor]
      │   └─ Score 5: [descriptor]
      ├─ Criterion: ...
      

Discuss your suggestion with me and always rework it in the page.

Here is my intend for the evaluation:
`

};
