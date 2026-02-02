
import { z } from 'zod';
import { tool } from 'ai';
import type { MergeEntity } from '../../../domain/merge/entity';

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
            const block = await logseq.Editor.getBlock(id);
            const targetBlock = await logseq.Editor.getBlock(targetId);

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

            return `Successfully moved block ${id} ${anchor} ${targetId}.`;

        } catch (e) {
            console.error('[MoveBlockTool] Error:', e);
            return `Error moving block: ${e}`;
        }
    },
} as any);
