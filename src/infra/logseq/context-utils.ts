
import {
    type LogseqSelection,
    type LogseqBlock,
    type OutlineAnnotation,
} from '../ai/tools/types';
import { flattenBlocks, buildDocumentResponse } from '../ai/tools/get_logseq_document_tool';

const getLogseq = () => (window as any).logseq;

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

    // Re-fetch the page object to ensure validity
    const page = await logseq.Editor.getPage(context.id);
    if (!page) {
        return `[Context Error: Page ${context.name} not found]`;
    }

    let blocks: LogseqBlock[] = [];
    // Get the tree
    const pageBlocksTree = await logseq.Editor.getPageBlocksTree(context.id);
    // Flatten it using existing tool logic
    blocks = flattenBlocks(pageBlocksTree);

    // Build the string representation
    return buildDocumentResponse(page, blocks);
}
