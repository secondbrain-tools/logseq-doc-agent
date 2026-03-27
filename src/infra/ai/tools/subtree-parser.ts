/**
 * Subtree Parser for addBlock tool
 * 
 * ParsedBlock tree structure that can be recursively inserted into Logseq.
 */

import { LOGSEQ_PROPERTY_START_REGEX, LOGSEQ_PROPERTY_REGEX } from '../../../domain/logseq/properties';

export interface ParsedBlock {
    content: string;
    properties: Record<string, string>;
    children: ParsedBlock[];
    ordered?: boolean;
}

/**
 * Determines the indentation level of a line.
 * Supports tabs (count as 2 spaces) or spaces.
 * Returns the nesting depth (0 = no indent, 1 = one level, etc.)
 */
function getIndentLevel(line: string): number {
    let spaces = 0;
    for (const char of line) {
        if (char === ' ') {
            spaces++;
        } else if (char === '\t') {
            spaces += 2; // Tab counts as 2 spaces
        } else {
            break;
        }
    }
    // Every 2 spaces = 1 indent level
    return Math.floor(spaces / 2);
}

/**
 * Checks if a line is an unordered list item (starts with "- " after optional whitespace)
 */
function isListItem(line: string): boolean {
    return /^\s*-\s+/.test(line);
}

/**
 * Checks if a line is an ordered list item (starts with "N. " after optional whitespace)
 */
function isOrderedListItem(line: string): boolean {
    return /^\s*\d+\.\s+/.test(line);
}

/**
 * Checks if a line is a header item (starts with "#" after optional whitespace)
 */
function isHeaderItem(line: string): boolean {
    return /^\s*#+\s+/.test(line);
}

/**
 * Checks if a line is any kind of list item (unordered or ordered or header)
 */
function isAnyListItem(line: string): boolean {
    return isListItem(line) || isOrderedListItem(line) || isHeaderItem(line);
}

/**
 * Checks if a line is a property definition (key:: value)
 */
function isProperty(line: string): boolean {
    return LOGSEQ_PROPERTY_START_REGEX.test(line);
}

/**
 * Extracts the content from an unordered list item line (removes the "- " prefix)
 */
function extractListContent(line: string): string {
    return line.replace(/^\s*-\s+/, '');
}

/**
 * Extracts the content from an ordered list item line (removes the "N. " prefix)
 */
function extractOrderedListContent(line: string): string {
    return line.replace(/^\s*\d+\.\s+/, '');
}

/**
 * Parses a property line into key-value pair
 */
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

/**
 * Parses the input content into a tree structure.
 * 
 * Rules:
 * - Text before the first list item becomes root block content
 * - Lines starting with "- " become unordered child blocks
 * - Lines starting with "N. " (e.g. "1. ", "2. ") become ordered child blocks
 * - Indentation (tabs or 2+ spaces) determines nesting depth
 * - Lines with "key:: value" after a block are properties for that block
 * 
 * @param input The raw content string
 * @returns ParsedBlock tree structure
 */
export function parseSubtree(input: string): ParsedBlock {
    const lines = input.split('\n');

    // Process all lines into structured info
    const lineInfos: LineInfo[] = lines.map(line => ({
        original: line,
        indentLevel: getIndentLevel(line),
        isListItem: isListItem(line),
        isOrderedItem: isOrderedListItem(line),
        isHeaderItem: isHeaderItem(line),
        isAnyItem: isAnyListItem(line),
        isProperty: isProperty(line),
        content: line.trim()
    }));

    // Find where the list starts (first line with "- " or "N. ")
    const firstListIndex = lineInfos.findIndex((info, index) => {
        // A heading on the first line of the input does not start a list break
        if (index === 0 && info.isHeaderItem && !info.isListItem && !info.isOrderedItem) {
            return false;
        }
        return info.isAnyItem;
    });

    // Everything before the first list item is the root content
    let rootContent = '';
    if (firstListIndex === -1) {
        // No list items at all - entire content is root block
        rootContent = input.trim();
        return {
            content: rootContent,
            properties: {},
            children: []
        };
    } else if (firstListIndex > 0) {
        // There's preamble content
        rootContent = lines.slice(0, firstListIndex).join('\n').trim();
    }

    // Parse the list portion
    const listLines = lineInfos.slice(firstListIndex);
    const firstIndent = listLines.length > 0 ? listLines[0].indentLevel : 0;
    const children = parseListItems(listLines, firstIndent);

    return {
        content: rootContent,
        properties: {},
        children
    };
}

