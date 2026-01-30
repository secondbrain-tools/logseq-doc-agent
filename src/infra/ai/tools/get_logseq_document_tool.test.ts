import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getLogseqDocument,
    cleanBlockContent,
    getHierarchyLabel,
    flattenBlocks,
    extractPageLabel,
    describeSelection,
    formatBlockLines,
    buildDocumentResponse
} from './get_logseq_document_tool';
import { ShortIdService } from '../short-id.service';
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

        it('should handle multi-line content with indentation', () => {
            const annotation = {
                block: { hierarchyId: '2', content: 'Line 1\nLine 2' },
            };
            const lines = formatBlockLines(annotation);
            // Prefix is "[2] " -> length 4. Indent 5 spaces? 
            // `basePrefix.length + 1` -> "[2]".length + 1 = 4. 
            // Wait: `basePrefix` is "[2]". `basePrefix.length` is 3. +1 is 4.
            // " " * 4 = "    ".
            expect(lines[0]).toBe('[2] Line 1');
            expect(lines[1]).toBe('    Line 2');
        });
    });
});

describe('getLogseqDocument tool', () => {
    // Mock global window.logseq
    const mockGetCurrentPage = vi.fn();
    const mockGetPageBlocksTree = vi.fn();

    // Mock ShortIdService
    const mockGetShortId = vi.fn();

    beforeEach(() => {
        vi.stubGlobal('window', {
            logseq: {
                Editor: {
                    getCurrentPage: mockGetCurrentPage,
                    getPageBlocksTree: mockGetPageBlocksTree,
                },
            },
        });

        // Mock the ShortIdService singleton
        vi.spyOn(ShortIdService, 'getInstance').mockReturnValue({
            getShortId: mockGetShortId,
            getUuid: vi.fn(),
            reset: vi.fn(),
        } as any);

        mockGetShortId.mockImplementation((uuid) => `#short-${uuid}`);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return error if logseq is not available', async () => {
        vi.stubGlobal('window', {});
        const result = await (getLogseqDocument as any).execute({}, undefined);
        expect(result).toBe('Error: Logseq API not available.');
    });

    it('should return info if no document active', async () => {
        mockGetCurrentPage.mockResolvedValue(null);
        const result = await (getLogseqDocument as any).execute({}, undefined);
        expect(result).toBe('No document currently active.');
    });

    it('should return formatted document for active page with short IDs', async () => {
        const mockPage: LogseqPage = { uuid: 'page-uuid', originalName: 'Test Page' };
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

        const result = await (getLogseqDocument as any).execute({}, undefined);
        expect(result).toContain('Page: Test Page (#short-page-uuid)');
        expect(result).toContain('[1 #short-b1] Block 1');
        expect(result).toContain('[2 #short-b2] Block 2');
        expect(result).toContain('[2.1 #short-b3] Child 1');
    });
});
