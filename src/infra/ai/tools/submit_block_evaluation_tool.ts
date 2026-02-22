import { z } from 'zod';
import { tool } from 'ai';
import { sanitizeBlockId } from './tool-utils';
import { LDA_EVALUATION_PROPERTY } from '../../../domain/logseq/properties';
import { BlockEvaluationSchema } from '../../../domain/evaluation/entity';

// Access the global logseq object
const getLogseq = () => (window as any).logseq;

export const createSubmitBlockEvaluationTool = () => tool({
    description: `Persist an agent-produced evaluation for a specific text block. The agent must provide per-criterion scores (1-5) with reasons, and may optionally include evidence selectors (span references) and improvement suggestions.`,
    parameters: z.object({
        block_id: z.union([z.number(), z.string()]).describe('Identifier of the block being evaluated (provided by the host application).'),
        evaluation: BlockEvaluationSchema
    }),
    execute: async ({
        block_id,
        evaluation
    }: {
        block_id: number | string,
        evaluation: any
    }) => {
        try {
            const logseq = getLogseq();
            if (!logseq) return 'Error: Logseq API not available';

            // Sanitize ID
            const cleanId = sanitizeBlockId(block_id);
            const block = await logseq.Editor.getBlock(cleanId);

            if (!block || !block.uuid) {
                return `Error: Block not found for ID ${block_id}`;
            }
            const uuid = block.uuid;

            await logseq.Editor.upsertBlockProperty(uuid, LDA_EVALUATION_PROPERTY, JSON.stringify(evaluation));

            return `Successfully submitted evaluation for block ${block_id}`;
        } catch (e) {
            console.error('[SubmitBlockEvaluationTool] Error:', e);
            return `Error submitting evaluation: ${e}`;
        }
    }
} as any);
