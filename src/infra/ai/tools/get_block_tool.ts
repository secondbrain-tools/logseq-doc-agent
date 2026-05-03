import { tool } from 'ai';
import { z } from 'zod';
import {
    type LogseqBlock,
} from './types';
import {
    applyMergeLogicToTree,
    buildDocumentResponse
} from './get_logseq_document_tool';
import type { LogseqSelection } from './types';
import { sanitizeBlockId } from './tool-utils';
import { getCurrentLogseqApi } from '../../logseq';

export const createGetBlockTool = (context: {
    mergeDefault: boolean,
    mergeBoth: boolean
}) => tool({
    description: 'Returns the content of a specific block given its UUID. Can optionally return the entire subtree of children blocks.',
    inputSchema: z.object({
        blockId: z.union([z.string(), z.number()]).describe('The UUID or integer ID of the block to retrieve'),
        subtree: z.boolean().optional().default(true).describe('Whether to include children blocks (subtree). Defaults to true.')
    }),
    execute: async ({ blockId, subtree = true }: { blockId: string | number, subtree?: boolean }) => {
        const logseq = getCurrentLogseqApi();

        if (!blockId) {
            return 'Error: blockId is required.';
        }

        try {
            const cleanId = sanitizeBlockId(blockId);

            // Get block with children if subtree is requested
            // logseq.Editor.getBlock supports both UUID string and integer ID
            const block = await logseq.getBlock(cleanId, { includeChildren: subtree });

            if (!block) {
                return `Error: Block with ID/UUID ${blockId} not found.`;
            }

            // Treat variable block as root of a forest of 1 tree
            let blocks: LogseqBlock[] = [block];

            // Apply Merge Logic if enabled
            if (context.mergeDefault || context.mergeBoth) {
                blocks = applyMergeLogicToTree(blocks, context);
            }

            // Use the same response builder
            // The first block is the "selection" effectively
            return buildDocumentResponse(block as LogseqSelection, blocks);

        } catch (error) {
            console.error('[get_block] Error:', error);
            return `Error retrieving block: ${error}`;
        }
    },
} as any);
