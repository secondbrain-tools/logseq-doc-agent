
import { z } from 'zod';
import { tool } from 'ai';
import type { MergeEntity } from '../../../domain/merge/entity';

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
            const targetBlock = await logseq.Editor.getBlock(targetId);
            if (!targetBlock || !targetBlock.uuid) {
                // If it's a page, getBlock might return it, typically we check if it is a block or page
                // But getBlock usually works for both IDs if pages are treated as blocks
                // If fails, maybe try getPage? But user usually provides block ID.
                return `Error: Could not find target with ID ${targetId}`;
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

            let finalContent = content;

            if (context.merge) {
                const mergeData: MergeEntity = {
                    type: 'add'
                };
                // Prepend merge property to the content
                finalContent = `logseq-doc-agent.merge:: ${JSON.stringify(mergeData)}\n${content}`;
            }

            const newBlock = await logseq.Editor.insertBlock(targetUuid, finalContent, options);

            if (!newBlock) {
                return `Error: Failed to insert block at ${targetId}`;
            }

            // Return the new block's ID so agent can use it immediately
            return `Successfully added block (id:${newBlock.id}) ${anchor} ${targetId}.`;

        } catch (e) {
            console.error('[AddBlockTool] Error:', e);
            return `Error adding block: ${e}`;
        }
    },
} as any);
