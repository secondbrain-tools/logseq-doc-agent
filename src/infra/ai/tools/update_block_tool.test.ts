
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUpdateBlockTool } from './update_block_tool';
import * as blockOps from './block-operations';
import * as subtreeParser from './subtree-parser';

// Mock types
const mockLogseq = {
    Editor: {
        getBlock: vi.fn(),
        updateBlock: vi.fn(),
        upsertBlockProperty: vi.fn(),
    },
};

// Global mock
vi.stubGlobal('logseq', mockLogseq);
vi.stubGlobal('window', { logseq: mockLogseq });

// Spy on block operations
vi.mock('./block-operations', () => ({
    insertSubtreeRecursive: vi.fn(),
}));

// Spy on parser
vi.mock('./subtree-parser', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual as any,
        parseSubtree: vi.fn(),
        formatResultTree: vi.fn(() => 'Tree Output'),
    };
});

describe('updateBlock tool', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const context = { merge: false };
    const mergeContext = { merge: true };


    it('should update simple block content (legacy behavior)', async () => {
        // Mock getBlock for initial check
        mockLogseq.Editor.getBlock.mockResolvedValueOnce({ uuid: 'uuid-1', content: 'Old content' });
        // Mock getBlock for final return (includeChildren: true)
        mockLogseq.Editor.getBlock.mockResolvedValueOnce({ id: 1, uuid: 'uuid-1', content: 'New content', children: [] });

        const tool = createUpdateBlockTool(context) as any;
        const result = await tool.execute(
            { id: 1, content: 'New content', parse_subtrees: false },
            { toolCallId: 'test', messages: [] }
        );

        expect(mockLogseq.Editor.updateBlock).toHaveBeenCalledWith('uuid-1', 'New content');
        // Expect markdown tree format
        expect(result).toContain('- id:1 New content');
    });

    it('should update block content with merge (legacy behavior)', async () => {
        mockLogseq.Editor.getBlock.mockResolvedValueOnce({ uuid: 'uuid-1', content: 'Old content' });
        // Final fetch
        mockLogseq.Editor.getBlock.mockResolvedValueOnce({ id: 1, uuid: 'uuid-1', content: 'New content', children: [] });

        const tool = createUpdateBlockTool(mergeContext) as any;
        await tool.execute(
            { id: 1, content: 'New content', parse_subtrees: false },
            { toolCallId: 'test', messages: [] }
        );

        expect(mockLogseq.Editor.updateBlock).toHaveBeenCalledWith('uuid-1', 'New content');
        expect(mockLogseq.Editor.upsertBlockProperty).toHaveBeenCalledWith('uuid-1', 'logseq-doc-agent.merge', expect.stringContaining('"type":"update"'));
    });

    it('should parse subtrees and insert children', async () => {
        mockLogseq.Editor.getBlock.mockResolvedValueOnce({ uuid: 'uuid-1', content: 'Old content' });

        // Mock parser result
        const mockParsed = {
            content: 'Parent content',
            properties: {},
            children: [{ content: 'Child 1', properties: {}, children: [] }]
        };
        vi.mocked(subtreeParser.parseSubtree).mockReturnValue(mockParsed);
        vi.mocked(blockOps.insertSubtreeRecursive).mockResolvedValue({ id: 2, content: 'Child 1', children: [] });

        // Final fetch with children
        mockLogseq.Editor.getBlock.mockResolvedValueOnce({
            id: 1,
            uuid: 'uuid-1',
            content: 'Parent content',
            children: [{ id: 2, content: 'Child 1', children: [] }]
        });

        const tool = createUpdateBlockTool(context) as any;
        const result = await tool.execute(
            { id: 1, content: 'Parent content\n- Child 1', parse_subtrees: true },
            { toolCallId: 'test', messages: [] }
        );

        // Verify parent update
        expect(mockLogseq.Editor.updateBlock).toHaveBeenCalledWith('uuid-1', 'Parent content');

        // Verify output contains both parent and child in tree format
        expect(result).toContain('- id:1 Parent content');
        expect(result).toContain('  - id:2 Child 1');
    });

});
