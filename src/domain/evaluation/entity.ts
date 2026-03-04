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
    rationale: z.string(),
    status: z.enum(["pending", "accepted", "dismissed"]).default("pending").optional()
}).describe("May be empty if no suggestions are provided.");

export type Suggestion = z.infer<typeof SuggestionSchema>;

export const EvidenceSchema = z.object({
    source_id: z.string().nullable(),
    text_sha256: z.string().nullable(),
    selectors: z.array(TextQuoteSelectorSchema).min(1)
}).describe("May be empty if no evidence is provided.");

export type Evidence = z.infer<typeof EvidenceSchema>;

export const IssueSchema = z.object({
    description: z.string(),
    impact: z.enum(["low", "medium", "high"]).default("low").describe("low: formatting/typos, medium: clarity/structure, high: factual/logical"),
    counterargument: z.string().optional().describe("A counterargument arguing against this issue (e.g., why this might actually be intentional or beneficial)."),
    evidence: z.array(EvidenceSchema).optional().describe("Where the issue occurs (if applicable)."),
    suggestions: z.array(SuggestionSchema).optional().describe("Proposed fixes or alternatives."),
    user_feedback: z.array(z.lazy(() => UserFeedbackSchema)).optional().describe("User replies and change proposals for this issue."),
    status: z.enum(["open", "resolved", "ignored"]).default("open").optional()
});

export type Issue = z.infer<typeof IssueSchema>;

export const UserFeedbackSchema = z.object({
    type: z.enum(["reply", "change_proposal", "self_assessment", "self_suggestion", "done"]),
    text: z.string(),
    score: z.number().optional().describe("Score assigned during self-assessment"),
    created_at: z.string() // ISO timestamp
});

export const CriterionResultSchema = z.object({
    criterion_id: z.string().describe("Stable criterion ID from the rubric (e.g., 'clarity', 'factuality')."),
    category: z.string().nullable(),
    score: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    reason: z.string(),
    confidence: z.number().min(0).max(100).optional().describe("Confidence score (0-100) for this rating, required if cognitive forcing is active"),
    issues: z.array(IssueSchema).optional().describe("List of specific issues found for this criterion."),
    user_feedback: z.array(UserFeedbackSchema).optional().describe("DEPRECATED: criterion-level feedback. Use issue-level user_feedback instead.")
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

export function parseEvaluation(jsonString: string): BlockEvaluation | null {
    try {
        const parsed = JSON.parse(jsonString);
        return BlockEvaluationSchema.parse(parsed);
    } catch (e) {
        console.error("Failed to parse BlockEvaluation", e);
        return null;
    }
}

/**
 * Creates a stricter evaluation schema for cognitive forcing.
 * Enforces that issues with medium/high impact have at least minSuggestions alternatives.
 */
export function createStrictEvaluationSchema(minSuggestions: number = 2) {
    return BlockEvaluationSchema.refine((data) => {
        // Enforce confidence on all results
        for (const result of data.results) {
            if (result.confidence === undefined || result.confidence === null) {
                return false;
            }
            // Enforce multiple suggestions for medium/high impact issues
            if (result.issues) {
                for (const issue of result.issues) {
                    if (issue.impact === "medium" || issue.impact === "high") {
                        if (!issue.suggestions || issue.suggestions.length < minSuggestions) {
                            return false;
                        }
                    }
                }
            }
        }
        return true;
    }, {
        message: `Cognitive Forcing active: You MUST provide at least ${minSuggestions} distinct suggestions for any issue of medium or high impact. You MUST provide a confidence score for EVERY criterion.`
    });
}
