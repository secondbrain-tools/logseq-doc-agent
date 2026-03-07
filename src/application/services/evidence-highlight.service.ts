import type { Issue } from '../../domain/evaluation/entity';
import type { HighlightPort } from '../ports/highlight-port';
import type { TextQuoteSelector, Suggestion } from '../../domain/evaluation/entity';

export class EvidenceHighlightService {
    constructor(private highlightPort: HighlightPort) { }

    /**
     * Extracts text selectors from the given issue's evidence and suggestions,
     * resolving any specific source IDs, and then coordinates with the HighlightPort
     * to apply the visual highlights.
     */
    public focusIssue(blockId: string, issue: Issue): void {
        const highlightSelectors: Array<{
            selector: TextQuoteSelector;
            source_id?: string | null;
        }> = [];

        if (issue.evidence) {
            for (const ev of issue.evidence) {
                for (const sel of ev.selectors) {
                    highlightSelectors.push({ selector: sel, source_id: ev.source_id });
                }
            }
        }

        if (issue.suggestions) {
            for (const sug of issue.suggestions) {
                if (sug.selector) {
                    highlightSelectors.push({
                        selector: sug.selector,
                        source_id: null,
                    });
                }
            }
        }

        if (highlightSelectors.length > 0) {
            this.highlightPort.highlight(blockId, highlightSelectors);
        } else {
            this.highlightPort.clearHighlights();
        }
    }

    /**
     * Clears any active issue focus and removes all highlights.
     */
    public clearFocus(): void {
        this.highlightPort.clearHighlights();
    }

    /**
     * Previews a specific suggestion by applying inline DOM modifications
     */
    public previewSuggestion(blockId: string, suggestion: Suggestion): void {
        this.highlightPort.previewSuggestion(blockId, suggestion);
    }

    /**
     * Removes all active previews and restores original DOM content
     */
    public clearPreview(): void {
        this.highlightPort.clearPreview();
    }
}
