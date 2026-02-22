import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSubmitBlockEvaluationTool } from './submit_block_evaluation_tool';
import { LDA_EVALUATION_PROPERTY } from '../../../domain/logseq/properties';

// Mock types
const mockLogseq = {
    Editor: {
        getBlock: vi.fn(),
        upsertBlockProperty: vi.fn(),
    },
};

// Global mock
vi.stubGlobal('logseq', mockLogseq);
vi.stubGlobal('window', { logseq: mockLogseq });

describe('submitBlockEvaluation tool', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should submit evaluation and save to block property', async () => {
        mockLogseq.Editor.getBlock.mockResolvedValueOnce({ uuid: 'uuid-1' });

        const tool = createSubmitBlockEvaluationTool() as any;
        const mockEvaluation = {
            results: [{
                criterion_id: 'clarity',
                category: 'Writing',
                score: 5,
                reason: 'Very clear',
                evidence: [],
                suggestions: []
            }],
            summary: {
                overall_score: 5,
                overall_reason: 'Good',
                category_aggregates: []
            }
        };

        const result = await tool.execute(
            { block_id: 1, evaluation: mockEvaluation },
            { toolCallId: 'test', messages: [] }
        );

        expect(mockLogseq.Editor.getBlock).toHaveBeenCalledWith(1);
        expect(mockLogseq.Editor.upsertBlockProperty).toHaveBeenCalledWith('uuid-1', LDA_EVALUATION_PROPERTY, JSON.stringify(mockEvaluation));
        expect(result).toContain('Successfully submitted evaluation');
    });

    it('should handle missing block gracefully', async () => {
        mockLogseq.Editor.getBlock.mockResolvedValueOnce(null);

        const tool = createSubmitBlockEvaluationTool() as any;
        const mockEvaluation = {
            results: [{
                criterion_id: 'clarity',
                category: 'Writing',
                score: 5,
                reason: 'Very clear',
                evidence: [],
                suggestions: []
            }],
            summary: null
        };

        const result = await tool.execute(
            { block_id: 'invalid', evaluation: mockEvaluation },
            { toolCallId: 'test', messages: [] }
        );

        expect(mockLogseq.Editor.upsertBlockProperty).not.toHaveBeenCalled();
        expect(result).toContain('Error: Block not found');
    });
});
