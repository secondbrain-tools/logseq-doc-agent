import { z } from "zod";
import { SuggestionSchema, TextQuoteSelectorSchema } from "./entity";

export const ContextScopeSchema = z.object({
  includeDocument: z.boolean(),
  includeEvaluation: z.boolean(),
});
export type ContextScope = z.infer<typeof ContextScopeSchema>;

const AISuggestionSchema = z.object({
  op: z.enum([
    "replace",
    "insert_before",
    "insert_after",
    "delete",
    "rewrite_span",
    "rewrite_global",
  ]),
  selector: TextQuoteSelectorSchema.nullable().describe(
    "null => applies globally / not tied to a specific span",
  ),
  proposed_text: z.string().nullable().describe("null allowed for delete"),
  rationale: z.string(),
  status: z
    .enum(["pending", "accepted", "dismissed"])
    .nullable()
    .describe("null defaults to pending"),
});

export const IssueReplyResponseSchema = z.object({
  answer: z
    .string()
    .describe(
      "The AI's text response to the user's message or change proposal. Assumes the role of a collaborative assistant.",
    ),
  suggestions: z
    .array(
      z.object({
        action: z
          .enum(["add", "update", "remove"])
          .describe("Whether to add a new suggestion, update an existing one, or remove it."),
        index: z
          .number()
          .nullable()
          .describe("The 0-based index of the suggestion to update or remove (ignored for 'add')."),
        suggestion: AISuggestionSchema.nullable().describe(
          "The new or updated suggestion object (required for 'add' and 'update').",
        ),
      }),
    )
    .nullable()
    .describe("Changes to make to the issue's suggestions."),
  status: z
    .enum(["open", "resolved", "ignored"])
    .nullable()
    .describe(
      "Optionally change the status of the issue. e.g. if the user convinced you the issue is invalid, mark it ignored.",
    ),
  updated_description: z
    .string()
    .nullable()
    .describe("Optionally rewrite the issue description if the user clarified the problem."),
  counterargument: z
    .string()
    .nullable()
    .describe("Optionally add or update a counterargument. Set to null to remove."),
});

export type IssueReplyResponse = z.infer<typeof IssueReplyResponseSchema>;
