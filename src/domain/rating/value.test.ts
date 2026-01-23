
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

    it('should return correct severity based on rounded value', () => {
        // Excellent (> 4)
        expect(RatingValue.fromNumber(5.0).getSeverity()).toBe('excellent');
        expect(RatingValue.fromNumber(4.5).getSeverity()).toBe('excellent');
        expect(RatingValue.fromNumber(4.3).getSeverity()).toBe('excellent'); // Rounds to 4.5

        // Good (> 3)
        expect(RatingValue.fromNumber(4.0).getSeverity()).toBe('good');
        expect(RatingValue.fromNumber(3.5).getSeverity()).toBe('good');
        expect(RatingValue.fromNumber(3.8).getSeverity()).toBe('good'); // Rounds to 4.0? No 3.8 -> 7.6 -> 8 -> 4.0. Good.
        expect(RatingValue.fromNumber(4.2).getSeverity()).toBe('good'); // Rounds to 4.0. Good.

        // Warning (> 2)
        expect(RatingValue.fromNumber(3.0).getSeverity()).toBe('warning');
        expect(RatingValue.fromNumber(2.5).getSeverity()).toBe('warning');
        expect(RatingValue.fromNumber(2.4).getSeverity()).toBe('warning'); // Rounds to 2.5. Warning.

        // Bad (<= 2)
        expect(RatingValue.fromNumber(2.0).getSeverity()).toBe('bad');
        expect(RatingValue.fromNumber(1.5).getSeverity()).toBe('bad');
        expect(RatingValue.fromNumber(1.0).getSeverity()).toBe('bad');
        expect(RatingValue.fromNumber(0.5).getSeverity()).toBe('bad');
        expect(RatingValue.fromNumber(0.1).getSeverity()).toBe('bad'); // Rounds to 0.0? 0.2 -> 0. Muted? 
        // 0.1 * 2 = 0.2 -> 0. 0 is Muted.
    });

    it('should return muted for 0', () => {
        expect(RatingValue.fromNumber(0).getSeverity()).toBe('muted');
    });
});
