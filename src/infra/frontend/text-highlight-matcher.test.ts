import { describe, it, expect } from "vitest";
import { findBestMatch, normalizeTextWithMap } from "./text-highlight-matcher";
import type { TextQuoteSelector } from "../../domain/evaluation/entity";

describe("text-highlight-matcher", () => {
  describe("normalizeTextWithMap", () => {
    it("should strip non-alphanumeric chars and map positions correctly", () => {
      const result = normalizeTextWithMap("Hello, World!");
      expect(result.normalized).toBe("helloworld");

      // 'H' -> 0
      expect(result.map[0]).toBe(0);
      // 'e' -> 1
      expect(result.map[1]).toBe(1);
      // 'w' -> 7 (after 'Hello, ')
      expect(result.map[5]).toBe(7);
    });

    it("should handle diacritics", () => {
      const result = normalizeTextWithMap("Càfé!");
      expect(result.normalized).toBe("cafe");
      expect(result.map[0]).toBe(0); // C
      expect(result.map[1]).toBe(1); // à
      expect(result.map[2]).toBe(2); // f
      expect(result.map[3]).toBe(3); // é
    });
  });

  describe("findBestMatch", () => {
    it("should find an exact match when strings are identical", () => {
      const text = "This is a simple text.";
      const selector: TextQuoteSelector = {
        type: "TextQuoteSelector",
        exact: "simple",
        prefix: null,
        suffix: null,
      };

      const match = findBestMatch(text, selector);
      expect(match).not.toBeNull();
      expect(text.substring(match!.startOffset, match!.endOffset)).toBe("simple");
    });

    it("should find a match ignoring punctuation in haystack", () => {
      // e.g. "simple text" in "**simple** text" rendered as "simple text"
      const text = "This is a **simple** text.";
      const selector: TextQuoteSelector = {
        type: "TextQuoteSelector",
        exact: "simple text",
        prefix: null,
        suffix: null,
      };

      const match = findBestMatch(text, selector);
      expect(match).not.toBeNull();
      // It might gobble the ** depending on heuristics, but should at least contain the words
      const matchedText = text.substring(match!.startOffset, match!.endOffset);
      expect(matchedText).toContain("simple");
      expect(matchedText).toContain("text");
    });

    it("should handle diacritics differences", () => {
      const text = "I like Cafe a lot.";
      const selector: TextQuoteSelector = {
        type: "TextQuoteSelector",
        exact: "Càfé",
        prefix: null,
        suffix: null,
      };

      const match = findBestMatch(text, selector);
      expect(match).not.toBeNull();
      expect(text.substring(match!.startOffset, match!.endOffset)).toBe("Cafe");
    });

    it("should resolve ambiguity using prefix", () => {
      const text = "First simple test. Second simple test.";
      const selector: TextQuoteSelector = {
        type: "TextQuoteSelector",
        exact: "simple",
        prefix: "Second ",
        suffix: null,
      };

      const match = findBestMatch(text, selector);
      expect(match).not.toBeNull();
      // The match should be the second "simple" -> index 26
      const secondSimpleIdx = text.lastIndexOf("simple");
      // The heuristic expands around "simple", so checking exact bounds might be tricky,
      // but we can check if the offset aligns with the second one
      expect(match!.startOffset).toBeCloseTo(secondSimpleIdx, -1); // exact is 26, might gobble space
    });

    it("should resolve ambiguity using suffix", () => {
      const text = "First simple test. Second simple phrase.";
      const selector: TextQuoteSelector = {
        type: "TextQuoteSelector",
        exact: "simple",
        prefix: null,
        suffix: " phrase",
      };

      const match = findBestMatch(text, selector);
      expect(match).not.toBeNull();
      const secondSimpleIdx = text.lastIndexOf("simple");
      expect(match!.startOffset).toBeCloseTo(secondSimpleIdx, -1);
    });

    it("should return null if not found", () => {
      const text = "hello world";
      const selector: TextQuoteSelector = {
        type: "TextQuoteSelector",
        exact: "missing",
        prefix: null,
        suffix: null,
      };

      const match = findBestMatch(text, selector);
      expect(match).toBeNull();
    });

    it("should handle trailing punctuation without over-expanding", () => {
      const text = "Instead of striving for perfection, try to be good enough.";
      const selector: TextQuoteSelector = {
        type: "TextQuoteSelector",
        exact: "striving for perfection",
        prefix: null,
        suffix: null,
      };

      const match = findBestMatch(text, selector);
      expect(match).not.toBeNull();
      const matchedText = text.substring(match!.startOffset, match!.endOffset);

      // The exact match shouldn't eagerly swallow the comma if it's not in the selector
      // unless it's strictly necessary. By default, finding "striving for perfection" exactly
      // should yield exactly that string if the character boundaries align.
      expect(matchedText.trim()).toBe("striving for perfection");
    });
  });
});
