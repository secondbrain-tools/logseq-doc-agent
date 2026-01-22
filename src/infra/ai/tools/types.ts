export interface LogseqBlock {
    id?: number;
    uuid?: string;
    content?: string;
    hierarchyId?: string;
    page?: LogseqPage | string | null;
    originalName?: string;
    name?: string;
    [key: string]: any;
}

export interface LogseqPage {
    id?: number;
    uuid?: string;
    originalName?: string;
    name?: string;
    [key: string]: any;
}

export type LogseqSelection = LogseqBlock | LogseqPage;

export interface OutlineAnnotation {
    block: LogseqBlock;
    tag?: 'chapter' | 'section';
}

export function isLogseqBlockEntity(entity: any): entity is LogseqBlock {
    // Basic check: blocks usually have a uuid or id, but pages do too.
    // As per user snippet logic:
    // "if (isLogseqBlockEntity(selection)) ..." implies we need to distinguish.
    // Usually blocks have 'page' property pointing to the page they belong to,
    // whereas pages don't have a 'page' property pointing to themselves in the same way (or it's undefined).
    // Also, blocks often have 'content'.

    // However, looking at the user's snippet:
    // const pageLabel = extractPageLabel(selection) <--- used on block
    // const page = selection.page

    return entity && typeof entity === 'object' && 'page' in entity && entity.page !== undefined;
}
