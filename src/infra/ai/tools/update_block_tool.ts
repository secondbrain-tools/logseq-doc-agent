
import { z } from 'zod';
import { tool } from 'ai';
import type { MergeEntity } from '../../../domain/merge/entity';

import { sanitizeBlockId, sanitizeContent } from './tool-utils';

/**
 * Creates the updateBlock tool with injected context.
 */
export const createUpdateBlockTool = (context: { merge: boolean }) => tool({
    description: 'Update a Logseq block with new content. If merge is on (default), adds content as a merge property. If off, overwrites content.',
    inputSchema: z.object({
        id: z.union([z.number(), z.string()]).describe('The Logseq block ID (integer)'),
        content: z.string().describe('The new content to write to the block'),
    }),
    execute: async ({ id, content }: { id: number | string, content: string }) => {
        try {
            // Sanitize ID: handle '#123' format from prompt or stringified numbers
            const cleanId = sanitizeBlockId(id);

            const block = await logseq.Editor.getBlock(cleanId);
            if (!block || !block.uuid) {
                return `Error: Block not found for ID ${id}`;
            }
            const uuid = block.uuid;

            const currentContent = block.content || "";
            let newContent = "";

            if (context.merge) {
                // Optimistic Merge Logic (REVERSED):
                // 1. Keep the original content in the block body.
                // 2. Store the NEW proposed content in the 'logseq-doc-agent.merge' property.
                // 3. This allows the user to see the original content and approve the merge.

                const originalBody = currentContent; // The current content is the original

                // Create merge entity with new content as the proposal
                const mergeData: MergeEntity = {
                    type: 'update',
                    newContent: sanitizeContent(content), // Sanitize output content
                    originalContent: originalBody // The original content
                };

                // We need to update the block properties WITHOUT changing the content body.
                // However, logseq.Editor.updateBlock replaces the entire content.
                // So we need to construct the content with existing properties (if any) + merge property + original body.

                // Note: The user request says "Write updated content into the merge property."

                // Let's parse the existing content to separate properties and body
                const lines = currentContent.split('\n');
                const propertyLines: string[] = [];
                let bodyLines: string[] = [];
                let inProperties = true;
                const propertyRegex = /^.+::/;

                for (const line of lines) {
                    if (inProperties) {
                        if (propertyRegex.test(line)) {
                            // Filter out OLD merge properties if any, to avoid duplicates
                            if (!line.startsWith('logseq-doc-agent.merge::')) {
                                propertyLines.push(line);
                            }
                        } else {
                            inProperties = false;
                            bodyLines.push(line);
                        }
                    } else {
                        bodyLines.push(line);
                    }
                }

                // Add the new merge property
                propertyLines.push(`logseq-doc-agent.merge:: ${JSON.stringify(mergeData)}`);

                // Reconstruct the content
                // Properties first, then body
                if (propertyLines.length > 0) {
                    newContent = propertyLines.join('\n') + '\n' + bodyLines.join('\n');
                } else {
                    // Should not happen as we just added a property, but for safety
                    newContent = bodyLines.join('\n');
                }

                // Trim ? Maybe not, to preserve original formatting as much as possible.
                // But generally properties are at the top.

            } else {
                // Overwrite logic
                newContent = sanitizeContent(content);
            }

            await logseq.Editor.updateBlock(uuid, newContent);
            return `Successfully updated block ${id}.`;

        } catch (e) {
            console.error('[UpdateBlockTool] Error:', e);
            return `Error updating block: ${e}`;
        }
    },
} as any);
