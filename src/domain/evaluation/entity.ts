import { z } from 'zod';

export const TextQuoteSelectorSchema = z.object({
    type: z.literal("TextQuoteSelector"),
    exact: z.string(),
    prefix: z.string().nullable(),
    suffix: z.string().nullable()
});

export type TextQuoteSelector = z.infer<typeof TextQuoteSelectorSchema>;

export const SuggestionSchema = z.object({
    op: z.enum([
        "replace",
        "insert_before",
        "insert_after",
        "delete",
        "rewrite_span",
        "rewrite_global"
    ]),
    selector: TextQuoteSelectorSchema.nullable().describe("null => applies globally / not tied to a specific span"),
    proposed_text: z.string().nullable().describe("null allowed for delete"),
    rationale: z.string()
}).describe("May be empty if no suggestions are provided.");

export type Suggestion = z.infer<typeof SuggestionSchema>;

export const EvidenceSchema = z.object({
    source_id: z.string().nullable(),
    text_sha256: z.string().nullable(),
    selectors: z.array(TextQuoteSelectorSchema).min(1)
}).describe("May be empty if no evidence is provided.");

export type Evidence = z.infer<typeof EvidenceSchema>;

export const CriterionResultSchema = z.object({
    criterion_id: z.string().describe("Stable criterion ID from the rubric (e.g., 'clarity', 'factuality')."),
    category: z.string().nullable(),
    score: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    reason: z.string(),
    evidence: z.array(EvidenceSchema),
    suggestions: z.array(SuggestionSchema)
});

export type CriterionResult = z.infer<typeof CriterionResultSchema>;

export const CategoryAggregateSchema = z.object({
    category: z.string(),
    average_score: z.number().min(0),
    criteria_count: z.number().int().min(0)
});

export type CategoryAggregate = z.infer<typeof CategoryAggregateSchema>;

export const EvaluationSummarySchema = z.object({
    overall_score: z.number().min(0).nullable(),
    overall_reason: z.string().nullable(),
    category_aggregates: z.array(CategoryAggregateSchema)
});

export type EvaluationSummary = z.infer<typeof EvaluationSummarySchema>;

export const BlockEvaluationSchema = z.object({
    results: z.array(CriterionResultSchema).min(1),
    summary: EvaluationSummarySchema.nullable()
});

export type BlockEvaluation = z.infer<typeof BlockEvaluationSchema>;
