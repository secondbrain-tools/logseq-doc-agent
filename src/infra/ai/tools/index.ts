import { getLogseqDocument } from './get_logseq_document_tool';
import { createUpdateBlockTool } from './update_block_tool';
import { createAddBlockTool } from './add_block_tool';
import { createDeleteBlockTool } from './delete_block_tool';
import { createMoveBlockTool } from './move_block_tool';

export const createTools = (context: { merge: boolean }) => ({
    getLogseqDocument,
    updateBlock: createUpdateBlockTool(context),
    addBlock: createAddBlockTool(context),
    deleteBlock: createDeleteBlockTool(context),
    moveBlock: createMoveBlockTool(context),
});

export * from './types';
