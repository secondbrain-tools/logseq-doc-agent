
import { z } from 'zod';
import { tool } from 'ai';
import { ShortIdService } from '../short-id.service';

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
                // Merge logic:
                // 1. Remove existing logseq_doc_agent.merge property if present
                // 2. Add new logseq_doc_agent.merge property at the end of property list
                const lines = currentContent.split('\n');
                const cleanLines: string[] = [];
                const propertyLines: string[] = [];
                let inProperties = true;
                const propertyRegex = /^.+::/;

                // First pass: separate properties and body, filter out old merge param
                for (const line of lines) {
                    if (inProperties) {
                        if (propertyRegex.test(line)) {
                            if (!line.startsWith('logseq_doc_agent.merge::')) {
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

                // Add new merge property
                propertyLines.push(`logseq_doc_agent.merge:: ${content}`);

                // Reconstruct content
                if (propertyLines.length > 0) {
                    newContent = propertyLines.join('\n') + '\n' + cleanLines.join('\n');
                } else {
                    // This case shouldn't happen if we are ensuring it's a property, 
                    // but if the original block had no properties, we just start with one.
                    newContent = `logseq_doc_agent.merge:: ${content}\n` + cleanLines.join('\n');
                }

                // Trim extra newlines if needed, but Logseq usually handles them.
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
