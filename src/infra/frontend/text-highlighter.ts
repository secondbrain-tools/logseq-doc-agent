import type { TextQuoteSelector, Suggestion } from '../../domain/evaluation/entity';
import type { HighlightPort } from '../../application/ports/highlight-port';
import { findBestMatch } from './text-highlight-matcher';
import * as Diff from 'diff';
import { computeUnifiedParts } from '../../ui/components/merge/diff-utils';

const LOG_PREFIX = '[TextHighlighter]';
type TextNodeMapping = { node: Text, startInPlain: number, endInPlain: number };
type HighlightRange = { node: Text, startOffset: number, endOffset: number };
type MatchInTextNodes = { textNodes: TextNodeMapping[], startOffset: number, endOffset: number };

export class TextHighlighter implements HighlightPort {
    private activeHighlights: HTMLElement[] = [];
    private activePreviewElements: HTMLElement[] = [];

    /**
     * Gets the main document (parent if in iframe, else current)
     */
    private getDocument(): Document {
        return window.parent?.document || window.top?.document || document;
    }

    /**
     * Finds the DOM element for a given block ID
     */
    private getBlockElement(blockId: string): HTMLElement | null {
        const doc = this.getDocument();
        const el = doc.querySelector(`div[blockid="${blockId}"]`);
        console.log(`${LOG_PREFIX} getBlockElement("${blockId}") =>`, el ? 'found' : 'NOT FOUND');
        return el as HTMLElement | null;
    }

    /**
     * Resolves a source_id to a concrete UUID.
     * If source_id is null/undefined, returns the fallback (parent) blockId.
     */
    private resolveTargetBlockId(fallbackBlockId: string, sourceId?: string | null): string {
        const resolved = sourceId || fallbackBlockId;
        console.log(`${LOG_PREFIX} resolveTargetBlockId(fallback="${fallbackBlockId}", sourceId=${sourceId}) => "${resolved}"`);
        return resolved;
    }

    /**
     * Gets all text-bearing containers within a block element.
     * Logseq splits block content across multiple containers:
     * - `.block-content-inner` contains the first line
     * - `.block-body` contains multi-line continuation content
     * We search across all of them by collecting text from the block-content div itself,
     * excluding property elements and child block containers.
     */
    private getTextContainers(blockEl: HTMLElement): HTMLElement[] {
        const containers: HTMLElement[] = [];

        // Primary: .block-content-inner (first line of content)
        const contentInner = blockEl.querySelector('.block-content-inner');
        if (contentInner) containers.push(contentInner as HTMLElement);

        // Secondary: .block-body (multi-line content)
        const blockBody = blockEl.querySelector('.block-body');
        if (blockBody) containers.push(blockBody as HTMLElement);

        console.log(`${LOG_PREFIX} getTextContainers => found ${containers.length} container(s): [${containers.map(c => c.className).join(', ')}]`);
        return containers;
    }

    /**
     * Collects text nodes and builds a plain-text map across one or more containers.
     */
    private collectTextNodes(doc: Document, containers: Iterable<HTMLElement>): { textNodes: TextNodeMapping[], plainText: string } {
        const textNodes: TextNodeMapping[] = [];
        let plainText = '';

        for (const container of containers) {
            const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
            let currentNode = walker.nextNode();

            while (currentNode) {
                const content = currentNode.textContent || '';
                const start = plainText.length;
                plainText += content;
                textNodes.push({ node: currentNode as Text, startInPlain: start, endInPlain: plainText.length });
                currentNode = walker.nextNode();
            }
        }

        return { textNodes, plainText };
    }

    /**
     * Maps a plain-text match back to the affected text node ranges.
     */
    private getHighlightRanges(
        textNodes: TextNodeMapping[],
        startOffset: number,
        endOffset: number
    ): HighlightRange[] {
        const rangesToHighlight: HighlightRange[] = [];
        let currentMatchOffset = startOffset;

        for (const tn of textNodes) {
            if (currentMatchOffset >= endOffset) break;

            if (tn.endInPlain > currentMatchOffset) {
                const nodeStartOffset = Math.max(0, currentMatchOffset - tn.startInPlain);
                const matchEndInNode = Math.min(endOffset, tn.endInPlain);
                const nodeEndOffset = matchEndInNode - tn.startInPlain;

                if (nodeEndOffset > nodeStartOffset) {
                    rangesToHighlight.push({
                        node: tn.node,
                        startOffset: nodeStartOffset,
                        endOffset: nodeEndOffset
                    });
                }
                currentMatchOffset = matchEndInNode;
            }
        }

        return rangesToHighlight;
    }

