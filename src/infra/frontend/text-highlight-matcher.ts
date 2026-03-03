import type { TextQuoteSelector } from '../../domain/evaluation/entity';

export interface MatchResult {
    startOffset: number;
    endOffset: number;
    matchScore: number;
}

/**
 * Normalizes text for searching by removing non-alphanumeric characters,
 * converting to lowercase, and normalizing unicode (e.g. stripping accents).
 * @param text The original text
 * @returns An object containing the normalized string and a mapping array
 *          where map[i] is the original index of the i-th character in the normalized string.
 */
export function normalizeTextWithMap(text: string): { normalized: string, map: number[] } {
    const normalizedChars: string[] = [];
    const map: number[] = [];

    // Normalize to NFD and strip diacritics
    const nfdText = text.normalize('NFD');

    // We walk the original string but map from the stripped NFD string index
    // back to the original text index.
    // For simplicity, we assume 1 NFD base char corresponds to 1 original char (mostly true),
    // but diacritics will map to the original char index as well (though they are stripped).
    // A more robust approach just walks the original string, normalizes each char, 
    // and decides whether to keep it.

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        // Normalize single character
        const normalizedChar = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

        // Check if it's alphanumeric
        if (/^[a-z0-9]$/.test(normalizedChar)) {
            normalizedChars.push(normalizedChar);
            map.push(i);
        }
    }

    return {
        normalized: normalizedChars.join(''),
        map
    };
}

/**
 * Normalizes a simple string for search comparison
 */
function normalizeSimple(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds the best match for a TextQuoteSelector in the given plain text.
 * Uses a fuzzy matching approach that ignores punctuation, casing, and whitespace.
 */
export function findBestMatch(text: string, selector: TextQuoteSelector): MatchResult | null {
    if (!selector.exact || text.length === 0) {
        return null;
    }

    const { normalized: haystack, map: haystackMap } = normalizeTextWithMap(text);
    const needle = normalizeSimple(selector.exact);

    if (needle.length === 0 || haystack.length === 0) {
        return null;
    }

    const prefix = selector.prefix ? normalizeSimple(selector.prefix) : '';
    const suffix = selector.suffix ? normalizeSimple(selector.suffix) : '';

    const candidates: { startIdx: number, endIdx: number, score: number }[] = [];

    // Find all occurrences of the needle in the haystack
    let searchIdx = 0;
    while (searchIdx < haystack.length) {
        const matchIdx = haystack.indexOf(needle, searchIdx);
        if (matchIdx === -1) {
            break;
        }

        let score = 0;

        // Check prefix context if provided
        if (prefix) {
            // How much of the prefix matches the text immediately preceding the match?
            const availablePrefixLen = Math.min(prefix.length, matchIdx);
            if (availablePrefixLen > 0) {
                const actualPrefix = haystack.substring(matchIdx - availablePrefixLen, matchIdx);
                const expectedPrefix = prefix.substring(prefix.length - availablePrefixLen);
                if (actualPrefix === expectedPrefix) {
                    score += availablePrefixLen;
                }
            }
        }

        // Check suffix context if provided
        if (suffix) {
            // How much of the suffix matches the text immediately following the match?
            const haystackEndIdx = matchIdx + needle.length;
            const availableSuffixLen = Math.min(suffix.length, haystack.length - haystackEndIdx);
            if (availableSuffixLen > 0) {
                const actualSuffix = haystack.substring(haystackEndIdx, haystackEndIdx + availableSuffixLen);
                const expectedSuffix = suffix.substring(0, availableSuffixLen);
                if (actualSuffix === expectedSuffix) {
                    score += availableSuffixLen;
                }
            }
        }

        candidates.push({
            startIdx: matchIdx,
            endIdx: matchIdx + needle.length - 1,
            score
        });

        searchIdx = matchIdx + 1; // move forward to find overlapping or subsequent matches
    }

    if (candidates.length === 0) {
        return null; // No match found
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Pick the best match
    const best = candidates[0];

    // Map the normalized indices back to original string indices
    const origStart = haystackMap[best.startIdx];
    // For the end index, we want the point *after* the last character, 
    // so we take the original index of the last character, and add 1
    // (with a small caveat for diacritics/multi-byte chars, but `text[map_idx]` is usually 1 JS char)
    const origEnd = haystackMap[best.endIdx] + 1;

    // Expand to include surrounding non-alphanumeric characters in the exact match
    // if the exact match originally had them at boundaries.

    let expandedStart = origStart;
    let expandedEnd = origEnd;

    // To prevent gobbling trailing punctuation that is NOT in the selector.exact, 
    // we only expand backwards if the character in the text matches a non-alphanumeric
    // character at the start of the selector.exact string.
    let selectorStartIdx = 0;
    while (selectorStartIdx < selector.exact.length && !/^[a-z0-9]$/i.test(selector.exact[selectorStartIdx].normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
        selectorStartIdx++;
    }
    const leadingNonAlpha = selector.exact.substring(0, selectorStartIdx);

    // Only expand backwards if the text immediately preceding origStart matches leadingNonAlpha (ignoring spaces)
    if (leadingNonAlpha) {
        let charsToMatch = leadingNonAlpha.replace(/\s/g, '');
        while (expandedStart > 0 && charsToMatch.length > 0) {
            const prevChar = text[expandedStart - 1];
            if (/\s/.test(prevChar)) {
                expandedStart--;
                continue;
            }
            if (prevChar === charsToMatch[charsToMatch.length - 1]) {
                charsToMatch = charsToMatch.substring(0, charsToMatch.length - 1);
                expandedStart--;
            } else {
                break;
            }
        }
    }

    // Similar logic for trailing non-alphanumeric characters
    let selectorEndIdx = selector.exact.length - 1;
    while (selectorEndIdx >= 0 && !/^[a-z0-9]$/i.test(selector.exact[selectorEndIdx].normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
        selectorEndIdx--;
    }
    const trailingNonAlpha = selector.exact.substring(selectorEndIdx + 1);

    if (trailingNonAlpha) {
        let charsToMatch = trailingNonAlpha.replace(/\s/g, '');
        while (expandedEnd < text.length && charsToMatch.length > 0) {
            const nextChar = text[expandedEnd];
            if (/\s/.test(nextChar)) {
                expandedEnd++;
                continue;
            }
            if (nextChar === charsToMatch[0]) {
                charsToMatch = charsToMatch.substring(1);
                expandedEnd++;
            } else {
                break;
            }
        }
    }

    return {
        startOffset: expandedStart,
        endOffset: expandedEnd,
        matchScore: best.score
    };
}
