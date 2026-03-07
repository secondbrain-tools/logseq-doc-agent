import { buildDocumentResponse } from '../ai/tools/get_logseq_document_tool';
import type { ContextItem } from '../../domain/chat/types';

export type { ContextItem };

const getLogseq = () => (window as any).logseq;

/**
 * Datascript returns UUIDs as `{ $uuid$: '...' }` objects instead of plain strings.
 * This helper normalises both forms to a plain string.
 */
function resolveUuid(raw: unknown): string {
    if (raw && typeof raw === 'object' && '$uuid$' in (raw as object)) {
        return (raw as { $uuid$: string }).$uuid$;
    }
    return String(raw);
}

/**
 * Captures the current active page as a context item (identity snapshot).
 */
export async function getCurrentPageContext(): Promise<ContextItem | null> {
    const logseq = getLogseq();
    if (!logseq) return null;

    const currentPage = await logseq.Editor.getCurrentPage();
    if (!currentPage || !currentPage.uuid) return null;

    const name = currentPage.originalName || currentPage.name || 'Untitled Page';

    return { id: currentPage.uuid, type: 'page', name };
}

/**
 * Subscribes to page-navigation events and invokes callback with the new context.
 * Returns an unsubscribe function.
 */
export function onCurrentPageChange(callback: (context: ContextItem | null) => void): () => void {
    const logseq = getLogseq();
    if (!logseq) return () => { };

    const off = logseq.App.onRouteChanged(async () => {
        const context = await getCurrentPageContext();
        callback(context);
    });

    return () => { if (off) off(); };
}

/**
 * Fetches and formats fresh content for a given context item at send-time.
 * Both page and block content go through the shared `buildDocumentResponse`
 * pipeline so the AI receives consistently formatted, ID-annotated output.
 */
export async function getContextContent(context: ContextItem): Promise<string> {
    const logseq = getLogseq();
    if (!logseq) return '';

    if (context.type === 'block') {
        const block = await logseq.Editor.getBlock(context.id, { includeChildren: true });
        if (!block) return `[Context Error: Block ${context.id} not found]`;
        return buildDocumentResponse(block, block.children || []);
    }

    // Page context
    const page = await logseq.Editor.getPage(context.id);
    if (!page) return `[Context Error: Page "${context.name}" not found]`;

    const pageBlocksTree = await logseq.Editor.getPageBlocksTree(context.id);
    return buildDocumentResponse(page, pageBlocksTree);
}

/**
 * Searches for pages matching a query string. Returns up to 10 results,
 * ranked so prefix matches come first.
 */
export async function searchPages(query: string): Promise<{ name: string; uuid: string }[]> {
    const logseq = getLogseq();
    if (!logseq) return [];

    try {
        const allPages = await logseq.Editor.getAllPages();
        if (!allPages) return [];

        const lowerQuery = query.toLowerCase();

        const matches = allPages
            .filter((p: any) => (p.originalName || p.name || '').toLowerCase().includes(lowerQuery))
            .map((p: any) => ({ name: p.originalName || p.name, uuid: p.uuid }));

        matches.sort((a: any, b: any) => {
            const aStarts = a.name.toLowerCase().startsWith(lowerQuery);
            const bStarts = b.name.toLowerCase().startsWith(lowerQuery);
            return aStarts === bStarts ? 0 : aStarts ? -1 : 1;
        });

        return matches.slice(0, 10);
    } catch (e) {
        console.error('Failed to search pages:', e);
        return [];
    }
}

/**
 * Searches for blocks whose content contains the query string.
 * Uses a Datascript query because Logseq has no dedicated block-search API.
 * Returns up to 10 results.
 */
export async function searchBlocks(query: string): Promise<{ uuid: string; content: string }[]> {
    const logseq = getLogseq();
    if (!logseq || !query || query.length < 2) return [];

    try {
        const escapedQuery = query.toLowerCase().replace(/"/g, '\\"');

        const datalogQuery = `
            [:find (pull ?b [:block/uuid :block/content])
             :where
             [?b :block/content ?c]
             [(clojure.string/includes? ?c "${escapedQuery}")]
            ]
        `;

        const results = await logseq.DB.datascriptQuery(datalogQuery);
        if (!results || !Array.isArray(results)) return [];

        return results
            .map((r: any) => r[0] || r)
            .filter((b: any) => b?.uuid && b?.content)
            .map((b: any) => ({ uuid: resolveUuid(b.uuid), content: b.content }))
            .slice(0, 10);

    } catch (e) {
        console.error('Failed to search blocks:', e);
        return [];
    }
}
