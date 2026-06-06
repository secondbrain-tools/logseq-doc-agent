import type { BuiltInPromptConfig } from "../prompt/types";

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

export const GENERAL_EVALUATION_PROMPT_CONFIG: BuiltInPromptConfig = {
  version: 1,
  name: "General Content Evaluation",
  text: `  
Please evaluate the current page using submitBlockEvaluation tool. Please submit the categories for the criteria. 
Evaluate each top-level block. If a top-level block mainly serves as an umbrella/“chapter” (i.e., it groups multiple child sections) and either (a) two or more of its child sections each contain more than 5 sentences, or (b) the total content would reach or exceed one page of text, then evaluate those child sections instead of the top-level block. Otherwise, evaluate the top-level block itself. Only evaluate at most one level below the top-level block.
Avoid duplicate findings across categories. If a point could fit multiple categories, report it only once under the single best-fitting category
Do not edit the page. Here are the necessary information:
- Category: Content Quality
  - Criterion: Clarity
    - Score 1: Failing / Fundamentally inadequate — The text is confusing or incoherent; the main idea is absent or impossible to identify.
    - Score 2: Below expectations / Major issues — Frequent unclear sentences, ambiguous phrasing, or missing explanations that impede understanding.
    - Score 3: Adequate / Meets minimum standard — Main idea is present and understandable; some passages need clarification.
    - Score 4: Good / Exceeds expectations — Clear and precise language; ideas are well-expressed with only minor ambiguities.
    - Score 5: Excellent / Exemplary — Exceptionally clear, concise, and unambiguous; every claim is easy to follow.
  - Criterion: Accuracy
    - Score 1: Failing / Fundamentally inadequate — Contains significant factual errors, incorrect claims, or misleading assertions.
    - Score 2: Below expectations / Major issues — Several inaccuracies or unsupported claims that undermine trustworthiness.
    - Score 3: Adequate / Meets minimum standard — Generally accurate with a few minor errors or missing citations.
    - Score 4: Good / Exceeds expectations — Accurate, well-supported, and reliable; sources cited where appropriate.
    - Score 5: Excellent / Exemplary — Factually precise, thoroughly supported, and fully trustworthy.
  - Criterion: Coherence & Argumentation
    - Score 1: Failing / Fundamentally inadequate — Arguments are disjointed or contradictory; no logical progression.
    - Score 2: Below expectations / Major issues — Weak or inconsistent reasoning; important links between ideas are missing.
    - Score 3: Adequate / Meets minimum standard — Reasoning is generally logical though some links or justifications are weak.
    - Score 4: Good / Exceeds expectations — Logical, well-structured arguments with clear support and conclusions.
    - Score 5: Excellent / Exemplary — Persuasive, tightly reasoned argumentation with robust support and clear implications.
- Category: Structure & Organization
  - Criterion: Organization
    - Score 1: Failing / Fundamentally inadequate — No discernible structure; ideas appear randomly without headings or grouping.
    - Score 2: Below expectations / Major issues — Poorly organized; sections or paragraphs lack clear purpose.
    - Score 3: Adequate / Meets minimum standard — Reasonable structure but could be tightened for clarity and emphasis.
    - Score 4: Good / Exceeds expectations — Logical structure that supports comprehension and navigation.
    - Score 5: Excellent / Exemplary — Elegant, purposeful organization that highlights main points and relationships.
  - Criterion: Flow & Transitions
    - Score 1: Failing / Fundamentally inadequate — Jarring jumps between ideas; transitions are absent.
    - Score 2: Below expectations / Major issues — Weak transitions that frequently interrupt reader comprehension.
    - Score 3: Adequate / Meets minimum standard — Transitions are present but can be made smoother.
    - Score 4: Good / Exceeds expectations — Smooth progression; paragraphs and sections connect clearly.
    - Score 5: Excellent / Exemplary — Seamless flow that guides the reader naturally from premise to conclusion.
- Category: Style & Tone
  - Criterion: Readability
    - Score 1: Failing / Fundamentally inadequate — Dense, jargon-heavy, or poorly edited; difficult to read.
    - Score 2: Below expectations / Major issues — Sentences are often awkward or overly complex; editing needed.
    - Score 3: Adequate / Meets minimum standard — Readable with occasional convoluted phrasing.
    - Score 4: Good / Exceeds expectations — Clear, well-edited prose appropriate for the intended audience.
    - Score 5: Excellent / Exemplary — Fluid, engaging prose with excellent sentence-level craft.
  - Criterion: Appropriateness of Tone
    - Score 1: Failing / Fundamentally inadequate — Tone is inappropriate (e.g., unprofessional, offensive, or irrelevant).
    - Score 2: Below expectations / Major issues — Tone inconsistently matches audience or purpose.
    - Score 3: Adequate / Meets minimum standard — Generally appropriate tone with occasional lapses.
    - Score 4: Good / Exceeds expectations — Tone consistently suits audience and purpose.
    - Score 5: Excellent / Exemplary — Tone is perfectly calibrated to purpose and audience; enhances impact.
  - Category: Language
    - Criterion: Spelling & Typographical Accuracy
      - Score 1: Failing / Fundamentally inadequate — Pervasive spelling/typing errors (including key terms, names, or headings); frequent capitalization mistakes; meaning is sometimes hard to recover.
      - Score 2: Below expectations / Major issues — Frequent typos or misspellings that distract and occasionally introduce ambiguity; conventions (hyphenation/capitalization) are inconsistent.
      - Score 3: Adequate / Meets minimum standard — Occasional spelling/typo errors; generally easy to read; minor inconsistency in capitalization, compounds, or terminology.
      - Score 4: Good / Exceeds expectations — Rare, minor typos; spelling is consistently correct for domain terms; capitalization and compounds follow a consistent convention.
      - Score 5: Excellent / Exemplary — No noticeable spelling/typo issues; consistent orthography and terminology throughout (including proper nouns and technical vocabulary).
    - Criterion: Grammar & Syntax
      - Score 1: Failing / Fundamentally inadequate — Many grammatical errors (agreement, tense, word order) and broken sentence structures; comprehension is frequently impaired.
      - Score 2: Below expectations / Major issues — Recurrent grammar issues (fragments/run-ons, inconsistent tense, unclear referents) that regularly interrupt reading and sometimes change meaning.
      - Score 3: Adequate / Meets minimum standard — Some grammar issues, but intended meaning remains clear; occasional awkward constructions or unclear pronoun references.
      - Score 4: Good / Exceeds expectations — Mostly correct grammar with only minor slips; sentences are well-formed even when complex; references are generally clear.
      - Score 5: Excellent / Exemplary — Grammatically precise and consistently well-formed; varied sentence structures used effectively; virtually no errors and no ambiguity caused by syntax.    
`,
};
