
import { z } from 'zod';
import { tool } from 'ai';
import type { MergeEntity } from '../../../domain/merge/entity';

import { sanitizeBlockId } from './tool-utils';

/**
 * Creates the deleteBlock tool with injected context.
 */
export const createDeleteBlockTool = (context: { merge: boolean }) => tool({
    description: 'Delete a block. If merge is on, marks it for deletion instead of actually deleting.',
    inputSchema: z.object({
        id: z.union([z.number(), z.string()]).describe('The Logseq block ID (integer) to delete'),
    }),
    execute: async ({ id }: { id: number | string }) => {
        try {
            // Sanitize ID: handle '#123' format from prompt or stringified numbers
            const cleanId = sanitizeBlockId(id);

            const block = await logseq.Editor.getBlock(cleanId);
            if (!block || !block.uuid) {
                return `Error: Block not found for ID ${id}`;
            }
            const uuid = block.uuid;

            if (context.merge) {
                // Optimistic Merge Logic for Delete:
                // Instead of deleting, we mark it as 'delete' in merge property.
                // We do NOT change content significantly, maybe just append the merge prop.

                // Fetch fresh block to get content
                const freshBlock = await logseq.Editor.getBlock(uuid);
                const currentContent = freshBlock?.content || "";

                // We need to parse existing properties to inject ours cleanly, 
                // similar to updateBlock but we don't need to stash "originalContent" 
                // because we aren't changing the body, just adding a tag.

                const lines = currentContent.split('\n');
                const cleanLines: string[] = []; // Body
                const propertyLines: string[] = [];
                let inProperties = true;
                const propertyRegex = /^.+::/;

                for (const line of lines) {
                    if (inProperties) {
                        if (propertyRegex.test(line)) {
                            // Filter out existing merge prop
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
                    type: 'delete',
                    originalContent: body // Storing original content just in case
                };

                propertyLines.push(`logseq-doc-agent.merge:: ${JSON.stringify(mergeData)}`);

                let newContent = propertyLines.join('\n');
                if (body) {
                    newContent += '\n' + body;
                }

                await logseq.Editor.updateBlock(uuid, newContent);
                return `Marked block ${id} for deletion.`;

            } else {
                // Hard delete
                await logseq.Editor.removeBlock(uuid);
                return `Deleted block ${id}.`;
            }

        } catch (e) {
            console.error('[DeleteBlockTool] Error:', e);
            return `Error deleting block: ${e}`;
        }
    },
} as any);
