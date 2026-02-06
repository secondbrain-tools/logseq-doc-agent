import { createGetLogseqDocumentTool } from './get_logseq_document_tool';
import { createUpdateBlockTool } from './update_block_tool';
import { createAddBlockTool } from './add_block_tool';
import { createDeleteBlockTool } from './delete_block_tool';
import { createMoveBlockTool } from './move_block_tool';
import { createGetBlockTool } from './get_block_tool';

/** Tool categories for agent filtering */
export const READONLY_TOOLS = ['getLogseqDocument', 'getBlock'] as const;
export const WRITE_TOOLS = ['updateBlock', 'addBlock', 'deleteBlock', 'moveBlock'] as const;
export const ALL_TOOL_NAMES = [...READONLY_TOOLS, ...WRITE_TOOLS] as const;

export const createTools = (context: {
    merge: boolean,
    mergeDefault: boolean,
    mergeBoth: boolean
}) => ({
    getLogseqDocument: createGetLogseqDocumentTool({
        mergeDefault: context.mergeDefault,
        mergeBoth: context.mergeBoth
    }),
    getBlock: createGetBlockTool({
        mergeDefault: context.mergeDefault,
        mergeBoth: context.mergeBoth
    }),
    updateBlock: createUpdateBlockTool(context),
    addBlock: createAddBlockTool(context),
    deleteBlock: createDeleteBlockTool(context),
    moveBlock: createMoveBlockTool(context),
});

/**
 * Filter tools based on allowed tool specification
 * @param toolsMap Full tools map from createTools
 * @param allowedTools Array of allowed tools: '*' for all, 'readonly' for read-only, or specific tool names
 */
export function filterTools(toolsMap: Record<string, any>, allowedTools: string[]): Record<string, any> {
    // Check for wildcard - return all tools
    if (allowedTools.includes('*')) {
        return toolsMap;
    }

    // Check for 'readonly' keyword - return only read-only tools
    if (allowedTools.includes('readonly')) {
        const filtered: Record<string, any> = {};
        for (const toolName of READONLY_TOOLS) {
            if (toolsMap[toolName]) {
                filtered[toolName] = toolsMap[toolName];
            }
        }
        return filtered;
    }

    // Filter by specific tool names
    const filtered: Record<string, any> = {};
    for (const toolName of allowedTools) {
        if (toolsMap[toolName]) {
            filtered[toolName] = toolsMap[toolName];
        }
    }
    return filtered;
}

export * from './types';

