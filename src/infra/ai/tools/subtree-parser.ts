/**
 * Subtree Parser for addBlock tool
 *
 * ParsedBlock tree structure that can be recursively inserted into Logseq.
 */

import {
  LOGSEQ_PROPERTY_START_REGEX,
  LOGSEQ_PROPERTY_REGEX,
} from "../../../domain/logseq/properties";

export interface ParsedBlock {
  content: string;
  properties: Record<string, string>;
  children: ParsedBlock[];
  ordered?: boolean;
}

function getIndentLevel(line: string): number {
  let spaces = 0;
  for (const char of line) {
    if (char === " ") {
      spaces++;
    } else if (char === "\t") {
      spaces += 2;
    } else {
      break;
    }
  }
  return Math.floor(spaces / 2);
}

function isListItem(line: string): boolean {
  return /^\s*-\s+/.test(line);
}

function isOrderedListItem(line: string): boolean {
  return /^\s*\d+\.\s+/.test(line);
}

function isHeaderItem(line: string): boolean {
  return /^\s*#+\s+/.test(line);
}

function isAnyListItem(line: string): boolean {
  return isListItem(line) || isOrderedListItem(line) || isHeaderItem(line);
}

function isProperty(line: string): boolean {
  return LOGSEQ_PROPERTY_START_REGEX.test(line);
}

function extractListContent(line: string): string {
  return line.replace(/^\s*-\s+/, "");
}

function extractOrderedListContent(line: string): string {
  return line.replace(/^\s*\d+\.\s+/, "");
}

function parseProperty(line: string): { key: string; value: string } | null {
  const match = line.match(LOGSEQ_PROPERTY_REGEX);
  if (match) {
    return { key: match[1], value: match[2].trim() };
  }
  return null;
}

interface LineInfo {
  original: string;
  indentLevel: number;
  isListItem: boolean;
  isOrderedItem: boolean;
  isHeaderItem: boolean;
  isAnyItem: boolean;
  isProperty: boolean;
  content: string;
}

export function parseSubtree(input: string): ParsedBlock {
  const lines = input.split("\n");

  const lineInfos: LineInfo[] = lines.map((line) => ({
    original: line,
    indentLevel: getIndentLevel(line),
    isListItem: isListItem(line),
    isOrderedItem: isOrderedListItem(line),
    isHeaderItem: isHeaderItem(line),
    isAnyItem: isAnyListItem(line),
    isProperty: isProperty(line),
    content: line.trim(),
  }));

  const firstListIndex = lineInfos.findIndex((info, index) => {
    if (index === 0 && info.isHeaderItem && !info.isListItem && !info.isOrderedItem) {
      return false;
    }
    return info.isAnyItem;
  });

  let rootContent = "";
  if (firstListIndex === -1) {
    rootContent = input.trim();
    return {
      content: rootContent,
      properties: {},
      children: [],
    };
  } else if (firstListIndex > 0) {
    rootContent = lines.slice(0, firstListIndex).join("\n").trim();
  }

  const listLines = lineInfos.slice(firstListIndex);
  const firstIndent = listLines.length > 0 ? listLines[0].indentLevel : 0;
  const children = parseListItems(listLines, firstIndent);

  return {
    content: rootContent,
    properties: {},
    children,
  };
}

function parseListItems(lines: LineInfo[], baseIndent: number): ParsedBlock[] {
  const result: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.content === "") {
      i++;
      continue;
    }

    if (line.indentLevel === baseIndent) {
      let itemContent = line.content;
      if (line.isAnyItem) {
        if (line.isOrderedItem) {
          itemContent = extractOrderedListContent(line.original);
        } else if (line.isListItem) {
          itemContent = extractListContent(line.original);
        } else if (line.isHeaderItem) {
          itemContent = line.content;
        }
      }

      const block: ParsedBlock = {
        content: itemContent,
        properties: {},
        children: [],
        ordered: line.isOrderedItem ? true : undefined,
      };

      i++;

      const childLines: LineInfo[] = [];
      let hasSeenChild = false;
      let pendingEmptyLines = 0;

      while (i < lines.length) {
        const nextLine = lines[i];

        if (nextLine.content === "") {
          pendingEmptyLines++;
          i++;
          continue;
        }

        if (nextLine.indentLevel < baseIndent) {
          break;
        }

        if (nextLine.indentLevel === baseIndent) {
          if (nextLine.isAnyItem || hasSeenChild) {
            break;
          }
        }

        if (nextLine.isProperty) {
          const prop = parseProperty(nextLine.original);
          if (prop) {
            block.properties[prop.key] = prop.value;
          }
          pendingEmptyLines = 0;
          i++;
          continue;
        }

        if (nextLine.isAnyItem) {
          hasSeenChild = true;
        }

        if (!hasSeenChild) {
          for (let j = 0; j < pendingEmptyLines; j++) {
            block.content += "\n";
          }
          pendingEmptyLines = 0;
          block.content += "\n" + nextLine.content;
        } else {
          for (let j = 0; j < pendingEmptyLines; j++) {
            childLines.push({
              original: "",
              indentLevel: baseIndent + 1,
              isListItem: false,
              isOrderedItem: false,
              isHeaderItem: false,
              isAnyItem: false,
              isProperty: false,
              content: "",
            });
          }
          pendingEmptyLines = 0;
          childLines.push(nextLine);
        }

        i++;
      }

      if (childLines.length > 0) {
        block.children = parseListItems(childLines, baseIndent + 1);
      }

      result.push(block);
    } else if (line.indentLevel < baseIndent) {
      break;
    } else {
      i++;
    }
  }

  return result;
}

export interface InsertedNode {
  id: number | string;
  content: string;
  children: InsertedNode[];
  error?: string;
}

export function formatResultTree(node: InsertedNode, depth: number = 0): string {
  const preview = node.content.slice(0, 10).padEnd(10, " ").replace(/\n/g, " ") + "...";
  const indent = "  ".repeat(Math.max(0, depth - 1));
  const prefix = depth === 0 ? "" : `${indent}- `;

  let result = `${prefix}id:${node.id} "${preview}"`;

  if (node.error) {
    result += ` [ERROR: ${node.error}]`;
  }

  if (node.children.length === 0) {
    return result;
  }

  const childLines = node.children.map((child) => formatResultTree(child, depth + 1));
  return result + "\n" + childLines.join("\n");
}
