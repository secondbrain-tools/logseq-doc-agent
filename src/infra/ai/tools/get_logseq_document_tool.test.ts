import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGetLogseqDocumentTool, formatBlockTree, cleanBlockContent } from './get_logseq_document_tool';
import { LDA_MERGE_PROPERTY } from '../../../domain/logseq/properties';

// Mock types
const mockLogseq = {
    Editor: {
        getCurrentPage: vi.fn(),
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
    });
});
