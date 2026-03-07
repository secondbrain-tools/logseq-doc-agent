import { describe, it, expect } from 'vitest';
import { FrontendEvaluationCalculator } from './evaluation-calculator';
import type { BlockEvaluation } from '../../domain/evaluation/entity';

// Minimal data for testing calculator
const testEvaluation: BlockEvaluation = {
    results: [
        {
            criterion_id: 'C1',
            category: 'CAT1',
            score: 4,
            reason: 'good',
            confidence: 85,
            issues: []
        },
        {
            criterion_id: 'C2',
            category: 'CAT1',
            score: 2,
            reason: 'bad',
            confidence: 50,
            issues: [{
                description: "Bad text",
                impact: "high",
                evidence: [],
                suggestions: [{
                    op: 'replace',
                    selector: { type: 'TextQuoteSelector', exact: 'bad text', prefix: null, suffix: null },
                    proposed_text: 'better text',
                    rationale: 'clearer'
                }]
            }]
        },
        {
            criterion_id: 'C3',
            category: 'CAT2',
            score: 3,
            reason: 'ok',
            confidence: 90,
            issues: [{
                description: "Ok text",
                impact: "medium",
                evidence: [],
                suggestions: [{
                    op: 'replace',
                    selector: { type: 'TextQuoteSelector', exact: 'ok text', prefix: null, suffix: null },
                    proposed_text: 'good text',
                    rationale: 'better'
                }]
            }]
        }
    ],
    summary: null
};

const testEvaluationWithSummary: BlockEvaluation = {
    results: [
        {
            criterion_id: 'C1',
            category: 'CAT1',
            score: 4,
            reason: 'good',
            confidence: 95,
            issues: []
        }
    ],
    summary: {
        overall_score: 5,
        overall_reason: 'Excellent work!',
        category_aggregates: [
            {
                category: 'CAT1',
                average_score: 5,
                criteria_count: 1
            }
        ]
    }
};

describe('FrontendEvaluationCalculator', () => {
    const calculator = new FrontendEvaluationCalculator();

    it('should calculate overall rating from results when summary is missing', () => {
        // (4 + 2 + 3) / 3 = 3
        const result = calculator.calculateOverallScore(testEvaluation);
        expect(result).toBe(3);
    });

    it('should calculate overall rating from summary when summary is present', () => {
        const result = calculator.calculateOverallScore(testEvaluationWithSummary);
        expect(result).toBe(5);
    });

    it('should calculate individual category ratings', () => {
        const cat1Results = testEvaluation.results.filter(c => c.category === 'CAT1');
        const cat2Results = testEvaluation.results.filter(c => c.category === 'CAT2');

        expect(calculator.calculateCategoryScore(cat1Results)).toBe(3); // (4+2)/2 = 3
        expect(calculator.calculateCategoryScore(cat2Results)).toBe(3); // 3/1 = 3
    });
});
