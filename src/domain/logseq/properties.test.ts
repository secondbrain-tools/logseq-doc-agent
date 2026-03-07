import { describe, it, expect } from 'vitest';
import { filterPropertyLinesFromContent } from './properties';

describe('filterPropertyLinesFromContent', () => {
    it('keeps regular content lines unchanged', () => {
        const content = 'Line 1\nLine 2\nLine 3';
        expect(filterPropertyLinesFromContent(content)).toBe('Line 1\nLine 2\nLine 3');
    });

    it('removes logseq-doc-agent.evaluation property lines', () => {
        const content = 'Title\nlogseq-doc-agent.evaluation:: {"score":5}\nBody text';
        expect(filterPropertyLinesFromContent(content)).toBe('Title\nBody text');
    });

    it('removes logseq-doc-agent.merge property lines', () => {
        const content = 'Title\nlogseq-doc-agent.merge:: {"base":"old"}\nBody text';
        expect(filterPropertyLinesFromContent(content)).toBe('Title\nBody text');
    });

    it('keeps logseq-doc-agent.prompt property lines (not in filtered list)', () => {
        const content = 'Title\nlogseq-doc-agent.prompt:: My Prompt\nBody text';
        expect(filterPropertyLinesFromContent(content)).toBe('Title\nlogseq-doc-agent.prompt:: My Prompt\nBody text');
    });

    it('keeps arbitrary property lines not in the filtered list', () => {
        const content = 'Title\nsome-prop:: value\nanother:: thing';
        expect(filterPropertyLinesFromContent(content)).toBe('Title\nsome-prop:: value\nanother:: thing');
    });

    it('keeps inline backtick-wrapped lines even if they look like a filtered property', () => {
        const content = '## [Prompt Name]\n`logseq-doc-agent.evaluation:: something`\nPlease evaluate.';
        expect(filterPropertyLinesFromContent(content)).toBe(
            '## [Prompt Name]\n`logseq-doc-agent.evaluation:: something`\nPlease evaluate.'
        );
    });

    it('keeps inline backtick-wrapped lines for non-filtered properties', () => {
        const content = '## [Prompt Name]\n`logseq-doc-agent.prompt:: [Prompt Name]`\nPlease evaluate.';
        expect(filterPropertyLinesFromContent(content)).toBe(
            '## [Prompt Name]\n`logseq-doc-agent.prompt:: [Prompt Name]`\nPlease evaluate.'
        );
    });

    it('keeps lines inside fenced code blocks even if they match filtered properties', () => {
        const content = 'Before\n```\nlogseq-doc-agent.evaluation:: value\nlogseq-doc-agent.merge:: value\n```\nAfter';
        expect(filterPropertyLinesFromContent(content)).toBe(
            'Before\n```\nlogseq-doc-agent.evaluation:: value\nlogseq-doc-agent.merge:: value\n```\nAfter'
        );
    });

    it('correctly toggles fenced block state (multiple fences)', () => {
        const content = '```\ncode1\n```\nlogseq-doc-agent.evaluation:: removed\n```\ncode2\n```';
        expect(filterPropertyLinesFromContent(content)).toBe(
            '```\ncode1\n```\n```\ncode2\n```'
        );
    });

    it('handles empty content', () => {
        expect(filterPropertyLinesFromContent('')).toBe('');
    });

    it('strips a realistic prompt block: keeps commented-out property and body', () => {
        const content = [
            '## My Prompt',
            '`logseq-doc-agent.prompt:: My Prompt` [remove backticks to activate]',
            'Please evaluate the current page.',
        ].join('\n');

        expect(filterPropertyLinesFromContent(content)).toBe(content);
    });

    it('strips evaluation property but keeps the rest in a realistic prompt', () => {
        const content = [
            '## My Prompt',
            'logseq-doc-agent.prompt:: My Prompt',
            'logseq-doc-agent.evaluation:: {"score":3}',
            'Please evaluate the current page.',
        ].join('\n');

        expect(filterPropertyLinesFromContent(content)).toBe(
            '## My Prompt\nlogseq-doc-agent.prompt:: My Prompt\nPlease evaluate the current page.'
        );
    });
});
