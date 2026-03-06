import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGetLogseqDocumentTool, formatBlockTree, cleanBlockContent } from './get_logseq_document_tool';
import { LDA_MERGE_PROPERTY } from '../../../domain/logseq/properties';

// Mock types
const mockLogseq = {
    Editor: {
        getCurrentPage: vi.fn(),
        getPage: vi.fn(),
        getPageBlocksTree: vi.fn(),
        getBlock: vi.fn(), // Helper for some tests
    },
};

// Global mock
vi.stubGlobal('logseq', mockLogseq);
vi.stubGlobal('window', { logseq: mockLogseq });

describe('getLogseqDocument tool', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('formatBlockTree', () => {
        it('should format a simple list of blocks', () => {
            const blocks = [
                { id: 1, content: 'Block 1', children: [] },
                { id: 2, content: 'Block 2', children: [] },
            ];
            const output = formatBlockTree(blocks as any);
            expect(output).toContain('- id:1 Block 1');
            expect(output).toContain('- id:2 Block 2');
        });

        it('should format nested blocks with indentation', () => {
            const blocks = [
                {
                    id: 1,
                    content: 'Parent',
                    children: [
                        { id: 2, content: 'Child', children: [] }
                    ]
                }
            ];
            const output = formatBlockTree(blocks as any);
            expect(output).toContain('- id:1 Parent');
            expect(output).toContain('  - id:2 Child');
        });

        it('should handle multi-line content', () => {
            const blocks = [
                { id: 1, content: 'Line 1\nLine 2', children: [] }
            ];
            const output = formatBlockTree(blocks as any);
            expect(output).toContain('- id:1 Line 1');
            expect(output).toContain('  Line 2');
        });

        it('should handle blocks without numeric ID (use UUID)', () => {
            const blocks = [
                { uuid: 'abc-123', content: 'No ID Block', children: [] }
            ];
            const output = formatBlockTree(blocks as any);
            expect(output).toContain('- uuid:abc-123 No ID Block');
        });

        it('should render ordered block with sibling number instead of bullet', () => {
            const blocks = [
                { id: 1, content: 'First', properties: { logseqOrderListType: 'number' }, children: [] },
                { id: 2, content: 'Second', properties: { logseqOrderListType: 'number' }, children: [] },
                { id: 3, content: 'Third', properties: { logseqOrderListType: 'number' }, children: [] },
            ];
            const output = formatBlockTree(blocks as any);
            expect(output).toContain('1. id:1 First');
            expect(output).toContain('2. id:2 Second');
            expect(output).toContain('3. id:3 Third');
            expect(output).not.toContain('- id:1');
        });

        it('should render mixed ordered and unordered siblings', () => {
            const blocks = [
                { id: 1, content: 'Unordered', children: [] },
                { id: 2, content: 'Ordered', properties: { logseqOrderListType: 'number' }, children: [] },
                { id: 3, content: 'Also Unordered', children: [] },
            ];
            const output = formatBlockTree(blocks as any);
            expect(output).toContain('- id:1 Unordered');
            expect(output).toContain('2. id:2 Ordered');
            expect(output).toContain('- id:3 Also Unordered');
        });

        it('should reset sibling counter for children', () => {
            const blocks = [
                {
                    id: 1,
                    content: 'Parent',
                    properties: { logseqOrderListType: 'number' },
                    children: [
                        { id: 2, content: 'Child A', properties: { logseqOrderListType: 'number' }, children: [] },
                        { id: 3, content: 'Child B', properties: { logseqOrderListType: 'number' }, children: [] },
                    ]
                }
            ];
            const output = formatBlockTree(blocks as any);
            expect(output).toContain('1. id:1 Parent');
            expect(output).toContain('  1. id:2 Child A');
            expect(output).toContain('  2. id:3 Child B');
        });

        it('should detect ordered block via logseq.order-list-type property key', () => {
            const blocks = [
                { id: 1, content: 'Item', properties: { 'logseq.order-list-type': 'number' }, children: [] },
            ];
            const output = formatBlockTree(blocks as any);
            expect(output).toContain('1. id:1 Item');
        });

        it('should detect ordered block via logseq.orderListType (real Logseq API key)', () => {
            const blocks = [
                { id: 1, content: 'Alpha', properties: { 'logseq.orderListType': 'number' }, children: [] },
                { id: 2, content: 'Beta', properties: { 'logseq.orderListType': 'number' }, children: [] },
            ];
            const output = formatBlockTree(blocks as any);
            expect(output).toContain('1. id:1 Alpha');
            expect(output).toContain('2. id:2 Beta');
        });

        it('should restart sibling numbering for nested ordered children', () => {
            const blocks = [
                {
                    id: 1,
                    content: 'Parent 1',
                    properties: { 'logseq.orderListType': 'number' },
                    children: [
                        { id: 10, content: 'Child A', properties: { 'logseq.orderListType': 'number' }, children: [] },
                        { id: 11, content: 'Child B', properties: { 'logseq.orderListType': 'number' }, children: [] },
                        { id: 12, content: 'Child C', properties: { 'logseq.orderListType': 'number' }, children: [] },
                    ]
                },
                {
                    id: 2,
                    content: 'Parent 2',
                    properties: { 'logseq.orderListType': 'number' },
                    children: []
                },
            ];
            const output = formatBlockTree(blocks as any);
            // Top-level siblings
            expect(output).toContain('1. id:1 Parent 1');
            expect(output).toContain('2. id:2 Parent 2');
            // Children restart at 1
            expect(output).toContain('  1. id:10 Child A');
            expect(output).toContain('  2. id:11 Child B');
            expect(output).toContain('  3. id:12 Child C');
        });

        it('should strip logseq.order-list-type from displayed content', () => {
            const blocks = [
                {
                    id: 1,
                    content: 'Item\nlogseq.order-list-type:: number',
                    properties: { logseqOrderListType: 'number' },
                    children: []
                },
            ];
            const output = formatBlockTree(blocks as any);
            expect(output).not.toContain('logseq.order-list-type');
        });
    });

    describe('cleanBlockContent', () => {
        it('should remove property lines', () => {
            const content = 'Block Title\nprop:: value\nanother-prop:: value';
            const cleaned = cleanBlockContent(content);
            expect(cleaned).toBe('Block Title');
        });

        it('should keep regular content', () => {
            const content = 'Line 1\nLine 2';
            const cleaned = cleanBlockContent(content);
            expect(cleaned).toBe('Line 1\nLine 2');
        });
    });

    describe('execute', () => {
        it('should return error if no page is active', async () => {
            mockLogseq.Editor.getCurrentPage.mockResolvedValue(null);
            const tool = createGetLogseqDocumentTool({ mergeDefault: false, mergeBoth: false });
            const result = await (tool as any).execute({});
            expect(result).toBe('No document currently active.');
        });

        it('should return formatted page tree', async () => {
            mockLogseq.Editor.getCurrentPage.mockResolvedValue({
                name: 'Test Page',
                uuid: 'page-uuid',
                id: 999
            });
            mockLogseq.Editor.getPageBlocksTree.mockResolvedValue([
                { id: 1, content: 'Root', children: [] }
            ]);

            const tool = createGetLogseqDocumentTool({ mergeDefault: false, mergeBoth: false });
            const result = await (tool as any).execute({});

            expect(result).toContain('Page: Test Page (id:999)');
            expect(result).toContain('- id:1 Root');
        });

        it('should apply merge visualization when context.mergeDefault is true', async () => {
            mockLogseq.Editor.getCurrentPage.mockResolvedValue({ uuid: 'p1' });

            // Block with merge property
            const mergeData = JSON.stringify({ base: 'Original', type: 'update' });
            const blockContent = `New Content\n${LDA_MERGE_PROPERTY}:: ${mergeData}`;

            mockLogseq.Editor.getPageBlocksTree.mockResolvedValue([
                { id: 1, content: blockContent, children: [] }
            ]);

            // Merge default = true (show proposed only, which is 'New Content')
            const tool = createGetLogseqDocumentTool({ mergeDefault: true, mergeBoth: false });
            const result = await (tool as any).execute({});

            // Should show 'New Content' and NOT the property line
            expect(result).toContain('New Content');
            expect(result).not.toContain(`${LDA_MERGE_PROPERTY}::`);
        });

        it('should apply merge visualization when context.mergeBoth is true', async () => {
            mockLogseq.Editor.getCurrentPage.mockResolvedValue({ uuid: 'p1' });

            // Block with merge property
            const mergeData = JSON.stringify({ base: 'Original', type: 'update' });
            const blockContent = `New Content\n${LDA_MERGE_PROPERTY}:: ${mergeData}`;

            mockLogseq.Editor.getPageBlocksTree.mockResolvedValue([
                { id: 1, content: blockContent, children: [] }
            ]);

            // Merge both = true (show [BASE] and [PROPOSED])
            const tool = createGetLogseqDocumentTool({ mergeDefault: false, mergeBoth: true });
            const result = await (tool as any).execute({});

            expect(result).toContain('[BASE]');
            expect(result).toContain('Original');
            expect(result).toContain('[PROPOSED]');
            expect(result).toContain('New Content');
        });

        it('should use current document when document param is empty', async () => {
            mockLogseq.Editor.getCurrentPage.mockResolvedValue({
                name: 'Current',
                uuid: 'current-uuid',
                id: 1
            });
            mockLogseq.Editor.getPageBlocksTree.mockResolvedValue([{ id: 1, content: 'Root', children: [] }]);

            const tool = createGetLogseqDocumentTool({ mergeDefault: false, mergeBoth: false });
            const result = await (tool as any).execute({});
            expect(result).toContain('Page: Current');
            expect(mockLogseq.Editor.getCurrentPage).toHaveBeenCalled();
            expect(mockLogseq.Editor.getPage).not.toHaveBeenCalled();
        });

        it('should resolve document by name when document param is provided', async () => {
            mockLogseq.Editor.getCurrentPage.mockResolvedValue(null);
            mockLogseq.Editor.getPage.mockResolvedValue({
                name: 'Other Page',
                uuid: 'other-uuid',
                id: 42
            });
            mockLogseq.Editor.getPageBlocksTree.mockResolvedValue([{ id: 1, content: 'Content', children: [] }]);

            const tool = createGetLogseqDocumentTool({ mergeDefault: false, mergeBoth: false });
            const result = await (tool as any).execute({ document: 'Other Page' });
            expect(result).toContain('Page: Other Page');
            expect(result).toContain('- id:1 Content');
            expect(mockLogseq.Editor.getPage).toHaveBeenCalledWith('Other Page');
        });

        it('should return error when document param is given but not found', async () => {
            mockLogseq.Editor.getCurrentPage.mockResolvedValue(null);
            mockLogseq.Editor.getPage.mockResolvedValue(null);

            const tool = createGetLogseqDocumentTool({ mergeDefault: false, mergeBoth: false });
            const result = await (tool as any).execute({ document: 'Nonexistent' });
            expect(result).toBe('Document not found: "Nonexistent".');
        });
    });
});
