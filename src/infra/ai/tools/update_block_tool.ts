import { z } from "zod";
import { tool } from "ai";
import type { MergeEntity } from "../../../domain/merge/entity";

import { sanitizeBlockId, sanitizeContent } from "./tool-utils";
import { parseSubtree } from "./subtree-parser";
import { insertSubtreeRecursive } from "./block-operations";
import { applyMergeLogicToTree, formatBlockTree } from "./get_logseq_document_tool";
import type { LogseqBlock } from "./types";
import {
  extractExistingMergeData,
  splitContentAttributes,
  LDA_MERGE_PROPERTY,
} from "../../../domain/logseq/properties";
import { getCurrentLogseqApi } from "../../logseq";

/**
 * Creates the updateBlock tool with injected context.
 */
export const createUpdateBlockTool = (context: { merge: boolean }) =>
  tool({
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
      id: z.union([z.number(), z.string()]).describe("The Logseq block ID (integer) or UUID"),
      content: z
        .string()
        .describe("The new content. Can include nested blocks if parse_subtrees is true."),
      parse_subtrees: z
        .boolean()
        .optional()
        .describe('If true (default), parse "- " and "N. " lists as nested child blocks.'),
      ordered: z
        .boolean()
        .optional()
        .describe(
          "Set to true to mark the block as an ordered (numbered) list item, false to remove ordered mode, or omit to leave unchanged.",
        ),
    }),
    execute: async ({
      id,
      content,
      parse_subtrees = true,
      ordered,
    }: {
      id: number | string;
      content: string;
      parse_subtrees?: boolean;
      ordered?: boolean;
    }) => {
      try {
        const logseq = getCurrentLogseqApi();

        // Sanitize ID
        const cleanId = sanitizeBlockId(id);
        const block = await logseq.getBlock(cleanId);

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
          const lines = currentContent.split("\n");
          const bodyLines = lines.filter((l: string) => !l.match(/^.+::/));

          // Let's use the explicit logic from before to be safe
          const { body: currentBody, properties: existingPropsStr } =
            splitContentAttributes(currentContent);

          const existingMergeData = extractExistingMergeData(currentContent);
          const base = existingMergeData?.base || currentBody;

          const mergeData: MergeEntity = {
            type: "update",
            base: base,
          };

          let newBlockContent = "";
          if (existingPropsStr) {
            newBlockContent = existingPropsStr + "\n" + parentContent;
          } else {
            newBlockContent = parentContent;
          }

          await logseq.updateBlock(uuid, newBlockContent);
          await logseq.upsertBlockProperty(uuid, LDA_MERGE_PROPERTY, JSON.stringify(mergeData));
        } else {
          // Overwrite
          await logseq.updateBlock(uuid, parentContent);
        }

        // Handle ordered list mode change
        if (ordered === true) {
          await logseq.upsertBlockProperty(uuid, "logseq.order-list-type", "number");
        } else if (ordered === false) {
          await logseq.removeBlockProperty(uuid, "logseq.order-list-type");
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
        const rawBlock = await logseq.getBlock(uuid, { includeChildren: true });
        if (!rawBlock) {
          return `Successfully updated block ${id}, but failed to retrieve it for display.`;
        }

        // FORCE CLEAN JSON to avoid Transit/Bean issues
        const updatedBlock = JSON.parse(JSON.stringify(rawBlock));

        // Format as tree
        let blocks: LogseqBlock[] = [updatedBlock];

        // Apply merge logic for display (if merge is enabled generally)
        if (context.merge) {
          blocks = applyMergeLogicToTree(blocks, {
            ...context,
            mergeDefault: context.merge,
            mergeBoth: false,
          }); // Assuming context.merge maps to mergeDefault
        }

        const treeOutput = formatBlockTree(blocks);
        return treeOutput;
      } catch (e) {
        console.error("[UpdateBlockTool] Error:", e);
        return `Error updating block: ${e}`;
      }
    },
  } as any);

// --- Helpers ---

function extractProperties(content: string): string[] {
  // simplified extraction
  const lines = content.split("\n");
  const props = [];
  for (const line of lines) {
    if (/^.+::/.test(line) && !line.startsWith(`${LDA_MERGE_PROPERTY}::`)) {
      props.push(line);
    } else {
      break; // Standard Logseq properties are at the top
    }
  }
  return props;
}
