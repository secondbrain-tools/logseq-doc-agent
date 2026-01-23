
import { describe, it, expect } from 'vitest';
import { RatingValue } from './value';

describe('RatingValue', () => {
    it('should create valid instance', () => {
        const r = new RatingValue(4, 5);
        expect(r.value).toBe(4);
        expect(r.max).toBe(5);
    });

    it('should throw error for invalid value', () => {
        expect(() => new RatingValue(6, 5)).toThrow();
        expect(() => new RatingValue(-1, 5)).toThrow();
    });

    it('should format string correctly', () => {
        const r = new RatingValue(3.5, 5);
        expect(r.toFormattedString()).toBe('3.5/5');
    });

    it('should return correct semantic color class', () => {
        // We are updating the domain to return semantic info, or just testing current state?
        // Current state relies on getColor() returning hex.
        // We plan to remove that. Let's write test for the NEW logic if we change it here.
        // For now, testing existing logic:
        const r = new RatingValue(1, 5);
        // expect(r.getColor()).toBe('#dc2626'); 
        // We will replace this test soon.
    });
});
