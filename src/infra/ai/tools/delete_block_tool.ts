
import { z } from 'zod';
import { tool } from 'ai';
import { ShortIdService } from '../short-id.service';
import type { MergeEntity } from '../../../domain/merge/entity';

/**
 * Creates the deleteBlock tool with injected context.
 */
export const createDeleteBlockTool = (context: { merge: boolean }) => tool({
    description: 'Delete a block. If merge is on, marks it for deletion instead of actually deleting.',
    inputSchema: z.object({
        shortid: z.string().describe('The short ID of the block to delete (e.g., #a1b2)'),
    }),
    execute: async ({ shortid }: { shortid: string }) => {
        try {
            const uuid = ShortIdService.getInstance().getUuid(shortid);
            if (!uuid) {
                return `Error: Could not find block with short ID ${shortid}`;
            }

            if (context.merge) {
                // Merge Mode: "Soft" delete
                const block = await logseq.Editor.getBlock(uuid);
                if (!block) {
                    return `Error: Block not found for UUID ${uuid}`;
                }

                const currentContent = block.content || "";

                // We need to parse existing properties to inject ours cleanly, 
                // similar to updateBlock but we don't need to stash "originalContent" 
                // because we aren't changing the body, just adding a tag.
                // However, update_block_tool removes existing agent props. We should probably do same to avoid duplicates.

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
                    type: 'delete'
                };

                propertyLines.push(`logseq-doc-agent.merge:: ${JSON.stringify(mergeData)}`);

                let newContent = propertyLines.join('\n');
                if (body) {
                    newContent += '\n' + body;
                }

                await logseq.Editor.updateBlock(uuid, newContent);
                return `Marked block ${shortid} for deletion.`;

            } else {
                // Hard delete
                await logseq.Editor.removeBlock(uuid);
                return `Deleted block ${shortid}.`;
            }

        } catch (e) {
            console.error('[DeleteBlockTool] Error:', e);
            return `Error deleting block: ${e}`;
        }
    },
} as any);
