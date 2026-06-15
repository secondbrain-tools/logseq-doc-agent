import { z } from "zod";
import { tool } from "ai";
import type { MergeEntity } from "../../../domain/merge/entity";

import { sanitizeBlockId } from "./tool-utils";
import { LDA_MERGE_PROPERTY } from "../../../domain/logseq/properties";
import { getCurrentLogseqApi } from "../../logseq";

/**
 * Creates the deleteBlock tool with injected context.
 */
export const createDeleteBlockTool = (context: { merge: boolean }) =>
  tool({
    description:
      "Delete a block. If merge is on, marks it for deletion instead of actually deleting.",
    inputSchema: z.object({
      id: z.union([z.number(), z.string()]).describe("The Logseq block ID (integer) to delete"),
    }),
    execute: async ({ id }: { id: number | string }) => {
      try {
        const logseq = getCurrentLogseqApi();
        // Sanitize ID: handle '#123' format from prompt or stringified numbers
        const cleanId = sanitizeBlockId(id);

        const block = await logseq.getBlock(cleanId);
        if (!block || !block.uuid) {
          return `Error: Block not found for ID ${id}`;
        }
        const uuid = block.uuid;

        if (context.merge) {
          // Optimistic Merge Logic for Delete:
          // Instead of deleting, we mark it as 'delete' in merge property.
          // We do NOT change content significantly, maybe just append the merge prop.

          // Fetch fresh block to get content
          const freshBlock = await logseq.getBlock(uuid);
          const currentContent = freshBlock?.content || "";

          // We need to parse existing properties to inject ours cleanly,
          // similar to updateBlock but we don't need to stash "originalContent"
          // because we aren't changing the body, just adding a tag.

          // We actually don't need to do any parsing if we use upsertBlockProperty
          // The content remains the same (effectively), we just add the property.

          const mergeData: MergeEntity = {
            type: "delete",
            // originalContent removed as per user request (tag is sufficient)
          };

          await logseq.upsertBlockProperty(uuid, LDA_MERGE_PROPERTY, JSON.stringify(mergeData));
          return `Marked block ${id} for deletion "${currentContent.substring(0, 50)}..."`;
        } else {
          // Hard delete
          // Fetch content before deleting for the result summary
          const freshBlock = await logseq.getBlock(uuid);
          const currentContent = freshBlock?.content || "";

          await logseq.deleteBlock(uuid);
          return `Deleted block ${id} "${currentContent.substring(0, 50)}..."`;
        }
      } catch (e) {
        console.error("[DeleteBlockTool] Error:", e);
        return `Error deleting block: ${e}`;
      }
    },
  } as any);
