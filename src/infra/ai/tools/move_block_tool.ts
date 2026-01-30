
import { z } from 'zod';
import { tool } from 'ai';
import { ShortIdService } from '../short-id.service';
import type { MergeEntity } from '../../../domain/merge/entity';

/**
 * Creates the moveBlock tool with injected context.
 */
export const createMoveBlockTool = (context: { merge: boolean }) => tool({
    description: 'Move a block to a new location. If merge is on, performs the move but records origin for potential revert.',
    inputSchema: z.object({
        shortid: z.string().describe('The short ID of the block to move'),
        targetShortId: z.string().describe('The short ID of the target block/page to move to'),
        anchor: z.enum(['parent', 'before', 'after']).optional().describe('Where to move relative to target. Default is "parent" (child).'),
    }),
    execute: async ({ shortid, targetShortId, anchor = 'parent' }: { shortid: string, targetShortId: string, anchor?: 'parent' | 'before' | 'after' }) => {
        try {
            const uuid = ShortIdService.getInstance().getUuid(shortid);
            const targetUuid = ShortIdService.getInstance().getUuid(targetShortId);

            if (!uuid) return `Error: Could not find block ${shortid}`;
            if (!targetUuid) return `Error: Could not find target ${targetShortId}`;

            let originalParentUuid: string | undefined;
            let originalPriorSiblingUuid: string | undefined;

            const block = await logseq.Editor.getBlock(uuid);
            if (!block) return `Error: Block not found ${uuid}`;

            if (context.merge) {
                // Capture state BEFORE move
                // block.left?.id or block.parent?.id
                // Logseq Entity usually has 'left' pointing to previous sibling? 
                // Or 'parent' pointing to parent.
                // The API object structure varies.
                // Safest to get current relationships via API calls if needed?
                // `block.parent` is usually { id: ... } object.
                // `block.left` is usually { id: ... } object.

                // Let's assume standard Logseq Block Entity structure
                if (block.parent && block.parent.id) {
                    // Need UUID of parent. `block.parent` might only have database ID.
                    // We might need to fetch it.
                    // If block.parent has uuid, great.
                    // If not, we might need to resolve it.
                    // For now, assume we can get it or fail gracefully.
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
            if (anchor === 'before') {
                options.sibling = true;
                options.before = true;
            } else if (anchor === 'after') {
                options.sibling = true;
                options.before = false;
            }
            // else 'parent' -> defaults (child)

            await logseq.Editor.moveBlock(uuid, targetUuid, options);

            if (context.merge) {
                // Post-move: Update block with history
                // Need to re-fetch block content? Or usage what we had?
                // If content changed during move? Unlikely.

                const currentContent = block.content || "";

                // Standard property filtering
                const lines = currentContent.split('\n');
                const cleanLines: string[] = [];
                const propertyLines: string[] = [];
                let inProperties = true;
                const propertyRegex = /^.+::/;

                for (const line of lines) {
                    if (inProperties) {
                        if (propertyRegex.test(line)) {
                            if (!line.startsWith('logseq-doc-agent.merge')) {
                                propertyLines.push(line);
                            }
                        } else {
                            inProperties = false;
                            cleanLines.push(line);
                        }
                    } else {
                        cleanLines.push(line);
                    }
                }
                const body = cleanLines.join('\n');

                const mergeData: MergeEntity = {
                    type: 'move',
                    originalParentUuid,
                    originalPriorSiblingUuid
                };

                propertyLines.push(`logseq-doc-agent.merge:: ${JSON.stringify(mergeData)}`);

                let newContent = propertyLines.join('\n');
                if (body) newContent += '\n' + body;

                await logseq.Editor.updateBlock(uuid, newContent);
            }

            return `Successfully moved block ${shortid} ${anchor} ${targetShortId}.`;

        } catch (e) {
            console.error('[MoveBlockTool] Error:', e);
            return `Error moving block: ${e}`;
        }
    },
} as any);
