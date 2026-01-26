
import { z } from 'zod';
import { tool } from 'ai';
import { ShortIdService } from '../short-id.service';
import type { MergeEntity } from '../../../domain/merge/entity';

/**
 * Creates the updateBlock tool with injected context.
 */
export const createUpdateBlockTool = (context: { merge: boolean }) => tool({
    description: 'Update a Logseq block with new content. If merge is on (default), adds content as a merge property. If off, overwrites content.',
    inputSchema: z.object({
        shortid: z.string().describe('The short ID of the block to update (e.g., #a1b2)'),
        content: z.string().describe('The new content to write to the block'),
    }),
    execute: async ({ shortid, content }: { shortid: string, content: string }) => {
        try {
            const uuid = ShortIdService.getInstance().getUuid(shortid);
            if (!uuid) {
                return `Error: Could not find block with short ID ${shortid}`;
            }

            const block = await logseq.Editor.getBlock(uuid);
            if (!block) {
                return `Error: Block not found for UUID ${uuid}`;
            }

            const currentContent = block.content || "";
            let newContent = "";

            if (context.merge) {
                // Optimistic Merge Logic:
                // 1. Parse current content to separate properties and body
                // 2. Filter out old logseq-doc-agent properties to avoid accumulation
                // 3. Backup original body content into 'logseq-doc-agent.merge' property
                // 4. Overwrite block content with NEW content immediately

                const lines = currentContent.split('\n');
                const cleanLines: string[] = []; // This will be the original body
                const propertyLines: string[] = [];
                let inProperties = true;
                const propertyRegex = /^.+::/;

                for (const line of lines) {
                    if (inProperties) {
                        if (propertyRegex.test(line)) {
                            // Filter out our own agent properties
                            if (!line.startsWith('logseq-doc-agent.') && !line.startsWith('logseq_doc_agent.')) {
                                propertyLines.push(line);
                            }
                        } else {
                            // End of properties
                            inProperties = false;
                            cleanLines.push(line);
                        }
                    } else {
                        cleanLines.push(line);
                    }
                }

                const originalBody = cleanLines.join('\n').trim();

                // Create merge entity with original content as backup
                const mergeData: MergeEntity = {
                    newContent: content, // Storing new content for reference/diffing
                    originalContent: originalBody
                };

                // Add the merge property
                propertyLines.push(`logseq-doc-agent.merge:: ${JSON.stringify(mergeData)}`);

                // Construct final content: preserved properties + new merge property + NEW content body
                if (propertyLines.length > 0) {
                    newContent = propertyLines.join('\n') + '\n' + content;
                } else {
                    newContent = `logseq-doc-agent.merge:: ${JSON.stringify(mergeData)}\n` + content;
                }
                // Trim extra newlines if needed
                newContent = newContent.trim();

            } else {
                // Overwrite logic
                newContent = content;
            }

            await logseq.Editor.updateBlock(uuid, newContent);
            return `Successfully updated block ${shortid}.`;

        } catch (e) {
            console.error('[UpdateBlockTool] Error:', e);
            return `Error updating block: ${e}`;
        }
    },
} as any);
