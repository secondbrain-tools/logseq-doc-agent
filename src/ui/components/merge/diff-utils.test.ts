
import { describe, it, expect } from 'vitest';
import {
    similarity,
    calculateDiffLines,
    generateContentFromDiff,
    type PartDecisions
} from './diff-utils';

describe('diff-utils', () => {
    describe('similarity', () => {
        it('should return 1 for identical strings', () => {
            expect(similarity('abc', 'abc')).toBe(1);
        });

        it('should return 0 for completely different strings', () => {
            expect(similarity('abc', 'def')).toBe(0);
        });

        it('should return correct similarity for partial matches', () => {
            // "kitten" vs "sitten" -> distance 1, maxLen 6 -> 1 - 1/6 = 0.833...
            expect(similarity('kitten', 'sitten')).toBeCloseTo(0.833, 3);
        });
    });

    describe('calculateDiffLines (Unified Mode)', () => {
        it('should detect simple replacement', () => {
            const original = 'The fast fox';
            const modified = 'The slow fox';
            const params: PartDecisions = {};
            const result = calculateDiffLines(original, modified, 'words', params);

            expect(result.diffLines).toHaveLength(1);
            const line = result.diffLines[0];
            expect(line.type).toBe('modified-unified');
            expect(line.unifiedParts).toBeDefined();

            // "The " (common) "fast" (removed) "slow" (added) " fox" (common)
            // Or replacement "fast" -> "slow"
            const parts = line.unifiedParts!;
            // diff-words typically handles this as: "The " common, "fast" removed, "slow" added, " fox" common.
            // Our computeUnifiedParts groups removed+added as replacement.

            const replacement = parts.find(p => p.type === 'replacement');
            expect(replacement).toBeDefined();
            expect(replacement?.removedText).toBe('fast');
            expect(replacement?.addedText).toBe('slow');
        });

        it('should detect pure addition', () => {
            const original = 'foo';
            const modified = 'foo bar';
            const params: PartDecisions = {};
            const result = calculateDiffLines(original, modified, 'words', params);

            expect(result.diffLines).toHaveLength(1);
            const parts = result.diffLines[0].unifiedParts!;
            const added = parts.find(p => p.type === 'added');
            expect(added).toBeDefined();
            expect(added?.text).toBe(' bar'); // diff-words usually includes space in the added part
        });

        it('should detect pure removal', () => {
            const original = 'foo bar';
            const modified = 'foo';
            const params: PartDecisions = {};
            const result = calculateDiffLines(original, modified, 'words', params);

            expect(result.diffLines).toHaveLength(1);
            const parts = result.diffLines[0].unifiedParts!;
            const removed = parts.find(p => p.type === 'removed');
            expect(removed).toBeDefined();
            expect(removed?.text).toBe(' bar');
        });

        it('should initialize decisions for new parts', () => {
            const original = 'A';
            const modified = 'B';
            const params: PartDecisions = {};
            const result = calculateDiffLines(original, modified, 'words', params);

            // "A" -> "B" is replacement
            expect(Object.keys(result.newDecisions).length).toBeGreaterThan(0);
            // Verify default valid decision
            const id = Object.keys(result.newDecisions)[0];
            expect(result.newDecisions[id]).toBe('accept');
        });
    });

    describe('generateContentFromDiff', () => {
        it('should reconstruct modified content when all accepted (default)', () => {
            const original = 'The fast fox';
            const modified = 'The slow fox';
            const result = calculateDiffLines(original, modified, 'words', {});

            const content = generateContentFromDiff(result.diffLines, result.newDecisions);
            expect(content).toBe(modified);
        });

        it('should reconstruct original content when all reverted', () => {
            const original = 'The fast fox';
            const modified = 'The slow fox';
            const result = calculateDiffLines(original, modified, 'words', {});

            // Revert all decisions
            const revertedDecisions = { ...result.newDecisions };
            for (const key of Object.keys(revertedDecisions)) {
                revertedDecisions[key] = 'revert';
            }

            const content = generateContentFromDiff(result.diffLines, revertedDecisions);
            expect(content).toBe(original);
        });

        it('should handle mixed decisions (partial accept/revert)', () => {
            // "The quick brown fox" -> "The slow brown fox"
            // Similarity should be high enough for unified diff.
            const original = 'The quick brown fox';
            const modified = 'The slow brown fox';
            const result = calculateDiffLines(original, modified, 'words', {});

            // Expect 1 replacement (quick -> slow)
            const parts = result.diffLines[0].unifiedParts!;
            const replacements = parts.filter(p => p.type === 'replacement');
            expect(replacements).toHaveLength(1);

            // Decisions: revert the replacement (keep "quick")
            const decisions = { ...result.newDecisions };
            if (replacements[0].id) decisions[replacements[0].id] = 'revert';

            const content = generateContentFromDiff(result.diffLines, decisions);
            expect(content).toBe(original);

            // Now try accepting
            if (replacements[0].id) decisions[replacements[0].id] = 'accept';
            const content2 = generateContentFromDiff(result.diffLines, decisions);
            expect(content2).toBe(modified);
        });

        it('should handle complex replacement: "goes" -> "is better"', () => {
            const original = 'Concept A goes';
            const modified = 'Concept A is better';

            const result = calculateDiffLines(original, modified, 'words', {});
            const parts = result.diffLines[0].unifiedParts!;

            // Should see a replacement. Depending on diff-words, it might be "goes" -> "is better"
            // or "goes" -> "is" and "better" added.
            // Our logic tends to group adjacent remove+add.

            const replacement = parts.find(p => p.type === 'replacement');
            expect(replacement).toBeDefined();
            // We expect "goes" to be removed
            expect(replacement?.removedText).toBe('goes');
            // We expect "is better" (or " is better") to be added
            expect(replacement?.addedText).toContain('is better');

            // Test Partial Revert
            const decisions = { ...result.newDecisions };
            if (replacement?.id) decisions[replacement.id] = 'revert';
            expect(generateContentFromDiff(result.diffLines, decisions)).toBe(original);
        });

        it('should handle pure line additions/removals', () => {
            // Case where similarity is low and it falls back to full line add/remove in Unified mode?
            // Actually currently logic forces "Unified" (intra-line) if sim >= threshold.
            // If sim < threshold, it does separate lines even in "words" mode? 
            // Let's check logic... 
            // Yes, "if (sim >= SIMILARITY_THRESHOLD) ... if (mode === 'words') ..."
            // So if sim is low, it falls through to the `else` block which emits separate Removed/Added lines.
            // Let's test that fallback.

            const original = 'completely different';
            const modified = 'something else entirely';
            // sim should be low

            const result = calculateDiffLines(original, modified, 'words', {});
            // Should have 2 lines: 1 removed, 1 added (pure)
            expect(result.diffLines).toHaveLength(2);
            expect(result.diffLines[0].type).toBe('removed');
            expect(result.diffLines[1].type).toBe('added');

            // Test Accept (Default) -> Should be new content
            let content = generateContentFromDiff(result.diffLines, result.newDecisions);
            expect(content).toBe(modified);

            // Test Revert -> Should be old content
            const decisions = { ...result.newDecisions };
            Object.keys(decisions).forEach(k => decisions[k] = 'revert');

            content = generateContentFromDiff(result.diffLines, decisions);
            // If we revert the removal (keep old) AND revert the addition (drop new)
            // Then we get original.
            expect(content).toBe(original);
        });
    });
});