    /**
     * Highlights text ranges in the specified block based on the selectors.
     * Handles multiple selectors, and child block references.
     */
    public highlight(parentBlockId: string, selectors: Array<{ selector: TextQuoteSelector, source_id?: string | null }>): void {
        console.log(`${LOG_PREFIX} highlight() called with parentBlockId="${parentBlockId}", ${selectors.length} selector(s)`);
        this.clearHighlights();

        const doc = this.getDocument();
        let scrollTarget: HTMLElement | null = null;

        for (const { selector, source_id } of selectors) {
            console.log(`${LOG_PREFIX} Processing selector: exact="${selector.exact}", prefix="${selector.prefix}", suffix="${selector.suffix}", source_id=${source_id}`);

            const targetBlockId = this.resolveTargetBlockId(parentBlockId, source_id);
            const blockEl = this.getBlockElement(targetBlockId);

            // If the block element doesn't exist (e.g. collapsed or virtualized out of view), we skip gracefully
            if (!blockEl) {
                console.warn(`${LOG_PREFIX} Block element not found for id="${targetBlockId}", skipping.`);
                continue;
            }

            const containers = this.getTextContainers(blockEl);
            if (containers.length === 0) {
                console.warn(`${LOG_PREFIX} No text containers found in block "${targetBlockId}", skipping.`);
                continue;
            }

            // Try each container until we find a match
            let matched = false;
            for (const container of containers) {
                const newHighlights = this.highlightSelectorInContainer(doc, container, selector);
                if (newHighlights.length > 0) {
                    this.activeHighlights.push(...newHighlights);
                    if (!scrollTarget) {
                        scrollTarget = newHighlights[0];
                    }
                    matched = true;
                    break; // Found in this container, no need to check others for this selector
                }
            }

            if (!matched) {
                // If no match in individual containers, try combining all containers' text
                console.log(`${LOG_PREFIX} No match in individual containers, trying combined text search...`);
                const combinedHighlights = this.highlightSelectorAcrossContainers(doc, containers, selector);
                if (combinedHighlights.length > 0) {
                    this.activeHighlights.push(...combinedHighlights);
                    if (!scrollTarget) {
                        scrollTarget = combinedHighlights[0];
                    }
                } else {
                    console.warn(`${LOG_PREFIX} No match found for selector exact="${selector.exact}" in any container of block "${targetBlockId}"`);
                }
            }
        }

        if (scrollTarget && scrollTarget.scrollIntoView) {
            scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        console.log(`${LOG_PREFIX} highlight() complete. ${this.activeHighlights.length} highlight(s) applied.`);
    }

    /**
     * Searches across multiple containers by combining their text content
     */
    private highlightSelectorAcrossContainers(doc: Document, containers: HTMLElement[], selector: TextQuoteSelector): HTMLElement[] {
        const { textNodes, plainText } = this.collectTextNodes(doc, containers);

        console.log(`${LOG_PREFIX} Combined text (${plainText.length} chars): "${plainText.substring(0, 200)}${plainText.length > 200 ? '...' : ''}"`);

        const match = findBestMatch(plainText, selector);
        if (!match) {
            console.log(`${LOG_PREFIX} findBestMatch returned null for combined text`);
            return [];
        }

        console.log(`${LOG_PREFIX} Combined match found at [${match.startOffset}, ${match.endOffset}]: "${plainText.substring(match.startOffset, match.endOffset)}"`);
        return this.applyHighlightRanges(doc, textNodes, match.startOffset, match.endOffset);
    }

    /**
     * Finds text nodes in a container and applies the highlight
     */
    private highlightSelectorInContainer(doc: Document, container: HTMLElement, selector: TextQuoteSelector): HTMLElement[] {
        const { textNodes, plainText } = this.collectTextNodes(doc, [container]);

        console.log(`${LOG_PREFIX} Container "${container.className}" text (${plainText.length} chars): "${plainText.substring(0, 200)}${plainText.length > 200 ? '...' : ''}"`);

        const match = findBestMatch(plainText, selector);
        if (!match) {
            console.log(`${LOG_PREFIX} findBestMatch returned null for container "${container.className}"`);
            return [];
        }

        console.log(`${LOG_PREFIX} Match found at [${match.startOffset}, ${match.endOffset}] in "${container.className}": "${plainText.substring(match.startOffset, match.endOffset)}"`);
        return this.applyHighlightRanges(doc, textNodes, match.startOffset, match.endOffset);
    }

    /**
     * Given text nodes and a match range, wraps the matched text in <mark> elements
     */
    private applyHighlightRanges(
        doc: Document,
        textNodes: TextNodeMapping[],
        startOffset: number,
        endOffset: number
    ): HTMLElement[] {
        const highlightsCreated: HTMLElement[] = [];
        const rangesToHighlight = this.getHighlightRanges(textNodes, startOffset, endOffset);

        // Apply highlights backwards so we don't invalidate earlier node references
        for (let i = rangesToHighlight.length - 1; i >= 0; i--) {
            const r = rangesToHighlight[i];
            try {
                const range = doc.createRange();
                range.setStart(r.node, r.startOffset);
                range.setEnd(r.node, r.endOffset);

                const mark = doc.createElement('mark');
                mark.className = 'lda-highlight';
                range.surroundContents(mark);
                highlightsCreated.push(mark);
            } catch (e) {
                console.warn(`${LOG_PREFIX} Failed to apply highlight range`, e);
            }
        }

        return highlightsCreated.reverse(); // Return in document order
    }

    /**
     * Removes all active highlights
     */
    public clearHighlights(): void {
        if (this.activeHighlights.length > 0) {
            console.log(`${LOG_PREFIX} clearHighlights() removing ${this.activeHighlights.length} highlight(s)`);
        }
        for (const highlight of this.activeHighlights) {
            if (highlight.parentNode) {
                const parent = highlight.parentNode;
                while (highlight.firstChild) {
                    parent.insertBefore(highlight.firstChild, highlight);
                }
                parent.removeChild(highlight);
            }
        }
        this.activeHighlights = [];
    }

    /**
     * Finds text nodes and offset range for a selector across the given containers
     * using the same fallback logic as highlighting.
     */
    private findMatchInContainers(doc: Document, containers: HTMLElement[], selector: TextQuoteSelector): MatchInTextNodes | null {
        // Try each container individual first
        for (const container of containers) {
            const { textNodes, plainText } = this.collectTextNodes(doc, [container]);

            const match = findBestMatch(plainText, selector);
            if (match) {
                return { textNodes, startOffset: match.startOffset, endOffset: match.endOffset };
            }
        }

        // Fallback: cross-container matching
        const { textNodes: combinedTextNodes, plainText: combinedPlainText } = this.collectTextNodes(doc, containers);

        const match = findBestMatch(combinedPlainText, selector);
        if (match) {
            return { textNodes: combinedTextNodes, startOffset: match.startOffset, endOffset: match.endOffset };
        }

        return null;
    }

    private buildReplacementPreviewWrapper(doc: Document, originalText: string, proposedText: string): HTMLElement {
        const wordDiff = Diff.diffWords(originalText, proposedText);
        const unifiedParts = computeUnifiedParts(wordDiff, 0);

        const wrapper = doc.createElement('span');
        wrapper.setAttribute('data-lda-preview-wrapper', 'true');
        wrapper.className = 'lda-highlight-preview';

        for (const part of unifiedParts) {
            if (part.type === 'replacement') {
                const container = doc.createElement('span');
                container.className = 'unified-replacement lda-highlight-preview';

                const addedSpan = doc.createElement('span');
                addedSpan.className = 'unified-added';
                addedSpan.textContent = part.addedText || '';

                const removedSpan = doc.createElement('span');
                removedSpan.className = 'unified-removed';
                removedSpan.textContent = part.removedText || '';

                container.appendChild(addedSpan);
                container.appendChild(removedSpan);
                wrapper.appendChild(container);
            } else {
                const span = doc.createElement('span');
                span.textContent = part.text || '';

                if (part.type === 'added') {
                    span.className = 'unified-added lda-highlight-preview';
                } else if (part.type === 'removed') {
                    span.className = 'unified-removed lda-highlight-preview';
                }

                wrapper.appendChild(span);
            }
        }

        return wrapper;
    }

    private applyReplacementPreview(doc: Document, rangesToHighlight: HighlightRange[], proposedText: string): HTMLElement | null {
        const originalText = rangesToHighlight.map(r =>
            r.node.textContent?.substring(r.startOffset, r.endOffset) || ''
        ).join('');
        const wrapper = this.buildReplacementPreviewWrapper(doc, originalText, proposedText);

        try {
            const fullRange = doc.createRange();
            const first = rangesToHighlight[0];
            const last = rangesToHighlight[rangesToHighlight.length - 1];
            fullRange.setStart(first.node, first.startOffset);
            fullRange.setEnd(last.node, last.endOffset);

            fullRange.deleteContents();
            fullRange.insertNode(wrapper);

            this.activePreviewElements.push(wrapper);
            return wrapper;
        } catch (e) {
            console.warn(`${LOG_PREFIX} Failed to apply stacked preview`, e);
            return null;
        }
    }

    private applySimplePreview(
        doc: Document,
        rangesToHighlight: HighlightRange[],
        op: Suggestion['op'],
        proposedText: string | null
    ): HTMLElement | null {
        let nodeToScrollTo: HTMLElement | null = null;

        for (let i = rangesToHighlight.length - 1; i >= 0; i--) {
            const r = rangesToHighlight[i];

            try {
                const range = doc.createRange();
                range.setStart(r.node, r.startOffset);
                range.setEnd(r.node, r.endOffset);

                if (op === 'delete') {
                    const deleteMark = doc.createElement('mark');
                    deleteMark.className = 'lda-highlight lda-highlight-preview lda-preview-delete';
                    range.surroundContents(deleteMark);
                    this.activePreviewElements.push(deleteMark);
                    if (!nodeToScrollTo) nodeToScrollTo = deleteMark;
                } else if (op === 'insert_before') {
                    if (i === 0 && proposedText) {
                        const insertMark = doc.createElement('mark');
                        insertMark.className = 'lda-highlight lda-highlight-preview lda-preview-insert';
                        insertMark.textContent = proposedText;
                        range.insertNode(insertMark);
                        this.activePreviewElements.push(insertMark);
                        if (!nodeToScrollTo) nodeToScrollTo = insertMark;
                    }
                } else if (op === 'insert_after') {
                    if (i === rangesToHighlight.length - 1 && proposedText) {
                        const endRange = doc.createRange();
                        endRange.setStart(r.node, r.endOffset);
                        endRange.setEnd(r.node, r.endOffset);

                        const insertMark = doc.createElement('mark');
                        insertMark.className = 'lda-highlight lda-highlight-preview lda-preview-insert';
                        insertMark.textContent = proposedText;
                        endRange.insertNode(insertMark);
                        this.activePreviewElements.push(insertMark);
                        if (!nodeToScrollTo) nodeToScrollTo = insertMark;
                    }
                }
            } catch (e) {
                console.warn(`${LOG_PREFIX} Failed to apply suggestion preview`, e);
            }
        }

        return nodeToScrollTo;
    }

    /**
     * Previews a suggestion by modifying the DOM inline.
     * For replace/rewrite_span operations, uses word-level diff with stacked rendering.
     */
    public previewSuggestion(blockId: string, suggestion: Suggestion): void {
        this.clearPreview();

        if (!suggestion.selector) {
            console.warn(`${LOG_PREFIX} Cannot preview suggestion without a selector.`);
            return;
        }

        const doc = this.getDocument();
        const blockEl = this.getBlockElement(blockId);

        if (!blockEl) return;

        const containers = this.getTextContainers(blockEl);
        if (containers.length === 0) return;

        const matchData = this.findMatchInContainers(doc, containers, suggestion.selector);
        if (!matchData) {
            console.warn(`${LOG_PREFIX} Could not find text match for suggestion preview.`);
            return;
        }

        const { textNodes, startOffset: matchStartOffset, endOffset: matchEndOffset } = matchData;

        const rangesToHighlight = this.getHighlightRanges(textNodes, matchStartOffset, matchEndOffset);
        if (rangesToHighlight.length === 0) {
            console.warn(`${LOG_PREFIX} Could not map suggestion match back to DOM ranges.`);
            return;
        }

        const { op, proposed_text } = suggestion;
        let nodeToScrollTo: HTMLElement | null = null;

        // For replace/rewrite_span: use stacked word-level diff
        if ((op === 'replace' || op === 'rewrite_span') && proposed_text) {
            nodeToScrollTo = this.applyReplacementPreview(doc, rangesToHighlight, proposed_text);
        } else {
            nodeToScrollTo = this.applySimplePreview(doc, rangesToHighlight, op, proposed_text);
        }

        if (nodeToScrollTo && nodeToScrollTo.scrollIntoView) {
            nodeToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    /**
     * Removes active previews and restores original text.
     */
    public clearPreview(): void {
        for (const el of this.activePreviewElements) {
            if (!el.parentNode) continue;

            if (el.hasAttribute('data-lda-preview-wrapper')) {
                // Stacked word-diff wrapper: reconstruct original text from 
                // common text + unified-removed parts (which hold original words)
                let originalText = '';
                for (const child of Array.from(el.children)) {
                    const span = child as HTMLElement;
                    if (span.classList.contains('unified-replacement')) {
                        // The removed text is the original
                        const removedSpan = span.querySelector('.unified-removed');
                        originalText += removedSpan?.textContent || '';
                    } else if (span.classList.contains('unified-removed')) {
                        // Pure removal (text that was in original but not in proposed)
                        originalText += span.textContent || '';
                    } else if (!span.classList.contains('unified-added')) {
                        // Common text
                        originalText += span.textContent || '';
                    }
                    // unified-added without replacement container: skip (was purely added)
                }
                const textNode = el.ownerDocument.createTextNode(originalText);
                el.parentNode.replaceChild(textNode, el);
            } else if (el.classList.contains('lda-preview-insert')) {
                // Purely inserted element — remove entirely
                el.parentNode.removeChild(el);
            } else {
                // Wrapped element (delete target) — unwrap it
                const parent = el.parentNode;
                while (el.firstChild) {
                    parent.insertBefore(el.firstChild, el);
                }
                parent.removeChild(el);
            }
        }
        this.activePreviewElements = [];
    }
}

export const textHighlighter = new TextHighlighter();
