import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    createGetLogseqDocumentTool,
    cleanBlockContent,
    getHierarchyLabel,
    flattenBlocks,
    extractPageLabel,
    describeSelection,
    formatBlockLines,
    buildDocumentResponse
} from './get_logseq_document_tool';
import type { LogseqBlock, LogseqPage, LogseqSelection } from './types';

describe('get_logseq_document_tool helpers', () => {
    describe('cleanBlockContent', () => {
        it('should return empty string for null/undefined', () => {
            expect(cleanBlockContent(null)).toBe('');
            expect(cleanBlockContent(undefined)).toBe('');
        });

        it('should remove property lines', () => {
            const content = 'Hello world\nkey:: value\nanother-key:: 123\nFinal line';
            expect(cleanBlockContent(content)).toBe('Hello world\nFinal line');
        });

        it('should handle property lines with bullets', () => {
            const content = 'Start\n- prop:: val\n* prop2:: val2\nEnd';
            expect(cleanBlockContent(content)).toBe('Start\nEnd');
        });

        it('should trim surrounding whitespace', () => {
            expect(cleanBlockContent('  Hello  ')).toBe('Hello');
        });
    });

    describe('getHierarchyLabel', () => {
        it('should return hierarchyId if present', () => {
            const block: LogseqBlock = { hierarchyId: '1.2.3' };
            expect(getHierarchyLabel(block)).toBe('1.2.3');
        });

        it('should return uuid if hierarchyId missing', () => {
            const block: LogseqBlock = { uuid: 'abc-123' };
            expect(getHierarchyLabel(block)).toBe('uuid:abc-123');
        });

        it('should return id if uuid missing', () => {
            const block: LogseqBlock = { id: 10 };
            expect(getHierarchyLabel(block)).toBe('id:10');
        });

        it('should return fallback', () => {
            const block: LogseqBlock = {};
            expect(getHierarchyLabel(block)).toBe('block');
        });
    });

    describe('flattenBlocks', () => {
        it('should flatten nested blocks and assign hierarchy IDs', () => {
            const tree = [
                {
                    uuid: '1',
                    children: [
                        { uuid: '1-1' },
                        {
                            uuid: '1-2',
                            children: [{ uuid: '1-2-1' }]
                        }
                    ]
                },
                { uuid: '2' }
            ];

            const result = flattenBlocks(tree);
            expect(result).toHaveLength(5);
            expect(result[0].hierarchyId).toBe('1');
            expect(result[1].hierarchyId).toBe('1.1');
            expect(result[2].hierarchyId).toBe('1.2');
            expect(result[3].hierarchyId).toBe('1.2.1');
            expect(result[4].hierarchyId).toBe('2');
        });
    });

    describe('extractPageLabel', () => {
        it('should return page string name', () => {
            const block = { page: 'My Page' };
            expect(extractPageLabel(block)).toBe('My Page');
        });

        it('should extract originalName from page object', () => {
            const block = { page: { originalName: 'Original Name' } };
            expect(extractPageLabel(block)).toContain('Original Name');
        });

        it('should fallback to unknown page', () => {
            expect(extractPageLabel({})).toBe('Unknown Page');
        });
    });

    describe('formatBlockLines', () => {
        it('should format block with hierarchy ID', () => {
            const annotation = {
                block: { hierarchyId: '1.1', content: 'Block content' },
            };
            const lines = formatBlockLines(annotation);
            expect(lines).toEqual(['[1.1] Block content']);
        });

        it('should format block with hierarchy ID and block ID', () => {
            const annotation = {
                block: { hierarchyId: '1.1', id: 123, content: 'Block content' },
            };
            const lines = formatBlockLines(annotation);
            expect(lines).toEqual(['[1.1 #123] Block content']);
        });

        it('should handle multi-line content with indentation', () => {
            const annotation = {
                block: { hierarchyId: '2', content: 'Line 1\nLine 2' },
            };
            const lines = formatBlockLines(annotation);
            expect(lines[0]).toBe('[2] Line 1');
            expect(lines[1]).toBe('    Line 2');
        });
    });
});

describe('getLogseqDocument tool', () => {
    // Mock global window.logseq
    const mockGetCurrentPage = vi.fn();
    const mockGetPageBlocksTree = vi.fn();

    beforeEach(() => {
        vi.stubGlobal('window', {
            logseq: {
                Editor: {
                    getCurrentPage: mockGetCurrentPage,
                    getPageBlocksTree: mockGetPageBlocksTree,
                },
            },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const createTool = (context = { mergeDefault: false, mergeBoth: false }) => {
        return createGetLogseqDocumentTool(context);
    };

    it('should return error if logseq is not available', async () => {
        vi.stubGlobal('window', {});
        const tool = createTool();
        const result = await (tool as any).execute({}, undefined);
        expect(result).toBe('Error: Logseq API not available.');
    });

    it('should return info if no document active', async () => {
        mockGetCurrentPage.mockResolvedValue(null);
        const tool = createTool();
        const result = await (tool as any).execute({}, undefined);
        expect(result).toBe('No document currently active.');
    });

    it('should return formatted document for active page with hierarchy IDs', async () => {
        const mockPage: LogseqPage = { uuid: 'page-uuid', originalName: 'Test Page', id: 1 };
        mockGetCurrentPage.mockResolvedValue(mockPage);

        const mockTree = [
            { content: 'Block 1', uuid: 'b1' },
            {
                content: 'Block 2',
                uuid: 'b2',
                children: [{ content: 'Child 1', uuid: 'b3' }]
            }
        ];
        mockGetPageBlocksTree.mockResolvedValue(mockTree);

        const tool = createTool();
        const result = await (tool as any).execute({}, undefined);

        expect(result).toContain('Page: Test Page (id:1)');
        expect(result).toContain('[1] Block 1');
        expect(result).toContain('[2] Block 2');
        expect(result).toContain('[2.1] Child 1');
    });

    describe('Merge Logic', () => {
        const mockPage: LogseqPage = { uuid: 'page-uuid', originalName: 'Test Page', id: 1 };

        const originalContent = 'Original Content';
        const proposedContent = 'Proposed Content';
        const mergeData = JSON.stringify({
            type: 'update',
            newContent: proposedContent,
            originalContent: originalContent
        });

        const mockTree = [{
            content: `logseq-doc-agent.merge:: ${mergeData}\n${originalContent}`,
            uuid: 'b1'
        }];

        beforeEach(() => {
            mockGetCurrentPage.mockResolvedValue(mockPage);
            mockGetPageBlocksTree.mockResolvedValue(mockTree);
        });

        it('should show proposed content by default if mergeDefault is true', async () => {
            const tool = createTool({ mergeDefault: true, mergeBoth: false });
            const result = await (tool as any).execute({}, undefined);

            expect(result).toContain(proposedContent);
            expect(result).not.toContain(originalContent);
        });

        it('should show both contents if mergeBoth is true', async () => {
            const tool = createTool({ mergeDefault: true, mergeBoth: true });
            const result = await (tool as any).execute({}, undefined);

            expect(result).toContain('[ORIGINAL]');
            expect(result).toContain(originalContent);
            expect(result).toContain('[PROPOSED]');
            expect(result).toContain(proposedContent);
        });

        it('should show original content if mergeDefault is false and mergeBoth is false', async () => {
            const tool = createTool({ mergeDefault: false, mergeBoth: false });
            const result = await (tool as any).execute({}, undefined);

            expect(result).toContain(originalContent);
            expect(result).not.toContain(proposedContent);
        });
    });
});