function parseListItems(lines: LineInfo[], baseIndent: number): ParsedBlock[] {
    const result: ParsedBlock[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Skip empty lines at the root of this level
        if (line.content === '') {
            i++;
            continue;
        }

        // We process any line that matches baseIndent as a block start
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

                if (nextLine.content === '') {
                    pendingEmptyLines++;
                    i++;
                    continue;
                }

                if (nextLine.indentLevel < baseIndent) {
                    // We hit a parent block
                    break;
                }

                if (nextLine.indentLevel === baseIndent) {
                    if (nextLine.isAnyItem || hasSeenChild) {
                        // We hit a sibling block or a child, stop collecting for this block
                        break;
                    }
                }

                // If we reach here, nextLine.indentLevel > baseIndent

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
                    // Continuation of current block's content
                    for (let j = 0; j < pendingEmptyLines; j++) {
                        block.content += '\n';
                    }
                    pendingEmptyLines = 0;
                    block.content += '\n' + nextLine.content;
                } else {
                    // Add to child lines for recursive parsing
                    for (let j = 0; j < pendingEmptyLines; j++) {
                        childLines.push({
                            original: '',
                            indentLevel: baseIndent + 1, // Dummy indent sufficient for recursive call
                            isListItem: false,
                            isOrderedItem: false,
                            isHeaderItem: false,
                            isAnyItem: false,
                            isProperty: false,
                            content: ''
                        });
                    }
                    pendingEmptyLines = 0;
                    childLines.push(nextLine);
                }

                i++;
            }

            // Parse collected child lines recursively
            if (childLines.length > 0) {
                block.children = parseListItems(childLines, baseIndent + 1);
            }

            result.push(block);
        } else if (line.indentLevel < baseIndent) {
            // We've moved back to a parent level, stop
            break;
        } else {
            // Skip lines that somehow have higher indent without matching baseIndent first
            i++;
        }
    }

    return result;
}

/**
 * Represents an inserted block with its ID and children
 */
export interface InsertedNode {
    id: number | string;
    content: string;
    children: InsertedNode[];
    error?: string;
}

/**
 * Formats the result tree as a markdown-style list for LLM consumption.
 * Valid markdown syntax with indentation.
 * 
 * Example:
 * id:123 "Root block content..."
 * - id:124 "Child block..."
 *   - id:125 "Grandchild..."
 * 
 * @param node The root InsertedNode
 * @param depth Current indentation depth (0 for root)
 * @returns Formatted tree string
 */
export function formatResultTree(node: InsertedNode, depth: number = 0): string {
    const preview = node.content.slice(0, 10).padEnd(10, ' ').replace(/\n/g, ' ') + '...';

    // Format based on depth
    // Root (depth 0): just the content line
    // Children (depth > 0): indented list item "- "
    const indent = '  '.repeat(Math.max(0, depth - 1));
    const prefix = depth === 0 ? '' : `${indent}- `;

    let result = `${prefix}id:${node.id} "${preview}"`;

    if (node.error) {
        result += ` [ERROR: ${node.error}]`;
    }

    if (node.children.length === 0) {
        return result;
    }

    const childLines = node.children.map(child => formatResultTree(child, depth + 1));
    return result + '\n' + childLines.join('\n');
}
