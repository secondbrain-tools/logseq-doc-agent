
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAddBlockTool } from './add_block_tool';
import { createDeleteBlockTool } from './delete_block_tool';
import { createMoveBlockTool } from './move_block_tool';
import { ShortIdService } from '../short-id.service';

describe('Block Management Tools', () => {
    // Mocks
    const mockInsertBlock = vi.fn();
    const mockRemoveBlock = vi.fn();
    const mockMoveBlock = vi.fn();
    const mockGetBlock = vi.fn();
    const mockUpdateBlock = vi.fn();

    const mockGetUuid = vi.fn();
    const mockGetShortId = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        vi.stubGlobal('logseq', {
            Editor: {
                insertBlock: mockInsertBlock,
                removeBlock: mockRemoveBlock,
                moveBlock: mockMoveBlock,
                getBlock: mockGetBlock,
                updateBlock: mockUpdateBlock,
            },
        });

        vi.spyOn(ShortIdService, 'getInstance').mockReturnValue({
            getUuid: mockGetUuid,
            getShortId: mockGetShortId,
        } as any);

        mockGetUuid.mockImplementation((short) => `uuid-${short.replace('#', '')}`);
        mockGetShortId.mockImplementation((uuid) => `#${uuid.replace('uuid-', '')}`);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('addBlock', () => {
        it('should append block as child by default (merge=false)', async () => {
            const tool = createAddBlockTool({ merge: false });
            mockInsertBlock.mockResolvedValue({ uuid: 'uuid-new' });

            const result = await (tool as any).execute({ targetShortId: '#target', content: 'New Block' });

            expect(mockInsertBlock).toHaveBeenCalledWith('uuid-target', 'New Block', {});
            expect(result).toContain('Successfully added block #new');
            expect(result).toContain('parent #target');
        });

        it('should insert block before target (merge=false)', async () => {
            const tool = createAddBlockTool({ merge: false });
            mockInsertBlock.mockResolvedValue({ uuid: 'uuid-new' });

            await (tool as any).execute({ targetShortId: '#target', content: 'New Block', anchor: 'before' });

            expect(mockInsertBlock).toHaveBeenCalledWith('uuid-target', 'New Block', { sibling: true, before: true });
        });

        it('should add merge property when merge=true', async () => {
            const tool = createAddBlockTool({ merge: true });
            mockInsertBlock.mockResolvedValue({ uuid: 'uuid-new' });

            await (tool as any).execute({ targetShortId: '#target', content: 'New Block' });

            expect(mockInsertBlock).toHaveBeenCalledWith(
                'uuid-target',
                expect.stringContaining('logseq-doc-agent.merge:: {"type":"add"}'),
                {}
            );
        });
    });

    describe('deleteBlock', () => {
        it('should remove block (merge=false)', async () => {
            const tool = createDeleteBlockTool({ merge: false });
            await (tool as any).execute({ shortid: '#target' });

            expect(mockRemoveBlock).toHaveBeenCalledWith('uuid-target');
            expect(mockUpdateBlock).not.toHaveBeenCalled();
        });

        it('should mark block as deleted (merge=true)', async () => {
            const tool = createDeleteBlockTool({ merge: true });
            mockGetBlock.mockResolvedValue({ uuid: 'uuid-target', content: 'Existing Content' });

            await (tool as any).execute({ shortid: '#target' });

            expect(mockRemoveBlock).not.toHaveBeenCalled();
            expect(mockGetBlock).toHaveBeenCalledWith('uuid-target');

            // Should add merge property and keep content
            expect(mockUpdateBlock).toHaveBeenCalledWith(
                'uuid-target',
                expect.stringContaining('logseq-doc-agent.merge:: {"type":"delete"}')
            );
            expect(mockUpdateBlock).toHaveBeenCalledWith(
                'uuid-target',
                expect.stringContaining('Existing Content')
            );
        });
    });

    describe('moveBlock', () => {
        it('should move block (merge=false)', async () => {
            const tool = createMoveBlockTool({ merge: false });
            await (tool as any).execute({ shortid: '#source', targetShortId: '#target', anchor: 'after' });

            expect(mockMoveBlock).toHaveBeenCalledWith('uuid-source', 'uuid-target', { sibling: true, before: false });
        });

        it('should move and record origin (merge=true)', async () => {
            const tool = createMoveBlockTool({ merge: true });

            // Mock parent structure
            mockGetBlock.mockImplementation((uuid) => {
                if (uuid === 'uuid-source') return Promise.resolve({
                    uuid, content: 'Source',
                    parent: { id: 10 },
                    left: { id: 20 }
                });
                if (uuid === 10) return Promise.resolve({ uuid: 'uuid-parent' }); // resolved parent
                if (uuid === 20) return Promise.resolve({ uuid: 'uuid-sibling' }); // resolved left
                return Promise.resolve(null);
            });

            await (tool as any).execute({ shortid: '#source', targetShortId: '#target' });

            // 1. Move
            expect(mockMoveBlock).toHaveBeenCalledWith('uuid-source', 'uuid-target', {});

            // 2. Update with history
            expect(mockUpdateBlock).toHaveBeenCalledWith(
                'uuid-source',
                expect.stringContaining('"type":"move"')
            );
            expect(mockUpdateBlock).toHaveBeenCalledWith(
                'uuid-source',
                expect.stringContaining('"originalParentUuid":"uuid-parent"')
            );
            expect(mockUpdateBlock).toHaveBeenCalledWith(
                'uuid-source',
                expect.stringContaining('"originalPriorSiblingUuid":"uuid-sibling"')
            );
        });
    });
});
