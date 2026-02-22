
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAddBlockTool } from './add_block_tool';
import { createDeleteBlockTool } from './delete_block_tool';
import { createMoveBlockTool } from './move_block_tool';
import { createUpdateBlockTool } from './update_block_tool';
import { LDA_MERGE_PROPERTY } from '../../../domain/logseq/properties';

describe('Block Management Tools', () => {
    // Mocks
    const mockInsertBlock = vi.fn();
    const mockRemoveBlock = vi.fn();
    const mockMoveBlock = vi.fn();
    const mockGetBlock = vi.fn();
    const mockGetPage = vi.fn(); // NEW
    const mockUpdateBlock = vi.fn();
    const mockUpsertBlockProperty = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        vi.stubGlobal('logseq', {
            Editor: {
                insertBlock: mockInsertBlock,
                removeBlock: mockRemoveBlock,
                moveBlock: mockMoveBlock,
                getBlock: mockGetBlock,
                getPage: mockGetPage, // NEW
                updateBlock: mockUpdateBlock,
                upsertBlockProperty: mockUpsertBlockProperty,
            },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('addBlock', () => {
        it('should append block as child by default (merge=false)', async () => {
            const tool = createAddBlockTool({ merge: false });
            // Mock target block lookup
            mockGetBlock.mockResolvedValue({ uuid: 'uuid-target' });
            mockInsertBlock.mockResolvedValue({ uuid: 'uuid-new', id: 999 });

            const result = await (tool as any).execute({ targetId: 10, content: 'New Block', parse_subtrees: false });

            expect(mockGetBlock).toHaveBeenCalledWith(10);
            expect(mockInsertBlock).toHaveBeenCalledWith('uuid-target', 'New Block', {});
            expect(result).toContain('Successfully added block (id:999)');
        });

        it('should insert block before target (merge=false)', async () => {
            const tool = createAddBlockTool({ merge: false });
            mockGetBlock.mockResolvedValue({ uuid: 'uuid-target' });
            mockInsertBlock.mockResolvedValue({ uuid: 'uuid-new', id: 999 });

            await (tool as any).execute({ targetId: 10, content: 'New Block', anchor: 'before' });

            expect(mockInsertBlock).toHaveBeenCalledWith('uuid-target', 'New Block', { sibling: true, before: true });
        });

        it('should add merge property when merge=true', async () => {
            const tool = createAddBlockTool({ merge: true });
            mockGetBlock.mockResolvedValue({ uuid: 'uuid-target' });
            mockInsertBlock.mockResolvedValue({ uuid: 'uuid-new', id: 999 });

            await (tool as any).execute({ targetId: 10, content: 'New Block' });

            expect(mockInsertBlock).toHaveBeenCalledWith(
                'uuid-target',
                'New Block',
                {}
            );
            expect(mockUpsertBlockProperty).toHaveBeenCalledWith(
                'uuid-new',
                LDA_MERGE_PROPERTY,
                expect.stringContaining('{"type":"add"}')
            );
        });
        it('should handle targetId with # prefix in addBlock', async () => {
            const tool = createAddBlockTool({ merge: false });
            mockGetBlock.mockResolvedValue({ uuid: 'uuid-target' });
            mockInsertBlock.mockResolvedValue({ uuid: 'uuid-new', id: 999 });

            await (tool as any).execute({ targetId: '#123', content: 'New Block' });

            expect(mockGetBlock).toHaveBeenCalledWith(123);
        });

        it('should fallback to getPage if getBlock fails', async () => {
            const tool = createAddBlockTool({ merge: false });
            mockGetBlock.mockResolvedValue(null); // Block not found
            mockGetPage.mockResolvedValue({ uuid: 'uuid-page' }); // Page found
            mockInsertBlock.mockResolvedValue({ uuid: 'uuid-new', id: 999 });

            await (tool as any).execute({ targetId: 99, content: 'Page Block' });

            expect(mockGetBlock).toHaveBeenCalledWith(99);
            expect(mockGetPage).toHaveBeenCalledWith(99);
            expect(mockInsertBlock).toHaveBeenCalledWith('uuid-page', 'Page Block', {});
        });
    });

    describe('deleteBlock', () => {
        it('should remove block (merge=false)', async () => {
            const tool = createDeleteBlockTool({ merge: false });
            mockGetBlock.mockResolvedValue({ uuid: 'uuid-target' });

            await (tool as any).execute({ id: 10 });

            expect(mockGetBlock).toHaveBeenCalledWith(10);
            expect(mockRemoveBlock).toHaveBeenCalledWith('uuid-target');
        });

        it('should handle ID with # prefix in deleteBlock', async () => {
            const tool = createDeleteBlockTool({ merge: false });
            mockGetBlock.mockResolvedValue({ uuid: 'uuid-target' });

            await (tool as any).execute({ id: '#999' });

            expect(mockGetBlock).toHaveBeenCalledWith(999);
            expect(mockRemoveBlock).toHaveBeenCalledWith('uuid-target');
        });

        it('should mark block as deleted (merge=true)', async () => {
            const tool = createDeleteBlockTool({ merge: true });
            // First call to check existence
            mockGetBlock.mockResolvedValue({ uuid: 'uuid-target', content: 'Existing Content' });

            await (tool as any).execute({ id: 10 });

            // Should add merge property and keep content
            // Should add merge property via upsertBlockProperty
            expect(mockUpsertBlockProperty).toHaveBeenCalledWith(
                'uuid-target',
                LDA_MERGE_PROPERTY,
                expect.stringContaining('{"type":"delete"}')
            );
            // updateBlock should NOT be called for delete (unless we decide to modify content, which we don't for now)
            expect(mockUpdateBlock).not.toHaveBeenCalled();
        });
    });

    describe('moveBlock', () => {
        it('should move block (merge=false)', async () => {
            const tool = createMoveBlockTool({ merge: false });
            mockGetBlock.mockImplementation((id) => {
                if (id === 10) return Promise.resolve({ uuid: 'uuid-source' });
                if (id === 20) return Promise.resolve({ uuid: 'uuid-target' });
                return Promise.resolve(null);
            });

            await (tool as any).execute({ id: 10, targetId: 20, anchor: 'after' });

            expect(mockMoveBlock).toHaveBeenCalledWith('uuid-source', 'uuid-target', { sibling: true, before: false });
        });

        it('should move and record origin (merge=true)', async () => {
            const tool = createMoveBlockTool({ merge: true });

            // Mock parent/sibling structure lookup
            mockGetBlock.mockImplementation((id) => {
                if (id === 10) return Promise.resolve({
                    uuid: 'uuid-source', content: 'Source',
                    parent: { id: 100 },
                    left: { id: 200 }
                });
                if (id === 20) return Promise.resolve({ uuid: 'uuid-target' });
                if (id === 100) return Promise.resolve({ uuid: 'uuid-parent' }); // resolved parent
                if (id === 200) return Promise.resolve({ uuid: 'uuid-sibling' }); // resolved left
                return Promise.resolve(null);
            });

            await (tool as any).execute({ id: 10, targetId: 20 });

            // 1. Move - default anchor 'parent' should pass { children: true }
            expect(mockMoveBlock).toHaveBeenCalledWith('uuid-source', 'uuid-target', { children: true });

            // 2. Update with history
            expect(mockUpsertBlockProperty).toHaveBeenCalledWith(
                'uuid-source',
                LDA_MERGE_PROPERTY,
                expect.stringContaining('"type":"move"')
            );
            expect(mockUpsertBlockProperty).toHaveBeenCalledWith(
                'uuid-source',
                LDA_MERGE_PROPERTY,
                expect.stringContaining('"originalParentUuid":"uuid-parent"')
            );
            expect(mockUpsertBlockProperty).toHaveBeenCalledWith(
                'uuid-source',
                LDA_MERGE_PROPERTY,
                expect.stringContaining('"originalPriorSiblingUuid":"uuid-sibling"')
            );
        });
    });

    describe('updateBlock', () => {
        it('should update block content (merge=false)', async () => {
            const tool = createUpdateBlockTool({ merge: false });
            mockGetBlock.mockResolvedValue({ uuid: 'uuid-target' });

            await (tool as any).execute({ id: 10, content: 'Updated Content' });

            expect(mockUpdateBlock).toHaveBeenCalledWith('uuid-target', 'Updated Content');
        });

        it('should handle ID with # prefix as number (merge=false)', async () => {
            const tool = createUpdateBlockTool({ merge: false });
            mockGetBlock.mockResolvedValue({ uuid: 'uuid-target-hash' });

            await (tool as any).execute({ id: '#123', content: 'Updated Content' });

            expect(mockGetBlock).toHaveBeenCalledWith(123);
            expect(mockUpdateBlock).toHaveBeenCalledWith('uuid-target-hash', 'Updated Content');
        });

        it('should handle numeric string ID as number (merge=false)', async () => {
            const tool = createUpdateBlockTool({ merge: false });
            mockGetBlock.mockResolvedValue({ uuid: 'uuid-target-num-str' });

            await (tool as any).execute({ id: '456', content: 'Updated Content' });

            expect(mockGetBlock).toHaveBeenCalledWith(456);
            expect(mockUpdateBlock).toHaveBeenCalledWith('uuid-target-num-str', 'Updated Content');
        });

        it('should update block with merge property (merge=true)', async () => {
            const tool = createUpdateBlockTool({ merge: true });
            mockGetBlock.mockResolvedValue({ uuid: 'uuid-target', content: 'Old Content' });

            await (tool as any).execute({ id: 10, content: 'Updated Content' });

            expect(mockUpsertBlockProperty).toHaveBeenCalledWith(
                'uuid-target',
                LDA_MERGE_PROPERTY,
                expect.stringContaining('"type":"update"')
            );
            // base should contain the original content
            expect(mockUpsertBlockProperty).toHaveBeenCalledWith(
                'uuid-target',
                LDA_MERGE_PROPERTY,
                expect.stringContaining('"base":"Old Content"')
            );

            // updateBlock should be called with just the new content
            expect(mockUpdateBlock).toHaveBeenCalledWith(
                'uuid-target',
                expect.not.stringContaining(`${LDA_MERGE_PROPERTY}::`)
            );
            expect(mockUpdateBlock).toHaveBeenCalledWith(
                'uuid-target',
                expect.stringContaining('Updated Content')
            );
        });
        it('should sanitize content (replace - with +)', async () => {
            const tool = createUpdateBlockTool({ merge: false });
            mockGetBlock.mockResolvedValue({ uuid: 'uuid-target' });

            await (tool as any).execute({ id: 10, content: '- List item\n  - Nested item', parse_subtrees: false });

            expect(mockUpdateBlock).toHaveBeenCalledWith(
                'uuid-target',
                '+ List item\n  + Nested item'
            );
        });
    });
});
