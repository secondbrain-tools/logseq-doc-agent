
import { z } from 'zod';
import { tool } from 'ai';
import type { MergeEntity } from '../../../domain/merge/entity';

import { sanitizeBlockId } from './tool-utils';

/**
 * Creates the moveBlock tool with injected context.
 */
export const createMoveBlockTool = (context: { merge: boolean }) => tool({
    description: 'Move a block to a new location. If merge is on, performs the move but records origin for potential revert.',
    inputSchema: z.object({
        id: z.union([z.number(), z.string()]).describe('The Logseq block ID (integer) to move'),
        targetId: z.union([z.number(), z.string()]).describe('The Logseq block ID (integer) of the target block/page to move to'),
        anchor: z.enum(['parent', 'before', 'after']).optional().describe('Where to move relative to target. Default is "parent" (child).'),
    }),
    execute: async ({ id, targetId, anchor = 'parent' }: { id: number | string, targetId: number | string, anchor?: 'parent' | 'before' | 'after' }) => {
        try {
            const cleanId = sanitizeBlockId(id);
            const cleanTargetId = sanitizeBlockId(targetId);

            const block = await logseq.Editor.getBlock(cleanId);
            const targetBlock = await logseq.Editor.getBlock(cleanTargetId);

            if (!block || !block.uuid) return `Error: Could not find block ${id}`;
            if (!targetBlock || !targetBlock.uuid) return `Error: Could not find target ${targetId}`;

            const uuid = block.uuid;
            const targetUuid = targetBlock.uuid;

            let originalParentUuid: string | undefined;
            let originalPriorSiblingUuid: string | undefined;

            if (context.merge) {
                // Capture state BEFORE move
                if (block.parent && block.parent.id) {
                    const parentDetails = await logseq.Editor.getBlock(block.parent.id);
                    originalParentUuid = parentDetails?.uuid;
                }

                if (block.left && block.left.id) {
                    const leftDetails = await logseq.Editor.getBlock(block.left.id);
                    originalPriorSiblingUuid = leftDetails?.uuid;
                }
            }

            // Perform Move
            const options: any = {};
            if (anchor === 'parent') {
                // Explicitly set children: true to insert as child of target
                options.children = true;
            } else if (anchor === 'before') {
                options.sibling = true;
                options.before = true;
            } else if (anchor === 'after') {
                options.sibling = true;
                options.before = false;
            }

            await logseq.Editor.moveBlock(uuid, targetUuid, options);

            if (context.merge) {
                // Post-move: Update block with history
                // We don't need to touch content, just add the property

                const mergeData: MergeEntity = {
                    type: 'move',
                    originalParentUuid,
                    originalPriorSiblingUuid
                };

                await logseq.Editor.upsertBlockProperty(uuid, 'logseq-doc-agent.merge', JSON.stringify(mergeData));
            }

            // Fetch block content for summary
            const movedBlock = await logseq.Editor.getBlock(uuid);
            const content = movedBlock?.content || "";

            return `Moved block ${id} "${content.substring(0, 50)}..." ${anchor} ${targetId}.`;

        } catch (e) {
            console.error('[MoveBlockTool] Error:', e);
            return `Error moving block: ${e}`;
        }
    },
} as any);
