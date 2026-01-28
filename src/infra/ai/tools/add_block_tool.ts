
import { z } from 'zod';
import { tool } from 'ai';
import { ShortIdService } from '../short-id.service';
import type { MergeEntity } from '../../../domain/merge/entity';

/**
 * Creates the addBlock tool with injected context.
 */
export const createAddBlockTool = (context: { merge: boolean }) => tool({
    description: 'Add a new block to Logseq. Can append as child or insert before/after a target.',
    inputSchema: z.object({
        targetShortId: z.string().describe('The short ID of the target block/page to add to (e.g., #a1b2)'),
        content: z.string().describe('The content of the new block'),
        anchor: z.enum(['parent', 'before', 'after']).optional().describe('Where to insert relative to target. Default is "parent" (append as child).'),
    }),
    execute: async ({ targetShortId, content, anchor = 'parent' }: { targetShortId: string, content: string, anchor?: 'parent' | 'before' | 'after' }) => {
        try {
            const targetUuid = ShortIdService.getInstance().getUuid(targetShortId);
            if (!targetUuid) {
                return `Error: Could not find target with short ID ${targetShortId}`;
            }

            // Logseq insertBlock options
            // insertBlock(uuid, content, options)
            // options: { before: boolean, sibling: boolean }
            // parent: sibling=false (default)
            // before: sibling=true, before=true
            // after: sibling=true, before=false

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
                return `Error: Failed to insert block at ${targetShortId}`;
            }

            // Register new ShortID for the created block so agent can use it immediately?
            // User convention is lazy generation, but if we return it, it helps.
            const newShortId = ShortIdService.getInstance().getShortId(newBlock.uuid);

            return `Successfully added block ${newShortId} ${anchor} ${targetShortId}.`;

        } catch (e) {
            console.error('[AddBlockTool] Error:', e);
            return `Error adding block: ${e}`;
        }
    },
} as any);
