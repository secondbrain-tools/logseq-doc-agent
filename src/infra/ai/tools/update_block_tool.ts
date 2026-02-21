import { z } from 'zod';
import { tool } from 'ai';
import type { MergeEntity } from '../../../domain/merge/entity';

import { sanitizeBlockId, sanitizeContent } from './tool-utils';
import { parseSubtree } from './subtree-parser';
import { insertSubtreeRecursive } from './block-operations';
import { applyMergeLogicToTree, formatBlockTree } from './get_logseq_document_tool';
import type { LogseqBlock } from './types';

// Access the global logseq object
const getLogseq = () => (window as any).logseq;

/**
 * Creates the updateBlock tool with injected context.
 */
export const createUpdateBlockTool = (context: { merge: boolean }) => tool({
    description: `Update a Logseq block with new content.
    
**Subtree Support:**
If \`parse_subtrees\` is true (default), the content can contain nested blocks using markdown list syntax.
These nested blocks will be inserted as children of the updated block (appended).

**Note on Children:**
Existing children are preserved. New children from the subtree are APPENDED.
To replace or modify specific existing children, please update them individually by their ID.

**Merge Mode:**
If merge is on (default), the block's *own* content update is added as a merge property.
Child blocks are always inserted directly (no merge property on children).

**Return Value:**
Returns the updated block and its full subtree in markdown tree format.`,
    inputSchema: z.object({
        id: z.union([z.number(), z.string()]).describe('The Logseq block ID (integer) or UUID'),
        content: z.string().describe('The new content. Can include nested blocks if parse_subtrees is true.'),
        parse_subtrees: z.boolean().optional().describe('If true (default), parse "- " lists as nested child blocks.'),
    }),
    execute: async ({
        id,
        content,
        parse_subtrees = true,
    }: {
        id: number | string,
        content: string,
        parse_subtrees?: boolean,
    }) => {
        try {
            const logseq = getLogseq();
            if (!logseq) return 'Error: Logseq API not available';

            // Sanitize ID
            const cleanId = sanitizeBlockId(id);
            const block = await logseq.Editor.getBlock(cleanId);

            if (!block || !block.uuid) {
                return `Error: Block not found for ID ${id}`;
            }
            const uuid = block.uuid;

            // 1. Update the Parent Block Content

            // If parsing subtrees, the first part of content is the parent's content
            let parentContent = content;
            let childrenNodes: any[] = [];

            if (parse_subtrees) {
                const parsed = parseSubtree(content);
                parentContent = parsed.content;
                childrenNodes = parsed.children;
            } else {
                // Legacy behavior: sanitize whole content
                parentContent = sanitizeContent(content);
            }

            // Apply Merge Logic to Parent Content
            if (context.merge) {
                const currentContent = block.content || "";

                // Reuse existing logic logic
                const lines = currentContent.split('\n');
                const bodyLines = lines.filter((l: string) => !l.match(/^.+::/));

                // Let's use the explicit logic from before to be safe
                const { body: currentBody, properties: existingPropsStr } = splitContentAttributes(currentContent);

                const existingMergeData = extractExistingMergeData(currentContent);
                const base = existingMergeData?.base || currentBody;

                const mergeData: MergeEntity = {
                    type: 'update',
                    base: base
                };

                let newBlockContent = "";
                if (existingPropsStr) {
                    newBlockContent = existingPropsStr + '\n' + parentContent;
                } else {
                    newBlockContent = parentContent;
                }

                await logseq.Editor.updateBlock(uuid, newBlockContent);
                await logseq.Editor.upsertBlockProperty(uuid, 'logseq-doc-agent.merge', JSON.stringify(mergeData));

            } else {
                // Overwrite
                await logseq.Editor.updateBlock(uuid, parentContent);
            }

            // 2. Handle Children (Subtrees)
            if (parse_subtrees && childrenNodes.length > 0) {
                // Insert new children (append only)
                for (const childNode of childrenNodes) {
                    await insertSubtreeRecursive(uuid, childNode, {}, context.merge);
                }
            }

            // 3. Return the full subtree
            // Fetch updated block with children
            const updatedBlock = await logseq.Editor.getBlock(uuid, { includeChildren: true });
            if (!updatedBlock) {
                return `Successfully updated block ${id}, but failed to retrieve it for display.`;
            }

            // Format as tree
            let blocks: LogseqBlock[] = [updatedBlock];

            // Apply merge logic for display (if merge is enabled generally)
            if (context.merge) {
                blocks = applyMergeLogicToTree(blocks, { ...context, mergeDefault: context.merge, mergeBoth: false }); // Assuming context.merge maps to mergeDefault
            }

            const treeOutput = formatBlockTree(blocks);
            return treeOutput;

        } catch (e) {
            console.error('[UpdateBlockTool] Error:', e);
            return `Error updating block: ${e}`;
        }
    },
} as any);

// --- Helpers ---

function extractExistingMergeData(content: string): MergeEntity | null {
    const match = content.match(/logseq-doc-agent\.merge::\s*(.+)/);
    if (match && match[1]) {
        try {
            return JSON.parse(match[1]);
        } catch (e) { }
    }
    return null;
}

function extractProperties(content: string): string[] {
    // simplified extraction
    const lines = content.split('\n');
    const props = [];
    for (const line of lines) {
        if (/^.+::/.test(line) && !line.startsWith('logseq-doc-agent.merge::')) {
            props.push(line);
        } else {
            break; // Standard Logseq properties are at the top
        }
    }
    return props;
}

function splitContentAttributes(content: string) {
    const lines = content.split('\n');
    const properties: string[] = [];
    const body: string[] = [];
    let inProps = true;

    // Regex for property key:: value
    const propRegex = /^.+::/;

    for (const line of lines) {
        if (inProps) {
            if (propRegex.test(line)) {
                // Check if it's our merge prop - skip it for base content calculation?
                // The previous code included it in existingProperties (except merge prop)
                if (!line.startsWith('logseq-doc-agent.merge::')) {
                    properties.push(line);
                }
            } else {
                inProps = false;
                body.push(line);
            }
        } else {
            body.push(line);
        }
    }

    return {
        body: body.join('\n'),
        properties: properties.join('\n')
    };
}
