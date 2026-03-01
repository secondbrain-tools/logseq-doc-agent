import type { TextQuoteSelector } from '../../domain/evaluation/entity';
import type { HighlightPort } from '../../application/ports/highlight-port';
import { findBestMatch } from './text-highlight-matcher';

const LOG_PREFIX = '[TextHighlighter]';

export class TextHighlighter implements HighlightPort {
    private activeHighlights: HTMLElement[] = [];

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
        // Build a combined plain-text and text node map across all containers
        const textNodes: { node: Text, startInPlain: number, endInPlain: number }[] = [];
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
        // Build a plain text representation and a map of characters to text nodes + offsets
        const textNodes: { node: Text, startInPlain: number, endInPlain: number }[] = [];
        let plainText = '';

        const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        let currentNode = walker.nextNode();

        while (currentNode) {
            const content = currentNode.textContent || '';
            const start = plainText.length;
            plainText += content;
            textNodes.push({ node: currentNode as Text, startInPlain: start, endInPlain: plainText.length });
            currentNode = walker.nextNode();
        }

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
        textNodes: { node: Text, startInPlain: number, endInPlain: number }[],
        startOffset: number,
        endOffset: number
    ): HTMLElement[] {
        const highlightsCreated: HTMLElement[] = [];
        const rangesToHighlight: { node: Text, startOffset: number, endOffset: number }[] = [];

        let currentMatchOffset = startOffset;

        for (const tn of textNodes) {
            // If we've passed the end of the match, we're done
            if (currentMatchOffset >= endOffset) break;

            // If this node contains part of the match
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
}

export const textHighlighter = new TextHighlighter();
