import type { Issue } from '../../domain/evaluation/entity';
import type { HighlightPort } from '../ports/highlight-port';
import type { TextQuoteSelector, Suggestion } from '../../domain/evaluation/entity';
import { resolveSourceIdToUuid } from './block-resolver';

const LOG_PREFIX = '[EvidenceHighlightService]';

export class EvidenceHighlightService {
    private focusGeneration = 0;

    constructor(private highlightPort: HighlightPort) { }

    /**
     * Extracts text selectors from the given issue's evidence and suggestions,
     * resolving source_ids to UUIDs, and coordinates with the HighlightPort
     * to apply the visual highlights.
     *
     * Uses a generation counter so that if a newer `focusIssue` call starts
     * before this one finishes, the stale call bails out without touching the DOM.
     */
    public async focusIssue(blockId: string, issue: Issue): Promise<void> {
        const gen = ++this.focusGeneration;
        console.log(`${LOG_PREFIX} focusIssue() gen=${gen} blockId="${blockId}"`);

        const highlightSelectors: Array<{
            selector: TextQuoteSelector;
            source_id?: string | null;
        }> = [];

        // Collect all unique raw source_ids and resolve them in one pass
        const rawIds = new Set<string>();
        if (issue.evidence) {
            for (const ev of issue.evidence) {
                if (ev.source_id) rawIds.add(ev.source_id);
            }
        }

        const resolvedMap = new Map<string, string | null>();
        for (const rawId of rawIds) {
            if (gen !== this.focusGeneration) {
                console.log(`${LOG_PREFIX} focusIssue() gen=${gen} cancelled (now gen=${this.focusGeneration})`);
                return;
            }
            resolvedMap.set(rawId, await resolveSourceIdToUuid(rawId));
        }

        // Bail out if a newer call has started while we were resolving
        if (gen !== this.focusGeneration) {
            console.log(`${LOG_PREFIX} focusIssue() gen=${gen} cancelled after resolution (now gen=${this.focusGeneration})`);
            return;
        }

        // Derive a single resolved source for suggestions from the first evidence entry
        const issueRawSourceId = issue.evidence?.[0]?.source_id ?? null;
        const issueResolvedSourceId = issueRawSourceId ? (resolvedMap.get(issueRawSourceId) ?? null) : null;

        console.log(`${LOG_PREFIX} gen=${gen} issueRawSourceId="${issueRawSourceId}" => resolved="${issueResolvedSourceId}"`);

        if (issue.evidence) {
            for (const ev of issue.evidence) {
                const resolvedId = ev.source_id ? (resolvedMap.get(ev.source_id) ?? null) : null;
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
                        source_id: issueResolvedSourceId,
                    });
                }
            }
        }

        console.log(`${LOG_PREFIX} gen=${gen} applying ${highlightSelectors.length} selector(s)`);

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
        ++this.focusGeneration;
        this.highlightPort.clearHighlights();
    }

    /**
     * Previews a specific suggestion by applying inline DOM modifications.
     * @param blockId The UUID of the block that owns the evaluation.
     * @param suggestion The suggestion to preview.
     * @param rawSourceId Optional raw source_id (e.g. "block:843") of the child block
     *   where the suggestion text actually lives.
     */
    public async previewSuggestion(blockId: string, suggestion: Suggestion, rawSourceId?: string | null): Promise<void> {
        console.log(`${LOG_PREFIX} previewSuggestion() blockId="${blockId}" rawSourceId="${rawSourceId}" exact="${suggestion.selector?.exact}"`);
        const resolvedId = await resolveSourceIdToUuid(rawSourceId);
        const targetId = resolvedId ?? blockId;
        console.log(`${LOG_PREFIX} previewSuggestion() resolved target="${targetId}"`);
        this.highlightPort.previewSuggestion(targetId, suggestion);
    }

    /**
     * Removes all active previews and restores original DOM content
     */
    public clearPreview(): void {
        this.highlightPort.clearPreview();
    }
}
