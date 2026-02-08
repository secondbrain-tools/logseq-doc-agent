/**
 * Subtree Parser for addBlock tool
 * 
 * Parses markdown-style nested lists into a tree structure
 * that can be recursively inserted into Logseq.
 */

export interface ParsedBlock {
    content: string;
    properties: Record<string, string>;
    children: ParsedBlock[];
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
 * Checks if a line is a list item (starts with "- " after optional whitespace)
 */
function isListItem(line: string): boolean {
    return /^\s*-\s+/.test(line);
}

/**
 * Checks if a line is a property definition (key:: value)
 */
function isProperty(line: string): boolean {
    return /^\s*[\w-]+::\s*/.test(line);
}

/**
 * Extracts the content from a list item line (removes the "- " prefix)
 */
function extractListContent(line: string): string {
    return line.replace(/^\s*-\s+/, '');
}

/**
 * Parses a property line into key-value pair
 */
function parseProperty(line: string): { key: string; value: string } | null {
    const match = line.match(/^\s*([\w-]+)::\s*(.*)$/);
    if (match) {
        return { key: match[1], value: match[2].trim() };
    }
    return null;
}

interface LineInfo {
    original: string;
    indentLevel: number;
    isListItem: boolean;
    isProperty: boolean;
    content: string;
}

/**
 * Parses the input content into a tree structure.
 * 
 * Rules:
 * - Text before the first "- " line becomes root block content
 * - Lines starting with "- " become child blocks
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
        isProperty: isProperty(line),
        content: line.trim()
    }));

    // Find where the list starts (first line with "- ")
    const firstListIndex = lineInfos.findIndex(info => info.isListItem);

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
    const children = parseListItems(listLines, 0);

    return {
        content: rootContent,
        properties: {},
        children
    };
}

/**
 * Recursively parses list items at a given base indent level.
 * 
 * @param lines Array of LineInfo objects
 * @param baseIndent The indent level of the parent (items at baseIndent+1 are children)
 * @returns Array of ParsedBlock children
 */
function parseListItems(lines: LineInfo[], baseIndent: number): ParsedBlock[] {
    const result: ParsedBlock[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Skip empty lines
        if (line.content === '') {
            i++;
            continue;
        }

        // If this is a list item at the expected level
        if (line.isListItem && line.indentLevel === baseIndent) {
            const block: ParsedBlock = {
                content: extractListContent(line.original),
                properties: {},
                children: []
            };

            i++;

            // Collect properties and children that follow this item
            const childLines: LineInfo[] = [];

            while (i < lines.length) {
                const nextLine = lines[i];

                // Empty line - skip but continue
                if (nextLine.content === '') {
                    i++;
                    continue;
                }

                // Property at indent level > baseIndent belongs to current block
                if (nextLine.isProperty && nextLine.indentLevel > baseIndent) {
                    const prop = parseProperty(nextLine.original);
                    if (prop) {
                        block.properties[prop.key] = prop.value;
                    }
                    i++;
                    continue;
                }

                // List item at higher indent = child
                if (nextLine.isListItem && nextLine.indentLevel > baseIndent) {
                    childLines.push(nextLine);
                    i++;
                    continue;
                }

                // List item at same or lower indent = sibling or parent's sibling
                if (nextLine.isListItem && nextLine.indentLevel <= baseIndent) {
                    break;
                }

                // Non-list, non-property content at higher indent - could be continuation
                // For now, treat as end of this subtree
                if (nextLine.indentLevel <= baseIndent) {
                    break;
                }

                // Higher indent non-list/non-property - add to children for parsing
                childLines.push(nextLine);
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
            // Skip lines that don't match our expected pattern
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
