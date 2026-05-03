import { z } from 'zod';
import { tool } from 'ai';
import { sanitizeBlockId } from './tool-utils';
import { LDA_EVALUATION_PROPERTY, LDA_EVALUATION_PROPERTY_CAMEL } from '../../../domain/logseq/properties';
import { BlockEvaluationSchema, createStrictEvaluationSchema } from '../../../domain/evaluation/entity';
import { getCurrentLogseqApi } from '../../logseq';

export function normalizeCategories(evaluation: any): void {
    if (!evaluation || !evaluation.results || evaluation.results.length <= 1) return;

    // Group by category to count criteria per category
    const groups: Record<string, number[]> = {};
    evaluation.results.forEach((r: any, i: number) => {
        const cat = r.category || 'Uncategorized';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(i);
    });

    const entries = Object.entries(groups);
    const allSingle = entries.every(([, indices]) => indices.length === 1);

    if (allSingle) {
        // Degenerate case: every category has exactly 1 criterion.
        // Flatten by removing category entirely.
        evaluation.results.forEach((r: any) => { r.category = null; });
    } else {
        // Mixed case: some categories have multiple, some have 1.
        // Group the singles into an "Other" category to avoid clutter.
        for (const [cat, indices] of entries) {
            if (indices.length === 1 && cat !== 'Uncategorized') {
                evaluation.results[indices[0]].category = 'Other';
            }
        }
    }
}

export const createSubmitBlockEvaluationTool = () => {
    // Determine which schema to use based on settings if available
    // Since this is evaluated at tool creation, we assume global settings are accessible
    let schema = BlockEvaluationSchema;
    let description = `Persist an agent-produced evaluation for a specific text block. The agent must provide per-criterion scores (1-5) with reasons, and may optionally include evidence selectors (span references) and improvement suggestions.`;

    try {
        const suggestionAlternativesStr = ((window as any).logseq?.settings?.['cognitiveForcing_suggestionAlternatives'] as string) || "1";
        const suggestionAlternatives = parseInt(suggestionAlternativesStr, 10) || 1;

        if (suggestionAlternatives > 1) {
            schema = createStrictEvaluationSchema(suggestionAlternatives) as any;
            description = `Persist an agent-produced evaluation. COGNITIVE FORCING IS ACTIVE: You MUST provide a confidence score for EVERY criterion. For any medium or high impact issue, you MUST provide at least ${suggestionAlternatives} distinct alternatives in the suggestions array.`;
        }
    } catch (e) {
        console.warn("Could not read cognitiveForcing settings for tool schema", e);
    }

    return tool({
        description,
        inputSchema: z.object({
            block_id: z.union([z.number(), z.string()]).describe('Identifier of the block being evaluated (provided by the host application).'),
            evaluation: schema
        }),
        execute: async ({
            block_id,
            evaluation
        }: {
            block_id: number | string,
            evaluation: any
        }) => {
            try {
                const logseq = getCurrentLogseqApi();

                // Sanitize ID
                const cleanId = sanitizeBlockId(block_id);
                const block = await logseq.getBlock(cleanId);

                if (!block || !block.uuid) {
                    return `Error: Block not found for ID ${block_id}`;
                }
                const uuid = block.uuid;

                normalizeCategories(evaluation);

                // Remove any existing evaluation under all known key variants before writing,
                // so that re-running an evaluation always overwrites rather than leaving stale data.
                const keysToRemove = [LDA_EVALUATION_PROPERTY, LDA_EVALUATION_PROPERTY_CAMEL, 'evaluation'];
                for (const key of keysToRemove) {
                    try {
                        await logseq.removeBlockProperty(uuid, key);
                    } catch {
                        // best-effort; key may not exist
                    }
                }

                await logseq.upsertBlockProperty(uuid, LDA_EVALUATION_PROPERTY, JSON.stringify(evaluation));

                return `Successfully submitted evaluation for block ${block_id}`;
            } catch (e) {
                console.error('[SubmitBlockEvaluationTool] Error:', e);
                return `Error submitting evaluation: ${e}`;
            }
        }
    }); // end tool
};
