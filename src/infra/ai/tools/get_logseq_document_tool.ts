import { tool } from "ai";
import { z } from "zod";
import {
  type LogseqSelection,
  type LogseqBlock,
  type LogseqPage,
  isLogseqBlockEntity,
} from "./types";
import {
  filterPropertyLinesFromContent,
  LOGSEQ_INTERNAL_CONTENT_PROPERTIES,
  LOGSEQ_PROPERTY_REGEX,
} from "../../../domain/logseq/properties";
import { getCurrentLogseqApi } from "../../logseq";

function isIntegerId(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

/** Resolve page by optional document identifier (name, uuid, or integer id). Returns null if not found. */
async function resolvePage(document?: string | number | null): Promise<LogseqPage | null> {
  const logseq = getCurrentLogseqApi();
  const raw = document === undefined || document === null ? "" : String(document).trim();
  if (raw === "") {
    return logseq.getCurrentPage();
  }

  let page = await logseq.getPage(raw);
  if (page) return page;

  if (isIntegerId(raw)) {
    const id = Number(raw);
    const allPages = await logseq.getAllPages();
    if (Array.isArray(allPages)) {
      const byId = allPages.find((p: any) => p.id === id);
      if (byId) return byId;
    }
  }

  return null;
}

export const createGetLogseqDocumentTool = (context: {
  mergeDefault: boolean;
  mergeBoth: boolean;
}) =>
  tool({
    description:
      "Returns a Logseq page as a markdown tree with IDs. Leave document empty for the current document, or pass a document name, UUID, or integer id.",
    inputSchema: z.object({
      document: z
        .string()
        .optional()
        .describe(
          "Optional: document name, UUID, or integer id. Omit or leave empty for the current document.",
        ),
    }),
    execute: async (args: { document?: string }) => {
      const logseq = getCurrentLogseqApi();

      const currentPage = await resolvePage(args?.document);
      if (!currentPage) {
        return args?.document
          ? `Document not found: "${args.document}".`
          : "No document currently active.";
      }

      let blocks: LogseqBlock[] = [];
      const pageRef =
        currentPage.uuid ??
        currentPage.name ??
        currentPage.originalName ??
        String(currentPage.id ?? "");
      if (pageRef) {
        blocks = (await logseq.getPageBlocksTree(pageRef)) || [];
      }

      if (context.mergeDefault || context.mergeBoth) {
        blocks = applyMergeLogicToTree(blocks, context);
      }

      return buildDocumentResponse(currentPage, blocks);
    },
  } as any);

export function applyMergeLogicToTree(
  blocks: LogseqBlock[],
  context: { mergeDefault: boolean; mergeBoth: boolean },
): LogseqBlock[] {
  return blocks.map((block) => {
    const newBlock = { ...block };

    const content = newBlock.content || "";
    const match = content.match(/logseq-doc-agent\.merge::\s*(.+)/);
    if (match && match[1]) {
      try {
        const mergeData = JSON.parse(match[1]);
        if (mergeData) {
          const cleanedBody = cleanBlockContent(newBlock.content);

          if (context.mergeBoth) {
            newBlock.content = `[BASE]\n${mergeData.base || ""}\n[PROPOSED]\n${cleanedBody}`;
          } else if (context.mergeDefault) {
            newBlock.content = cleanedBody;
          }
        }
      } catch (e) {}
    }

    if (newBlock.children && newBlock.children.length > 0) {
      newBlock.children = applyMergeLogicToTree(newBlock.children, context);
    }

    return newBlock;
  });
}

export function buildDocumentResponse(selection: LogseqSelection, blocks: LogseqBlock[]) {
  const summaryLines = describeSelection(selection);
  const blockTree = formatBlockTree(blocks);

  if (!blockTree) {
    return [...summaryLines, "", "(no blocks)"].join("\n");
  }

  return [...summaryLines, "", blockTree].join("\n");
}

export function describeSelection(selection: LogseqSelection) {
  if (isLogseqBlockEntity(selection)) {
    const pageLabel = extractPageLabel(selection);
    const blockLabel =
      selection.id !== undefined ? `id:${selection.id}` : selection.uuid || "unknown-block";
    const preview = cleanBlockContent(selection.content) || "(empty block)";
    return [
      "Selection Type: block",
      `Page: ${pageLabel}`,
      `Active Block ID: ${blockLabel}`,
      `Active Block Preview: ${preview}`,
    ];
  }

  const pageName =
    (typeof selection.originalName === "string" && selection.originalName.length
      ? selection.originalName
      : undefined) ??
    (typeof selection.name === "string" && selection.name.length ? selection.name : undefined) ??
    (typeof selection.uuid === "string" && selection.uuid.length ? selection.uuid : undefined) ??
    "Untitled Page";

  let pageLabel = pageName;
  if (selection.id) {
    pageLabel += ` (id:${selection.id})`;
  }

  return ["Selection Type: page", `Page: ${pageLabel}`];
}

export function extractPageLabel(selection: LogseqBlock) {
  const page = selection.page;
  if (typeof page === "object" && page !== null) {
    let label =
      (typeof page.originalName === "string" && page.originalName.length
        ? page.originalName
        : undefined) ??
      (typeof page.name === "string" && page.name.length ? page.name : undefined) ??
      (typeof page.uuid === "string" && page.uuid.length ? page.uuid : undefined) ??
      "Unknown Page";

    if (page.id) {
      label += ` (id:${page.id})`;
    }
    return label;
  }
  if (typeof page === "string" && page.length > 0) {
    return page;
  }
  return "Unknown Page";
}

export function formatBlockTree(blocks: LogseqBlock[], depth: number = 0): string {
  if (!blocks || blocks.length === 0) return "";
  return blocks.map((block, idx) => formatSingleBlock(block, depth, idx + 1)).join("\n");
}

function formatSingleBlock(block: LogseqBlock, depth: number, siblingNumber: number): string {
  const indent = "  ".repeat(depth);
  const content = cleanBlockContent(block.content) || "(empty block)";
  const lines = content.split("\n");

  const idLabel =
    block.id !== undefined ? `id:${block.id}` : block.uuid ? `uuid:${block.uuid}` : "block";

  const isOrdered =
    block.properties?.["logseq.orderListType"] === "number" ||
    block.properties?.logseqOrderListType === "number" ||
    block.properties?.["logseq.order-list-type"] === "number";
  const bullet = isOrdered ? `${siblingNumber}. ` : "- ";

  let result = `${indent}${bullet}${idLabel} ${lines[0]}`;

  if (lines.length > 1) {
    const contentIndent = indent + "  ";
    const remainingLines = lines
      .slice(1)
      .map((l) => `${contentIndent}${l}`)
      .join("\n");
    result += "\n" + remainingLines;
  }

  if (block.children && block.children.length > 0) {
    const childrenStr = formatBlockTree(block.children, depth + 1);
    if (childrenStr) {
      result += "\n" + childrenStr;
    }
  }

  return result;
}

export function cleanBlockContent(content?: string | null) {
  if (!content) {
    return "";
  }

  const afterLda = filterPropertyLinesFromContent(content);
  const filtered = afterLda
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      const propMatch = trimmed.match(LOGSEQ_PROPERTY_REGEX);
      if (!propMatch) return true;
      const key = propMatch[1].trim();
      return !(LOGSEQ_INTERNAL_CONTENT_PROPERTIES as readonly string[]).includes(key);
    })
    .map((line) => line.trimEnd());

  return filtered.join("\n").trim();
}
