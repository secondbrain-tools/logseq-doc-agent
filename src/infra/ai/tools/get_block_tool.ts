import { tool } from 'ai';
import { z } from 'zod';
import {
    type LogseqBlock,
} from './types';
import {
    flattenBlocks,
    buildDocumentResponse,
    cleanBlockContent
} from './get_logseq_document_tool';
import type { LogseqSelection } from './types';
import { sanitizeBlockId } from './tool-utils';

// Access the global logseq object
const getLogseq = () => (window as any).logseq;

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
        const logseq = getLogseq();
        if (!logseq) {
            return 'Error: Logseq API not available.';
        }

        if (!blockId) {
            return 'Error: blockId is required.';
        }

        try {
            const cleanId = sanitizeBlockId(blockId);

            // Get block with children if subtree is requested
            // logseq.Editor.getBlock supports both UUID string and integer ID
            const block = await logseq.Editor.getBlock(cleanId, { includeChildren: subtree });

            if (!block) {
                return `Error: Block with ID/UUID ${blockId} not found.`;
            }

            // If we have a single block but it might have children we need to flatten it similarly to get_document
            // However, getBlock returns a single entity. If includeChildren is true, it has a children array.

            let blocks: LogseqBlock[] = [];

            // If it's a single block, we can treat it as a tree root for flattening
            // But flattening expects an array of blocks.
            // Let's create a temporary array containing just this block

            if (subtree) {
                // flattenBlocks expects a tree array.
                // It also handles calculating hierarchy IDs.
                // We pass [block] as the tree.
                blocks = flattenBlocks([block]);
            } else {
                // Just the single block
                // We still want consistent formatting, so we add hierarchyId manually if missing
                blocks = [{
                    ...block,
                    hierarchyId: block.hierarchyId || '1'
                }];
            }

            // Apply Merge Logic if enabled (Copied from get_logseq_document_tool)
            if (context.mergeDefault || context.mergeBoth) {
                blocks = blocks.map(b => {
                    const content = b.content || '';
                    const match = content.match(/logseq-doc-agent\.merge::\s*(.+)/);
                    if (match && match[1]) {
                        try {
                            const mergeData = JSON.parse(match[1]);
                            if (mergeData) {
                                const cleanedBody = cleanBlockContent(b.content);
                                if (context.mergeBoth) {
                                    return {
                                        ...b,
                                        content: `[BASE]\n${mergeData.base || ''}\n[PROPOSED]\n${cleanedBody}`
                                    };
                                } else if (context.mergeDefault) {
                                    return {
                                        ...b,
                                        content: cleanedBody
                                    };
                                }
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                    return b;
                });
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
