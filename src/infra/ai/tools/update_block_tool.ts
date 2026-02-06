
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
                // New Merge Logic:
                // 1. Store the ORIGINAL content in 'base' (only if not already set)
                // 2. Write the LLM content directly to the block body
                // 3. This makes the block body the "working copy"

                // Parse the existing content to separate properties and body
                const lines = currentContent.split('\n');
                let bodyLines: string[] = [];
                let inProperties = true;
                const propertyRegex = /^.+::/;
                let existingMergeData: MergeEntity | null = null;
                const existingProperties: string[] = [];

                for (const line of lines) {
                    if (inProperties) {
                        if (propertyRegex.test(line)) {
                            // Check for existing merge property
                            if (line.startsWith('logseq-doc-agent.merge::')) {
                                try {
                                    const match = line.match(/logseq-doc-agent\.merge::\s*(.+)/);
                                    if (match && match[1]) {
                                        existingMergeData = JSON.parse(match[1]);
                                    }
                                } catch (e) {
                                    // Ignore parse errors
                                }
                            } else {
                                existingProperties.push(line);
                            }
                        } else {
                            inProperties = false;
                            bodyLines.push(line);
                        }
                    } else {
                        bodyLines.push(line);
                    }
                }

                // Determine the base content
                // If base is already set from previous update, preserve it
                // Otherwise, use the current body as base
                const currentBody = bodyLines.join('\n');
                const base = existingMergeData?.base || currentBody;

                // Create merge entity with base only (no newContent)
                const mergeData: MergeEntity = {
                    type: 'update',
                    base: base
                };

                // Reconstruct the content with LLM content as the body + existing properties
                const sanitizedLLMContent = sanitizeContent(content);
                if (existingProperties.length > 0) {
                    newContent = existingProperties.join('\n') + '\n' + sanitizedLLMContent;
                } else {
                    newContent = sanitizedLLMContent;
                }

                await logseq.Editor.updateBlock(uuid, newContent);
                await logseq.Editor.upsertBlockProperty(uuid, 'logseq-doc-agent.merge', JSON.stringify(mergeData));

            } else {
                // Overwrite logic
                newContent = sanitizeContent(content);
                await logseq.Editor.updateBlock(uuid, newContent);
            }
            return `Successfully updated block ${id}.`;

        } catch (e) {
            console.error('[UpdateBlockTool] Error:', e);
            return `Error updating block: ${e}`;
        }
    },
} as any);
