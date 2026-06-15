import { z } from "zod";
import { tool } from "ai";
import type { MergeEntity } from "../../../domain/merge/entity";

import { sanitizeBlockId, sanitizeContent } from "./tool-utils";
import {
  parseSubtree,
  formatResultTree,
  type ParsedBlock,
  type InsertedNode,
} from "./subtree-parser";
import { insertSubtreeRecursive } from "./block-operations";
import { getCurrentLogseqApi } from "../../logseq";

/**
 * Creates the addBlock tool with injected context.
 */
export const createAddBlockTool = (context: { merge: boolean }) =>
  tool({
    description: `Add blocks to Logseq. Supports single blocks or nested subtrees.

**Subtree syntax** (when parse_subtrees=true, the default):
- Lines starting with "- " become unordered child blocks
- Lines starting with "N. " (e.g. "1. ", "2. ") become ordered (numbered) child blocks
- Indentation (2 spaces or tab) creates nesting levels
- Properties use "prop:: value" format on indented lines under the block
- Text before the first list item becomes the root block content

**Example - Single block:**
content: "My new block"
→ Creates one block

**Example - Ordered subtree:**
content: "Root content
1. First numbered child
2. Second numbered child
   1. Nested ordered grandchild"
→ Creates numbered list blocks. Each gets logseq.order-list-type:: number set.

**Example - Subtree with properties:**
content: "Root content
- First child
  status:: todo
  - Grandchild A
  - Grandchild B
- Second child"

→ Creates nested structure. Returns markdown-style tree with IDs.

Use the \`ordered\` parameter to mark the root block as ordered regardless of syntax.

On partial failure, returns tree built so far + error.`,
    inputSchema: z.object({
      targetId: z
        .union([z.number(), z.string()])
        .describe("The Logseq ID (integer) of the target block/page to add to"),
      content: z
        .string()
        .describe(
          'Block content. Supports nested blocks using "- " (unordered) or "N. " (ordered) list syntax with indentation.',
        ),
      anchor: z
        .enum(["parent", "before", "after"])
        .optional()
        .describe('Where to insert relative to target. Default is "parent" (append as child).'),
      parse_subtrees: z
        .boolean()
        .optional()
        .describe(
          'If true (default), parse "- " and "N. " lists as nested child blocks. If false, escape lists to preserve as literal text.',
        ),
      ordered: z
        .boolean()
        .optional()
        .describe(
          "If true, mark the root inserted block as an ordered (numbered) list item by setting logseq.order-list-type:: number. Does not affect children parsed from subtree syntax.",
        ),
    }),
    execute: async ({
      targetId,
      content,
      anchor = "parent",
      parse_subtrees = true,
      ordered,
    }: {
      targetId: number | string;
      content: string;
      anchor?: "parent" | "before" | "after";
      parse_subtrees?: boolean;
      ordered?: boolean;
    }) => {
      try {
        const logseq = getCurrentLogseqApi();
        let cleanTargetId = sanitizeBlockId(targetId);

        let targetBlock = await logseq.getBlock(cleanTargetId);
        if (!targetBlock) {
          // Fallback: Check if it's a page
          const page = await logseq.getPage(cleanTargetId as any);
          if (page) {
            targetBlock = page as any; // Treating page as block for uuid access
          }
        }

        if (!targetBlock || !targetBlock.uuid) {
          return `Error: Could not find target block or page with ID ${targetId}`;
        }
        const targetUuid = targetBlock.uuid;

        // Logseq insertBlock options for the root block
        const rootOptions: any = {};
        if (anchor === "before") {
          rootOptions.sibling = true;
          rootOptions.before = true;
        } else if (anchor === "after") {
          rootOptions.sibling = true;
          rootOptions.before = false;
        }
        // else 'parent' -> defaults (child)

        // If parse_subtrees is false, use the old behavior
        if (!parse_subtrees) {
          const finalContent = sanitizeContent(content);
          const newBlock = await logseq.insertBlock(targetUuid, finalContent, rootOptions);

          if (!newBlock) {
            return `Error: Failed to insert block at ${targetId}`;
          }

          if (ordered && newBlock.uuid) {
            await logseq.upsertBlockProperty(newBlock.uuid, "logseq.order-list-type", "number");
          }

          if (newBlock && context.merge) {
            const blockUuid = newBlock.uuid;
            if (blockUuid) {
              const mergeData: MergeEntity = { type: "add" };
              await logseq.upsertBlockProperty(
                blockUuid,
                "logseq-doc-agent.merge",
                JSON.stringify(mergeData),
              );
            }
          }

          let blockId: number | undefined = newBlock.id;
          if (blockId === undefined && newBlock.uuid) {
            const fetchedBlock = await logseq.getBlock(newBlock.uuid);
            blockId = fetchedBlock?.id;
          }

          const idStr = blockId !== undefined ? String(blockId) : "unknown";
          return `Successfully added block (id:${idStr}) ${anchor} ${targetId}.`;
        }

        // Parse subtrees mode (default)
        const parsedTree = parseSubtree(content);

        // Apply root-level ordered flag if explicitly passed
        if (ordered === true) {
          parsedTree.ordered = true;
        }

        // Insert the tree recursively
        const insertedTree = await insertSubtreeRecursive(
          targetUuid,
          parsedTree,
          rootOptions,
          context.merge,
        );

        // Format and return the result
        const resultTree = formatResultTree(insertedTree);

        if (insertedTree.error) {
          return `Partial success (error occurred):\n${resultTree}`;
        }

        return `Successfully added subtree ${anchor} ${targetId}:\n${resultTree}`;
      } catch (e) {
        console.error("[AddBlockTool] Error:", e);
        return `Error adding block: ${e}`;
      }
    },
  } as any);

/**
 * Recursively inserts a parsed block tree into Logseq.
 *
 * @param parentUuid The UUID of the parent block to insert under
 * @param node The ParsedBlock to insert
 * @param options Options for the insertBlock call (only used for root)
 * @param merge Whether to add merge metadata
 * @returns InsertedNode with IDs and any errors
 */
// Function moved to ./block-operations.ts
