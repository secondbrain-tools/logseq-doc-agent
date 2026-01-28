import { getLogseqDocument } from './get_logseq_document_tool';
import { createUpdateBlockTool } from './update_block_tool';

export const createTools = (context: { merge: boolean }) => ({
    getLogseqDocument,
    updateBlock: createUpdateBlockTool(context),
});

export * from './types';
