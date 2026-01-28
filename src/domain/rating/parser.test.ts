import { describe, it, expect } from 'vitest';
import { FeedbackParser } from './parser';
import type { LogseqFeedbackData } from './parser';

const exampleFeedbackData: LogseqFeedbackData = {
    "CONTENT": {
        "ACCURACY": {
            "rating": 3,
            "feedback": "Kapitel 4 – Verweis auf Moore's Law als Hauptantwort ist plausibel, könnte jedoch um weitere Faktoren (Daten, Architektur) ergänzt werden."
        },
        "RELEVANCE": {
            "rating": 4,
            "feedback": "Kapitel 4 – zentrale Frage „Warum sind LLMs so gut?“ ist hoch relevant und rahmt nachfolgende Kapitel gut ein."
        }
    },
    "AUDIENCE_FORM": {
        "ENGAGEMENT": {
            "rating": 4,
            "feedback": "Kapitel 4 – die offenen Fragen an das Publikum erzeugen Neugier und bereiten gut auf die folgenden Beispiele vor."
        }
    },
    "LANGUAGE": {
        "CLARITY": {
            "rating": 4,
            "feedback": "Kapitel 4 – Fragen sind klar und ansprechend formuliert; die Kernbotschaft (Moore's Law als Schlüsselelement) ist verständlich."
        }
    },
    "STRUCTURE": {
        "GLOBAL": {
            "rating": 3,
            "feedback": "Kapitel 4 – Fragefolie plus kurze Notiz; als Einstieg in den \"Compute\"-Block sinnvoll, aber noch ohne ausführliche Ausarbeitung im selben Kapitel."
        }
    }
};

describe('FeedbackParser', () => {
    describe('validateLogseqData', () => {
        it('should return true for valid feedback data', () => {
            const isValid = FeedbackParser.validateLogseqData(exampleFeedbackData);
            expect(isValid).toBe(true);
        });

        it('should return false for invalid data types', () => {
            expect(FeedbackParser.validateLogseqData(null)).toBe(false);
            expect(FeedbackParser.validateLogseqData('string')).toBe(false);
            expect(FeedbackParser.validateLogseqData(123)).toBe(false);
        });

        it('should return false for malformed structure', () => {
            const malformed = {
                "CATEGORY": {
                    "CRITERION": {
                        "rating": "not a number", // Invalid rating type
                        "feedback": "text"
                    }
                }
            };
            expect(FeedbackParser.validateLogseqData(malformed)).toBe(false);
        });
    });

    describe('parseFromFeedbackData', () => {
        it('should correctly parse example feedback data', () => {
            const feedbackRating = FeedbackParser.parseFromFeedbackData('test-123', exampleFeedbackData, 'element-456');

            expect(feedbackRating.id).toBe('test-123');
            expect(feedbackRating.targetElementId).toBe('element-456');
            expect(feedbackRating.categoryRatings).toHaveLength(4);

            // Check specific numbers
            // Criteria: 3, 4, 4, 4, 3. Sum = 18. Count = 5. Average = 3.6
            expect(feedbackRating.overallRating).toBe(3.6);
        });
    });

    describe('toLogseqFormat (Roundtrip)', () => {
        it('should preserve data after roundtrip conversion', () => {
            const feedbackRating = FeedbackParser.parseFromFeedbackData('test-123', exampleFeedbackData);
            const logseqFormat = FeedbackParser.toLogseqFormat(feedbackRating);
            const reparsed = FeedbackParser.parseFromFeedbackData('test-123', logseqFormat);

            expect(reparsed.overallRating).toBe(feedbackRating.overallRating);
            expect(reparsed.categoryRatings).toHaveLength(feedbackRating.categoryRatings.length);
        });
    });

    describe('parseFromJsonString', () => {
        it('should parse valid JSON string', () => {
            const jsonString = JSON.stringify(exampleFeedbackData);
            const fromJson = FeedbackParser.parseFromJsonString('test-456', jsonString);

            expect(fromJson.overallRating).toBe(3.6);
        });

        it('should throw error on invalid JSON', () => {
            expect(() => {
                FeedbackParser.parseFromJsonString('test-fail', '{ invalid json }');
            }).toThrow('Failed to parse feedback JSON');
        });
    });
});
