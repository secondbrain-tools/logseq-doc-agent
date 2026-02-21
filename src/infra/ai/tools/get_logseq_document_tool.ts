import { tool } from 'ai';
import { z } from 'zod';
import {
    type LogseqSelection,
    type LogseqBlock,
    isLogseqBlockEntity
} from './types';


// Access the global logseq object
const getLogseq = () => (window as any).logseq;

export const createGetLogseqDocumentTool = (context: {
    mergeDefault: boolean,
    mergeBoth: boolean
}) => tool({
    description: 'Returns the active page or block from Logseq as a markdown tree with IDs.',
    inputSchema: z.object({}),
    execute: async (_args: any) => {
        const logseq = getLogseq();
        if (!logseq) {
            return 'Error: Logseq API not available.';
        }

        const currentPage = await logseq.Editor.getCurrentPage();
        if (!currentPage) {
            return 'No document currently active.';
        }

        let blocks: LogseqBlock[] = [];
        if (currentPage.uuid) {
            // Get blocks tree
            blocks = await logseq.Editor.getPageBlocksTree(currentPage.uuid) || [];
        }

        // Apply Merge Logic locally if enabled (recursive walk needed if blocks are a tree)
        if (context.mergeDefault || context.mergeBoth) {
            blocks = applyMergeLogicToTree(blocks, context);
        }

        return buildDocumentResponse(currentPage, blocks);
    },
} as any);

/**
 * recursively applies merge logic to a tree of blocks
 */
export function applyMergeLogicToTree(blocks: LogseqBlock[], context: { mergeDefault: boolean, mergeBoth: boolean }): LogseqBlock[] {
    return blocks.map(block => {
        let newBlock = { ...block };

        // Process current block content
        const content = newBlock.content || '';
        const match = content.match(/logseq-doc-agent\.merge::\s*(.+)/);
        if (match && match[1]) {
            try {
                const mergeData = JSON.parse(match[1]);
                if (mergeData) {
                    const cleanedBody = cleanBlockContent(newBlock.content);

                    if (context.mergeBoth) {
                        newBlock.content = `[BASE]\n${mergeData.base || ''}\n[PROPOSED]\n${cleanedBody}`;
                    } else if (context.mergeDefault) {
                        newBlock.content = cleanedBody;
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }
        }

        // Recursively process children
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
        return [...summaryLines, '', '(no blocks)'].join('\n');
    }

    return [...summaryLines, '', blockTree].join('\n');
}

export function describeSelection(selection: LogseqSelection) {
    if (isLogseqBlockEntity(selection)) {
        const pageLabel = extractPageLabel(selection);
        const blockLabel = selection.id !== undefined ? `id:${selection.id}` : (selection.uuid || 'unknown-block');
        const preview = cleanBlockContent(selection.content) || '(empty block)';
        return [
            `Selection Type: block`,
            `Page: ${pageLabel}`,
            `Active Block ID: ${blockLabel}`,
            `Active Block Preview: ${preview}`,
        ];
    }

    const pageName =
        (typeof selection.originalName === 'string' && selection.originalName.length
            ? selection.originalName
            : undefined) ??
        (typeof selection.name === 'string' && selection.name.length ? selection.name : undefined) ??
        (typeof selection.uuid === 'string' && selection.uuid.length ? selection.uuid : undefined) ??
        'Untitled Page';

    let pageLabel = pageName;
    if (selection.id) {
        pageLabel += ` (id:${selection.id})`;
    }

    return [`Selection Type: page`, `Page: ${pageLabel}`];
}

export function extractPageLabel(selection: LogseqBlock) {
    const page = selection.page;
    if (typeof page === 'object' && page !== null) {
        let label = (
            (typeof page.originalName === 'string' && page.originalName.length ? page.originalName : undefined) ??
            (typeof page.name === 'string' && page.name.length ? page.name : undefined) ??
            (typeof page.uuid === 'string' && page.uuid.length ? page.uuid : undefined) ??
            'Unknown Page'
        );

        if (page.id) {
            label += ` (id:${page.id})`;
        }
        return label;
    }
    if (typeof page === 'string' && page.length > 0) {
        return page;
    }
    return 'Unknown Page';
}

/**
 * Formats a list of root blocks into a markdown tree string.
 * This function handles recursive children locally.
 */
export function formatBlockTree(blocks: LogseqBlock[], depth: number = 0): string {
    if (!blocks || blocks.length === 0) return '';

    return blocks.map(block => formatSingleBlock(block, depth)).join('\n');
}

function formatSingleBlock(block: LogseqBlock, depth: number): string {
    const indent = '  '.repeat(depth);
    const content = cleanBlockContent(block.content) || '(empty block)';
    const lines = content.split('\n');

    // Header line: "- id:123 First line of content"
    // Use hierarchy list style
    const idLabel = block.id !== undefined ? `id:${block.id}` : (block.uuid ? `uuid:${block.uuid}` : 'block');

    let result = `${indent}- ${idLabel} ${lines[0]}`;

    // Additional lines of content, indented relative to the bullet
    // Bullet is "- " (2 chars) so text starts at indent + 2 spaces
    if (lines.length > 1) {
        const contentIndent = indent + '  ';
        const remainingLines = lines.slice(1).map(l => `${contentIndent}${l}`).join('\n');
        result += '\n' + remainingLines;
    }

    // Children
    if (block.children && block.children.length > 0) {
        const childrenStr = formatBlockTree(block.children, depth + 1);
        if (childrenStr) {
            result += '\n' + childrenStr;
        }
    }

    return result;
}

export function cleanBlockContent(content?: string | null) {
    if (!content) {
        return '';
    }
    const lines = content.split('\n');
    const filtered = lines
        .filter((line) => !/^(?:[-*+]\s+)?[\w.-]+::/.test(line.trim())) // Remove properties
        .map((line) => line.trimEnd());
    return filtered.join('\n').trim();
}
