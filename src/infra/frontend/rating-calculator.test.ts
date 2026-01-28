import { describe, it, expect } from 'vitest';
import { FrontendRatingCalculator } from './rating-calculator';
import { FeedbackParser } from '../../domain/rating/parser';

// Minimal data for testing calculator
const testData = {
    "CAT1": {
        "CRIT1": { "rating": 4, "feedback": "good" },
        "CRIT2": { "rating": 2, "feedback": "bad" }
    },
    "CAT2": {
        "CRIT3": { "rating": 3, "feedback": "ok" }
    }
};

describe('FrontendRatingCalculator', () => {
    const feedbackRating = FeedbackParser.parseFromFeedbackData('test-id', testData);
    const calculator = new FrontendRatingCalculator();

    it('should calculate overall rating from FeedbackRating object', () => {
        // (4 + 2 + 3) / 3 = 3
        const result = calculator.calculateOverallRatingFromFeedback(feedbackRating);
        expect(result).toBe(3);
    });

    it('should calculate individual category ratings', () => {
        const cat1 = feedbackRating.categoryRatings.find(c => c.category === 'CAT1');
        const cat2 = feedbackRating.categoryRatings.find(c => c.category === 'CAT2');

        expect(calculator.calculateCategoryRating(cat1!)).toBe(3); // (4+2)/2 = 3
        expect(calculator.calculateCategoryRating(cat2!)).toBe(3); // 3/1 = 3
    });

    it('should calculate overall rating from list of categories', () => {
        const result = calculator.calculateOverallRatingFromCategories(feedbackRating.categoryRatings);
        expect(result).toBe(3);
    });
});
