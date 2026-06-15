import type { SnapshotBlock, SnapshotPage } from "./snapshot-parser";
import { parseSnapshot } from "./snapshot-parser";

/**
 * Normalizes content string for matching: removes markdown formatting,
 * Logseq property-style prefixes, collapses whitespace, and takes a prefix.
 */
function normalizeContent(text: string): string {
  return (
    text
      // Remove markdown headings
      .replace(/^#+\s+/, "")
      // Remove Logseq property-style prefix "Key: " at start of block
      .replace(/^[A-Z][^:]{0,40}:\s+/, "")
      // Remove bold/italic
      .replace(/[*_]/g, "")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 60)
  );
}

/**
 * Extracts the embedded getLogseqDocument context from a chatlog's user message.
 */
export function extractChatlogContext(chatlog: any): string | null {
  for (const msg of chatlog.messages) {
    if (msg.role !== "user" || !msg.parts) continue;
    for (const part of msg.parts) {
      if (part.type === "context" && part.contextContent) {
        return part.contextContent;
      }
    }
  }
  return null;
}

/**
 * Builds a flat index: normalized content → block id for all blocks in a tree.
 */
function buildContentIndex(
  blocks: SnapshotBlock[],
  index: Map<string, number> = new Map(),
): Map<string, number> {
  for (const block of blocks) {
    const key = normalizeContent(block.content);
    if (key.length > 0) {
      index.set(key, block.id);
    }
    buildContentIndex(block.children, index);
  }
  return index;
}

/**
 * Matches blocks between two trees by **content** (not by position).
 * This handles the case where Logseq assigns IDs in a different order
 * than the tree display order (which is common).
 */
export function buildIdRemap(
  sourceTree: SnapshotPage,
  targetTree: SnapshotPage,
): Map<number, number> {
  const map = new Map<number, number>();

  // Map page IDs
  map.set(sourceTree.pageId, targetTree.pageId);

  // Build a content→id index from the target tree
  const targetIndex = buildContentIndex(targetTree.blocks);

  // Walk the source tree and look up each block by content
  function matchRecursive(blocks: SnapshotBlock[]) {
    for (const block of blocks) {
      const key = normalizeContent(block.content);
      if (key.length > 0 && targetIndex.has(key)) {
        map.set(block.id, targetIndex.get(key)!);
      } else if (key.length > 0) {
        // Fallback: substring match for edited content (prefix added/removed)
        let found = false;
        for (const [targetKey, targetId] of targetIndex) {
          if (targetKey.includes(key) || key.includes(targetKey)) {
            console.log(
              `[IdRemapper] Fuzzy match: source ${block.id} "${key}" ~ target ${targetId} "${targetKey}"`,
            );
            map.set(block.id, targetId);
            found = true;
            break;
          }
        }
        if (!found) {
          console.warn(`[IdRemapper] No match for source block ${block.id}: "${key}"`);
        }
      }
      matchRecursive(block.children);
    }
  }

  matchRecursive(sourceTree.blocks);
  return map;
}

/**
 * Chains two ID maps: sourceId → middleId → targetId.
 */
export function chainIdMaps(
  aToB: Map<number, number>,
  bToC: Map<number, number>,
): Map<number, number> {
  const chained = new Map<number, number>();
  for (const [a, b] of aToB) {
    const c = bToC.get(b);
    if (c !== undefined) {
      chained.set(a, c);
    } else {
      console.warn(`[IdRemapper] Chain broken: ${a} → ${b} → ? (no mapping)`);
    }
  }
  return chained;
}

/**
 * Builds a full remap from chatlog IDs → current Logseq IDs.
 *
 * Chains: chatlog context IDs → snapshot IDs → current IDs,
 * all matched by content (not position).
 */
export function buildFullRemap(
  chatlogContextText: string,
  snapshotText: string,
  currentText: string,
): Map<number, number> {
  const chatlogTree = parseSnapshot(chatlogContextText);
  const snapshotTree = parseSnapshot(snapshotText);
  const currentTree = parseSnapshot(currentText);

  const chatlogToSnapshot = buildIdRemap(chatlogTree, snapshotTree);
  const snapshotToCurrent = buildIdRemap(snapshotTree, currentTree);

  return chainIdMaps(chatlogToSnapshot, snapshotToCurrent);
}

/**
 * Traverses a chatlog structure and rewrites all 'id' and 'targetId' fields
 * in 'tool_call' arguments using the provided remapping table.
 */
export function remapChatlog(chatlog: any, idMap: Map<number, number>): any {
  const remapped = structuredClone(chatlog);

  if (!remapped.messages || !Array.isArray(remapped.messages)) {
    return remapped;
  }

  for (const msg of remapped.messages) {
    if (!msg.parts || !Array.isArray(msg.parts)) continue;

    for (const part of msg.parts) {
      if ((part.type === "tool_call" || part.type === "tool-call") && part.toolArgs) {
        const args = part.toolArgs;

        for (const field of ["id", "targetId", "parentId"]) {
          if (typeof args[field] === "number") {
            const oldId = args[field];
            if (idMap.has(oldId)) {
              args[field] = idMap.get(oldId)!;
            } else {
              console.warn(`[IdRemapper] Tool call referenced ID ${oldId} but no remap available.`);
            }
          }
        }

        if (part.toolName === "getLogseqDocument" && typeof args.document === "string") {
          const num = parseInt(args.document, 10);
          if (!isNaN(num) && idMap.has(num)) {
            args.document = String(idMap.get(num)!);
          }
        }
      }
    }
  }

  return remapped;
}
