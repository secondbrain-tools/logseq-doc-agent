import { tool } from 'ai';
import { z } from 'zod';
import {
    type LogseqSelection,
    type LogseqBlock,
    type OutlineAnnotation,
    isLogseqBlockEntity
} from './types';


// Access the global logseq object
const getLogseq = () => (window as any).logseq;

export const getLogseqDocument = tool({
    description: 'Returns the active page or block from Logseq with each outline entry prefixed by its hierarchy id (1, 1.1, 1.1.1, ...).',
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

        // According to user request: "selection is current page from: logseq.Editor.getCurrentPage"
        // And "return a list of the items" -> assuming we need to fetch blocks for the page.
        // The user snippet uses `blocks: LogseqBlock[]` in buildDocumentResponse.

        let blocks: LogseqBlock[] = [];
        if (currentPage.uuid) {
            // Fetch blocks for the page. 
            // We usually receive a tree. We might need to flatten it or the user snippet expects a specific format.
            // The user snippet 'buildOutlineAnnotations' (not provided in the prompt but implied) 
            // and 'formatBlocks' iterate over annotations.

            // Wait, the user provided: 
            // function buildDocumentResponse(selection: LogseqSelection, blocks: LogseqBlock[])

            // Checking the user snippet again... 
            // "const annotations = buildOutlineAnnotations(blocks)" -> This function was NOT provided in the snippet.
            // "const blockLines = formatBlocks(annotations)"

            // I need to implement `buildOutlineAnnotations` or ask the user.
            // Given the instruction "can you implement this and complete it ? ask for further information if required?",
            // I should try to infer a sensible default or ask.
            // "with each outline entry prefixed by its hierarchy id (1, 1.1, 1.1.1, …)."

            // Let's implement a simple `buildOutlineAnnotations` that assigns hierarchy IDs if not present.
            // Getting the page blocks:
            const pageBlocksTree = await logseq.Editor.getPageBlocksTree(currentPage.uuid);
            blocks = flattenBlocks(pageBlocksTree);
        }

        return buildDocumentResponse(currentPage, blocks);
    },
} as any);

export function flattenBlocks(tree: any[], prefix: string = '', result: LogseqBlock[] = []): LogseqBlock[] {
    // This is a guess at how to flatten and adding hierarchy IDs if they are missing,
    // although `get_logseq_document` description says it returns them prefixed.
    // The user snippet `getHierarchyLabel` checks `block.hierarchyId`.

    // Logseq API `getPageBlocksTree` returns a recursive structure.

    // Let's assume we just pass the raw blocks and let the helper handle it, 
    // BUT we need `hierarchyId`. Logseq blocks usually don't have `hierarchyId` property by default in all API responses.
    // We might need to calculate it.

    // Let's try to calculate it during flattening.
    tree.forEach((node, index) => {
        const currentId = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
        const flattenedNode = { ...node, hierarchyId: currentId };
        result.push(flattenedNode);
        if (node.children && Array.isArray(node.children)) {
            flattenBlocks(node.children, currentId, result);
        }
    });
    return result;
}

// --- User Provided Functions (Adapted) ---

export function buildDocumentResponse(selection: LogseqSelection, blocks: LogseqBlock[]) {
    const summaryLines = describeSelection(selection);
    // Missing function from user snippet, implementing it based on context
    const annotations = buildOutlineAnnotations(blocks);
    const blockLines = formatBlocks(annotations);
    return [...summaryLines, '', 'Blocks:', ...(blockLines.length ? blockLines : ['(none)'])].join('\n');
}

// INFERRED implementation
export function buildOutlineAnnotations(blocks: LogseqBlock[]): OutlineAnnotation[] {
    return blocks.map(block => ({
        block,
        // Tagging logic is custom. defaulting to undefined or basic heuristics?
        // User snippet had `tag === 'chapter' ? 'Chapter ' : ...`
        // For now, let's leave tag undefined as we don't have logic for it.
        tag: undefined
    }));
}

export function describeSelection(selection: LogseqSelection) {
    if (isLogseqBlockEntity(selection)) {
        const pageLabel = extractPageLabel(selection);
        const blockLabel =
            (typeof selection.hierarchyId === 'string' && selection.hierarchyId.length > 0
                ? selection.hierarchyId
                : selection.uuid?.toString()) ?? 'unknown-block';
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

export function formatBlocks(annotations: OutlineAnnotation[]) {
    const lines: string[] = [];
    for (const annotation of annotations ?? []) {
        lines.push(...formatBlockLines(annotation));
    }
    return lines;
}


// ... (existing imports)

export function formatBlockLines(annotation: OutlineAnnotation) {
    const { block, tag } = annotation;
    const idLabel = getHierarchyLabel(block);
    const roleLabel = tag === 'chapter' ? 'Chapter ' : tag === 'section' ? 'Section ' : '';

    const basePrefix = `[${roleLabel}${idLabel}]`;
    const text = cleanBlockContent(block.content) || '(empty block)';
    const lines = text.split('\n');
    const formatted = lines.map((line, index) => {
        if (index === 0) {
            return `${basePrefix} ${line}`.trimEnd();
        }
        const indent = ' '.repeat(basePrefix.length + 1);
        return `${indent}${line}`;
    });
    return formatted;
}

export function getHierarchyLabel(block: LogseqBlock) {
    if (typeof block.hierarchyId === 'string' && block.hierarchyId.length > 0) {
        return block.hierarchyId;
    }
    if (block.id !== undefined) {
        return `id:${block.id}`;
    }
    if (typeof block.uuid === 'string' && block.uuid.length > 0) {
        return `uuid:${block.uuid}`;
    }
    return 'block';
}

export function cleanBlockContent(content?: string | null) {
    if (!content) {
        return '';
    }
    const lines = content.split('\n');
    const filtered = lines
        .filter((line) => !/^(?:[-*+]\s+)?[\w.-]+::/.test(line.trim()))
        .map((line) => line.trimEnd());
    return filtered.join('\n').trim();
}
