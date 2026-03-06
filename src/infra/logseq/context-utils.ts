import {
    type LogseqSelection,
    type LogseqBlock,
    type OutlineAnnotation,
} from '../ai/tools/types';
import { buildDocumentResponse } from '../ai/tools/get_logseq_document_tool';

const getLogseq = () => (window as any).logseq;

/** Recursively extracts text content from a block and its children */
function extractBlockText(block: any, depth = 0): string {
    if (!block) return '';
    const indent = '  '.repeat(depth);
    const content = block.content || '';
    let result = depth === 0 ? content : `${indent}- ${content}`;
    if (block.children && block.children.length > 0) {
        const childTexts = block.children.map((child: any) => extractBlockText(child, depth + 1));
        result += '\n' + childTexts.join('\n');
    }
    return result;
}

export interface ContextItem {
    id: string;      // UUID of the page/block
    type: 'page' | 'block';
    name: string;    // Display name (e.g. Page Title)
}

/**
 * Captures the current active page/block as a context item.
 * This is a "snapshot" of the identity.
 */
export async function getCurrentPageContext(): Promise<ContextItem | null> {
    const logseq = getLogseq();
    if (!logseq) return null;

    const currentPage = await logseq.Editor.getCurrentPage();
    if (!currentPage || !currentPage.uuid) {
        return null; // No active document
    }

    // Determine display name
    let name = "Untitled Page";
    if (currentPage.originalName) {
        name = currentPage.originalName;
    } else if (currentPage.name) {
        name = currentPage.name;
    }



    return {
        id: currentPage.uuid,
        type: 'page', // simplified to page for now, as request emphasized "Current Document"
        name: name
    };
}

/**
 * Subscribes to page navigation events and returns the new page context.
 * Returns an unsubscribe function.
 */
export function onCurrentPageChange(callback: (context: ContextItem | null) => void): () => void {
    const logseq = getLogseq();
    if (!logseq) return () => { };

    const off = logseq.App.onRouteChanged(async () => {
        // Wait a tick for context to settle? usually good practice in Logseq
        // But onRouteChanged usually implies we are there.
        // Let's get the fresh context
        const context = await getCurrentPageContext();
        callback(context);
    });

    return () => {
        if (off) off();
    };
}

/**
 * Fetches the fresh content for a given context item.
 * Used at send-time.
 */
export async function getContextContent(context: ContextItem): Promise<string> {
    const logseq = getLogseq();
    if (!logseq) return "";

    if (context.type === 'block') {
        const block = await logseq.Editor.getBlock(context.id, { includeChildren: true });
        if (!block) {
            return `[Context Error: Block ${context.id} not found]`;
        }
        // Recursively extract text from the block and its children
        const text = extractBlockText(block);
        return text || `[Block ${context.id}: empty]`;
    }

    // Default: Page context
    // Re-fetch the page object to ensure validity
    const page = await logseq.Editor.getPage(context.id);
    if (!page) {
        return `[Context Error: Page ${context.name} not found]`;
    }

    // Get the tree
    const pageBlocksTree = await logseq.Editor.getPageBlocksTree(context.id);

    // Build the string representation
    // Pass the tree directly as buildDocumentResponse now handles trees
    return buildDocumentResponse(page, pageBlocksTree);
}

/**
 * Searches for pages based on a query string.
 * Returns up to 10 matching pages.
 */
export async function searchPages(query: string): Promise<{ name: string; uuid: string }[]> {
    const logseq = getLogseq();
    if (!logseq) return [];

    try {
        const allPages = await logseq.Editor.getAllPages();
        if (!allPages) return [];

        const lowerQuery = query.toLowerCase();

        // Filter and map pages
        const matches = allPages
            .filter((p: any) => {
                const name = (p.originalName || p.name || "").toLowerCase();
                return name.includes(lowerQuery);
            })
            .map((p: any) => ({
                name: p.originalName || p.name,
                uuid: p.uuid
            }));

        // Sort: exact start matches first
        matches.sort((a: any, b: any) => {
            const aStarts = a.name.toLowerCase().startsWith(lowerQuery);
            const bStarts = b.name.toLowerCase().startsWith(lowerQuery);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return 0;
        });

        // Limit to 10
        return matches.slice(0, 10);
    } catch (e) {
        console.error("Failed to search pages:", e);
        return [];
    }
}

/**
 * Searches for blocks based on a query string.
 * Returns up to 10 matching blocks.
 */
export async function searchBlocks(query: string): Promise<{ uuid: string; content: string }[]> {
    const logseq = getLogseq();
    if (!logseq || !query || query.length < 2) return [];

    try {
        // Fallback or generic query for block content. 
        // In full Logseq, datascript might be complex. A simple approach in plugins
        // is often string matching if we don't have a specific API, or using a specific DB.q

        // For simulation purposes and generic fallback: 
        // We'll ask DB.q for generic match if supported, but usually Logseq's DB.q requires datalog.
        // Let's use a datalog query that finds blocks with content matching the string.
        // Note: Datalog regex matching can be very slow.
        // Alternatively, use `logseq.DB.q` with simple syntax.
        // For simplicity and matching Mock API, we will use a naive datalog or `DB.datascriptQuery`.

        // Standard Logseq block search trick:
        const lowerQuery = query.toLowerCase();
        // Escape quotes for the clojure string
        const escapedQuery = lowerQuery.replace(/"/g, '\\"');

        const datalogQuery = `
            [:find (pull ?b [:block/uuid :block/content])
             :where
             [?b :block/content ?c]
             [(clojure.string/includes? ?c "${escapedQuery}")]
            ]
        `;

        const results = await logseq.DB.datascriptQuery(datalogQuery);

        if (!results || !Array.isArray(results)) return [];

        // DB.datascriptQuery returns an array of arrays: [ [{uuid: ..., content: ...}] ]
        let blocks = results.map(r => r[0] || r).filter(b => b && b.uuid && b.content);

        // Format UUID which comes back as an object from datascript { $uuid$: '...' }
        blocks = blocks.map(b => ({
            uuid: typeof b.uuid === 'object' && b.uuid.$uuid$ ? b.uuid.$uuid$ : b.uuid,
            content: b.content
        }));

        // Limit to 10
        return blocks.slice(0, 10);

    } catch (e) {
        console.error("Failed to search blocks:", e);
        return [];
    }
}
