import type { Issue } from '../../domain/evaluation/entity';
import type { HighlightPort } from '../ports/highlight-port';
import type { TextQuoteSelector, Suggestion } from '../../domain/evaluation/entity';
import { resolveSourceIdToUuid } from './block-resolver';

export class EvidenceHighlightService {
    constructor(private highlightPort: HighlightPort) { }

    /**
     * Extracts text selectors from the given issue's evidence and suggestions,
     * resolving source_ids to UUIDs, and coordinates with the HighlightPort
     * to apply the visual highlights.
     */
    public async focusIssue(blockId: string, issue: Issue): Promise<void> {
        const highlightSelectors: Array<{
            selector: TextQuoteSelector;
            source_id?: string | null;
        }> = [];

        // Derive a UUID source for suggestions from the first evidence entry
        const issueRawSourceId = issue.evidence?.[0]?.source_id ?? null;
        const issueResolvedSourceId = await resolveSourceIdToUuid(issueRawSourceId);

        if (issue.evidence) {
            for (const ev of issue.evidence) {
                const resolvedId = await resolveSourceIdToUuid(ev.source_id);
                for (const sel of ev.selectors) {
                    highlightSelectors.push({ selector: sel, source_id: resolvedId });
                }
            }
        }

        if (issue.suggestions) {
            for (const sug of issue.suggestions) {
                if (sug.selector) {
                    highlightSelectors.push({
                        selector: sug.selector,
                        // Suggestions inherit the resolved child block ID from evidence
                        source_id: issueResolvedSourceId,
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
     * Previews a specific suggestion by applying inline DOM modifications.
     * @param blockId The UUID of the block that owns the evaluation.
     * @param suggestion The suggestion to preview.
     * @param rawSourceId Optional raw source_id (e.g. "block:843") of the child block
     *   where the suggestion text actually lives. If provided and resolvable, the child
     *   block UUID will be used for the DOM lookup instead of blockId.
     */
    public async previewSuggestion(blockId: string, suggestion: Suggestion, rawSourceId?: string | null): Promise<void> {
        const resolvedId = await resolveSourceIdToUuid(rawSourceId);
        this.highlightPort.previewSuggestion(resolvedId ?? blockId, suggestion);
    }

    /**
     * Removes all active previews and restores original DOM content
     */
    public clearPreview(): void {
        this.highlightPort.clearPreview();
    }
}
