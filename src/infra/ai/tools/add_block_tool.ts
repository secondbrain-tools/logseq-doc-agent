
import { z } from 'zod';
import { tool } from 'ai';
import type { MergeEntity } from '../../../domain/merge/entity';

import { sanitizeBlockId, sanitizeContent } from './tool-utils';

/**
 * Creates the addBlock tool with injected context.
 */
export const createAddBlockTool = (context: { merge: boolean }) => tool({
    description: 'Add a new block to Logseq. Can append as child or insert before/after a target.',
    inputSchema: z.object({
        targetId: z.union([z.number(), z.string()]).describe('The Logseq ID (integer) of the target block/page to add to'),
        content: z.string().describe('The content of the new block'),
        anchor: z.enum(['parent', 'before', 'after']).optional().describe('Where to insert relative to target. Default is "parent" (append as child).'),
    }),
    execute: async ({ targetId, content, anchor = 'parent' }: { targetId: number | string, content: string, anchor?: 'parent' | 'before' | 'after' }) => {
        try {
            let cleanTargetId = sanitizeBlockId(targetId);

            let targetBlock = await logseq.Editor.getBlock(cleanTargetId);
            if (!targetBlock) {
                // Fallback: Check if it's a page
                const page = await logseq.Editor.getPage(cleanTargetId);
                if (page) {
                    targetBlock = page as any; // Treating page as block for uuid access
                }
            }

            if (!targetBlock || !targetBlock.uuid) {
                return `Error: Could not find target block or page with ID ${targetId}`;
            }
            const targetUuid = targetBlock.uuid;

            // Logseq insertBlock options
            const options: any = {};
            if (anchor === 'before') {
                options.sibling = true;
                options.before = true;
            } else if (anchor === 'after') {
                options.sibling = true;
                options.before = false;
            }
            // else 'parent' -> defaults (child)

            let finalContent = sanitizeContent(content);

            if (context.merge) {
                const mergeData: MergeEntity = {
                    type: 'add'
                };
                // Prepend merge property to the content
                // finalContent is already sanitized above
                finalContent = `logseq-doc-agent.merge:: ${JSON.stringify(mergeData)}\n${finalContent}`;
            }

            const newBlock = await logseq.Editor.insertBlock(targetUuid, finalContent, options);

            if (!newBlock) {
                return `Error: Failed to insert block at ${targetId}`;
            }

            // insertBlock may not return the integer id immediately, fetch it
            let blockId: number | undefined = newBlock.id;
            if (blockId === undefined && newBlock.uuid) {
                const fetchedBlock = await logseq.Editor.getBlock(newBlock.uuid);
                blockId = fetchedBlock?.id;
            }

            // Return the new block's ID so agent can use it immediately
            const idStr = blockId !== undefined ? String(blockId) : 'unknown';
            return `Successfully added block (id:${idStr}) ${anchor} ${targetId}.`;

        } catch (e) {
            console.error('[AddBlockTool] Error:', e);
            return `Error adding block: ${e}`;
        }
    },
} as any);
