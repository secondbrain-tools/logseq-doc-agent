import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextHighlighter } from './text-highlighter';
import type { Suggestion, TextQuoteSelector } from '../../domain/evaluation/entity';

function createSelector(exact: string): TextQuoteSelector {
    return {
        type: 'TextQuoteSelector',
        exact,
        prefix: null,
        suffix: null
    };
}

function normalizedText(element: Element): string {
    return element.textContent?.replace(/\s+/g, ' ').trim() || '';
}

describe('TextHighlighter', () => {
    let highlighter: TextHighlighter;

    beforeEach(() => {
        document.body.innerHTML = '';
        vi.stubGlobal('parent', window);
        vi.stubGlobal('top', window);
        highlighter = new TextHighlighter();
    });

    afterEach(() => {
        highlighter.clearPreview();
        highlighter.clearHighlights();
        vi.restoreAllMocks();
    });

    it('highlights matches that span multiple block containers and restores cleanly', () => {
        document.body.innerHTML = `
            <div blockid="block-1">
                <div class="block-content-inner">Hello </div>
                <div class="block-body">world!</div>
            </div>
        `;

        highlighter.highlight('block-1', [{ selector: createSelector('Hello world') }]);

        const block = document.querySelector('div[blockid="block-1"]') as HTMLElement;
        const marks = block.querySelectorAll('mark.lda-highlight');
        expect(marks).toHaveLength(2);
        expect(normalizedText(block)).toBe('Hello world!');

        highlighter.clearHighlights();

        expect(block.querySelectorAll('mark.lda-highlight')).toHaveLength(0);
        expect(normalizedText(block)).toBe('Hello world!');
    });

    it('previews replacement suggestions across multiple text nodes and restores original text', () => {
        document.body.innerHTML = `
            <div blockid="block-2">
                <div class="block-content-inner"><span>Alpha </span><strong>beta</strong></div>
            </div>
        `;

        const suggestion: Suggestion = {
            op: 'replace',
            selector: createSelector('Alpha beta'),
            proposed_text: 'Gamma delta',
            rationale: 'Rewrite the phrase',
            status: 'pending'
        };

        highlighter.previewSuggestion('block-2', suggestion);

        const block = document.querySelector('div[blockid="block-2"]') as HTMLElement;
        const wrapper = block.querySelector('[data-lda-preview-wrapper="true"]');
        expect(wrapper).not.toBeNull();

        highlighter.clearPreview();

        expect(block.querySelector('[data-lda-preview-wrapper="true"]')).toBeNull();
        expect(normalizedText(block)).toBe('Alpha beta');
    });

    it('removes inserted preview elements on clearPreview', () => {
        document.body.innerHTML = `
            <div blockid="block-3">
                <div class="block-content-inner">target text</div>
            </div>
        `;

        const suggestion: Suggestion = {
            op: 'insert_after',
            selector: createSelector('target'),
            proposed_text: ' added',
            rationale: 'Append text',
            status: 'pending'
        };

        highlighter.previewSuggestion('block-3', suggestion);

        const block = document.querySelector('div[blockid="block-3"]') as HTMLElement;
        expect(block.querySelectorAll('.lda-preview-insert')).toHaveLength(1);

        highlighter.clearPreview();

        expect(block.querySelectorAll('.lda-preview-insert')).toHaveLength(0);
        expect(normalizedText(block)).toBe('target text');
    });
});
