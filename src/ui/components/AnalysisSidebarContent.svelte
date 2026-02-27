<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { slide } from "svelte/transition";
    import type {
        BlockEvaluation,
        CriterionResult,
    } from "../../domain/evaluation/entity";
    import { Services } from "../../services";
    import EvaluationScore from "./evaluation/EvaluationScore.svelte";

    let {
        evaluationData,
        blockText = undefined,
        blockId = undefined,
    }: {
        evaluationData: BlockEvaluation;
        blockText?: string;
        blockId?: string;
    } = $props();

    // Svelte 5 requires cloning props into local state if we want to mutate them optimistically
    let localEvaluationData = $state(
        structuredClone($state.snapshot(evaluationData)) as BlockEvaluation,
    );

    // Sync if external props change
    $effect(() => {
        localEvaluationData = structuredClone(
            $state.snapshot(evaluationData),
        ) as BlockEvaluation;
    });

    const dispatch = createEventDispatcher();

    // --- State ---
    let showLowScoresOnly = $state(false);
    let searchQuery = $state("");
    let showSearch = $state(false);
    let scoreThreshold = $state(2); // configurable: 1-4

    // Track expanded state for categories
    let expandedCategories = $state<Record<string, boolean>>({});

    // Track which criterion has an active feedback input and what type
    let activeFeedbackInput = $state<
        Record<string, "reply" | "change_proposal" | null>
    >({});
    let feedbackInputText = $state<Record<string, string>>({});

    // --- Derived ---
    const groupedByCategory = $derived(() => {
        const groups: Record<string, CriterionResult[]> = {};
        for (const res of localEvaluationData?.results || []) {
            const cat = res.category || "Uncategorized";
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(res);
        }
        return groups;
    });

    const filteredCategories = $derived(() => {
        const groups = groupedByCategory();
        const result = [];

        for (const [categoryName, criteria] of Object.entries(groups)) {
            const filteredCriteria = criteria
                .filter((c) => {
                    const matchesSearch = c.criterion_id
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase());
                    const matchesScore = showLowScoresOnly
                        ? c.score <= scoreThreshold && c.score > 0
                        : true;
                    return matchesSearch && matchesScore;
                })
                .sort((a, b) => {
                    const aVal = (a.score as number) === 0 ? 99 : a.score;
                    const bVal = (b.score as number) === 0 ? 99 : b.score;
                    return aVal - bVal;
                });

            if (filteredCriteria.length > 0) {
                const sum = filteredCriteria.reduce(
                    (acc, c) => acc + c.score,
                    0,
                );
                const avg =
                    filteredCriteria.length > 0
                        ? Math.round((sum / filteredCriteria.length) * 10) / 10
                        : 0;

                result.push({
                    category: categoryName,
                    criteria: filteredCriteria,
                    avgScore: avg,
                    totalCount: criteria.length,
                    applicableCount: criteria.filter((c) => c.score > 0).length,
                });
            }
        }
        return result;
    });

    // --- Helpers ---
    function getSeverity(
        score: number,
    ): "excellent" | "good" | "warning" | "bad" | "muted" {
        if (score === 0) return "muted";
        if (score > 4) return "excellent";
        if (score > 3) return "good";
        if (score > 2) return "warning";
        return "bad";
    }

    function toggleCategory(categoryName: string) {
        expandedCategories[categoryName] = !expandedCategories[categoryName];
    }

    function openFeedbackInput(
        criterionId: string,
        type: "reply" | "change_proposal",
    ) {
        activeFeedbackInput[criterionId] = type;
        if (!feedbackInputText[criterionId]) {
            feedbackInputText[criterionId] = "";
        }
    }

    function cancelFeedbackInput(criterionId: string) {
        activeFeedbackInput[criterionId] = null;
        feedbackInputText[criterionId] = "";
        activeFeedbackInput = { ...activeFeedbackInput };
    }

    function saveFeedback(
        criterionIdRaw: string,
        issueIdx: number,
        type: "reply" | "change_proposal",
        text: string,
    ) {
        if (!text.trim()) return;

        const newFeedback = {
            type,
            text: text.trim(),
            created_at: new Date().toISOString(),
        };

        if (blockId) {
            Services.instance.evaluationReviewService
                .addFeedback(blockId, criterionIdRaw, newFeedback, issueIdx)
                .catch((err) => console.error("Failed to save feedback:", err));
        }

        // Optimistically update the evaluated block data
        for (const res of localEvaluationData.results) {
            if (
                res.criterion_id === criterionIdRaw &&
                res.issues &&
                res.issues[issueIdx]
            ) {
                const issue = res.issues[issueIdx];
                if (!issue.user_feedback) issue.user_feedback = [];
                issue.user_feedback.push(newFeedback);
                localEvaluationData = { ...localEvaluationData };
                break;
            }
        }
        cancelFeedbackInput(criterionIdRaw);
    }

    function deleteFeedback(
        criterionIdRaw: string,
        issueIdx: number,
        feedbackIdx: number,
    ) {
        if (blockId) {
            Services.instance.evaluationReviewService
                .deleteFeedback(blockId, criterionIdRaw, feedbackIdx, issueIdx)
                .catch((err) =>
                    console.error("Failed to delete feedback:", err),
                );
        }

        for (const res of localEvaluationData.results) {
            if (
                res.criterion_id === criterionIdRaw &&
                res.issues &&
                res.issues[issueIdx]
            ) {
                const issue = res.issues[issueIdx];
                if (issue.user_feedback) {
                    issue.user_feedback.splice(feedbackIdx, 1);
                    localEvaluationData = { ...localEvaluationData };
                }
                break;
            }
        }
    }

    function ignoreBlock() {
        dispatch("ignore", { evaluationData: localEvaluationData });
    }

    // Block text preview (first 50 chars)
    const blockPreview = $derived(() => {
        if (!blockText) return null;
        const clean = blockText.replace(/\[\[|\]\]/g, "").trim();
        return clean.length > 150 ? clean.slice(0, 150) + "…" : clean;
    });

    // Icons
    const icons = {
        chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
        chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
        reply: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
        ignore: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        search: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    };
</script>

{#snippet criterionRow(categoryName: string, criterion: any)}
    {@const uniqueId = categoryName + "-" + criterion.criterion_id}
    <div class="lda-criterion-row">
        <div class="lda-criterion-top">
            <div class="lda-criterion-title">
                {criterion.criterion_id}
            </div>
            <div
                class="lda-rating-wrapper"
                style="display: flex; align-items: center; gap: 6px;"
            >
                {#if criterion.confidence !== undefined}
                    <span
                        class="lda-confidence-badge {criterion.confidence < 60
                            ? 'lda-confidence-low'
                            : ''}"
                        title="AI Confidence Score"
                    >
                        {criterion.confidence}%
                    </span>
                {/if}
                <EvaluationScore
                    rating={criterion.score}
                    showValue={false}
                    size="sm"
                />
            </div>
        </div>

        <div class="lda-feedback-full" transition:slide|local>
            <p>{criterion.reason}</p>

            {#if criterion.issues && criterion.issues.length > 0}
                <div class="lda-issues-container mt-2 pt-2 border-t">
                    <strong>Issues found:</strong>
                    <div
                        class="lda-issues-list mt-2"
                        style="display: flex; flex-direction: column; gap: 12px;"
                    >
                        {#each criterion.issues as issue, issueIdx}
                            {@const issueUniqueId = uniqueId + "-" + issueIdx}
                            <div
                                class="lda-issue-block bg-white dark:bg-gray-800 p-2 rounded border"
                                style="border-color: var(--ls-border-color);"
                            >
                                <div
                                    class="lda-issue-header flex items-center gap-2 mb-1"
                                >
                                    <span class="font-semibold text-sm"
                                        >{issue.description}</span
                                    >
                                    {#if issue.impact && issue.impact !== "low"}
                                        <span
                                            class="lda-impact-tag lda-impact-{issue.impact}"
                                            >{issue.impact}</span
                                        >
                                    {/if}
                                </div>

                                {#if issue.evidence && issue.evidence.length > 0}
                                    <div
                                        class="lda-issue-evidence text-xs opacity-75 mb-2 pl-2 border-l-2 border-gray-300 dark:border-gray-600"
                                    >
                                        {#each issue.evidence as ev}
                                            {#each ev.selectors as selector}
                                                {#if selector.exact}
                                                    <div class="italic">
                                                        "{selector.exact}"
                                                    </div>
                                                {/if}
                                            {/each}
                                        {/each}
                                    </div>
                                {/if}

                                {#if issue.suggestions && issue.suggestions.length > 0}
                                    <div class="lda-issue-suggestions text-xs">
                                        {#if issue.suggestions.length >= 2}
                                            <div
                                                class="lda-alternatives-container mt-1"
                                            >
                                                {#each issue.suggestions as suggestion, i}
                                                    <div
                                                        class="lda-suggestion-card"
                                                    >
                                                        <div
                                                            class="lda-suggestion-card-header"
                                                        >
                                                            <span
                                                                class="lda-suggestion-label"
                                                                >Option {String.fromCharCode(
                                                                    65 + i,
                                                                )}</span
                                                            >
                                                        </div>
                                                        <div
                                                            class="lda-suggestion-card-body"
                                                        >
                                                            {#if suggestion.selector?.exact}
                                                                <span
                                                                    class="lda-suggestion-target italic opacity-75"
                                                                    >"{suggestion
                                                                        .selector
                                                                        .exact}"</span
                                                                > ->
                                                            {/if}
                                                            {#if suggestion.proposed_text}
                                                                <span
                                                                    class="lda-suggestion-proposal bg-blue-100 dark:bg-blue-900 px-1 rounded"
                                                                    >{suggestion.proposed_text}</span
                                                                >
                                                            {/if}
                                                            <div
                                                                class="lda-suggestion-rationale text-xs opacity-75 mt-1"
                                                            >
                                                                {suggestion.rationale}
                                                            </div>
                                                        </div>
                                                    </div>
                                                {/each}
                                            </div>
                                        {:else}
                                            <ul
                                                class="lda-suggestions-list list-disc pl-4 mt-1"
                                            >
                                                {#each issue.suggestions as suggestion}
                                                    <li
                                                        class="lda-suggestion-item pb-1"
                                                    >
                                                        {#if suggestion.selector?.exact}
                                                            <span
                                                                class="lda-suggestion-target italic opacity-75"
                                                                >"{suggestion
                                                                    .selector
                                                                    .exact}"</span
                                                            > ->
                                                        {/if}
                                                        {#if suggestion.proposed_text}
                                                            <span
                                                                class="lda-suggestion-proposal bg-blue-100 dark:bg-blue-900 px-1 rounded"
                                                                >{suggestion.proposed_text}</span
                                                            >
                                                        {/if}
                                                        <div
                                                            class="lda-suggestion-rationale text-xs opacity-75"
                                                        >
                                                            {suggestion.rationale}
                                                        </div>
                                                    </li>
                                                {/each}
                                            </ul>
                                        {/if}
                                    </div>
                                {/if}

                                {#if issue.counterargument}
                                    <div
                                        class="lda-counterargument-block mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                                    >
                                        <div
                                            class="lda-counterargument-header flex items-center gap-2 mb-1"
                                        >
                                            <span
                                                class="font-semibold text-xs text-gray-700 dark:text-gray-300"
                                                >↯ Counterargument</span
                                            >
                                        </div>
                                        <div
                                            class="lda-counterargument-text text-xs italic opacity-90"
                                        >
                                            {issue.counterargument}
                                        </div>
                                    </div>
                                {/if}

                                <!-- Issue-level user feedback -->
                                {#if issue.user_feedback && issue.user_feedback.length > 0}
                                    <div
                                        class="lda-user-feedback mt-2 pt-2 border-t"
                                    >
                                        <div
                                            class="mt-1"
                                            style="display: flex; flex-direction: column; gap: 6px;"
                                        >
                                            {#each issue.user_feedback as feedback, fbIdx}
                                                <div
                                                    class="lda-feedback-item bg-gray-50 p-2 rounded text-xs border"
                                                    style="background-color: var(--ls-secondary-background-color); border-color: var(--ls-border-color);"
                                                >
                                                    <div
                                                        style="display: flex; justify-content: space-between; margin-bottom: 2px;"
                                                    >
                                                        <span
                                                            class="font-semibold text-gray-600 capitalize opacity-80"
                                                            >{feedback.type.replace(
                                                                "_",
                                                                " ",
                                                            )}</span
                                                        >
                                                        <div
                                                            style="display: flex; gap: 8px; align-items: center;"
                                                        >
                                                            <span
                                                                class="opacity-50 text-[10px]"
                                                                >{new Date(
                                                                    feedback.created_at,
                                                                ).toLocaleDateString()}</span
                                                            >
                                                            <button
                                                                class="lda-action-btn-icon opacity-50 hover:opacity-100"
                                                                title="Delete feedback"
                                                                onclick={() =>
                                                                    deleteFeedback(
                                                                        criterion.criterion_id,
                                                                        issueIdx,
                                                                        fbIdx,
                                                                    )}
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div class="text-gray-800">
                                                        {feedback.text}
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}

                                {#if activeFeedbackInput[issueUniqueId]}
                                    <div
                                        class="lda-feedback-input-container mt-2 pt-2 border-t"
                                        transition:slide|local
                                    >
                                        <label
                                            class="block text-xs font-semibold mb-1 opacity-80 capitalize"
                                        >
                                            {activeFeedbackInput[
                                                issueUniqueId
                                            ].replace("_", " ")}
                                        </label>
                                        <textarea
                                            class="lda-feedback-input w-full p-2 text-xs border rounded mb-2 bg-white"
                                            style="border-color: var(--ls-border-color); color: var(--ls-primary-text-color);"
                                            rows="2"
                                            placeholder={activeFeedbackInput[
                                                issueUniqueId
                                            ] === "reply"
                                                ? "Add your reply..."
                                                : "What would you change?"}
                                            bind:value={
                                                feedbackInputText[issueUniqueId]
                                            }
                                        ></textarea>
                                        <div class="flex justify-end gap-2">
                                            <button
                                                class="lda-action-btn"
                                                onclick={() =>
                                                    cancelFeedbackInput(
                                                        issueUniqueId,
                                                    )}>Cancel</button
                                            >
                                            <button
                                                class="lda-action-btn border-blue-500 text-blue-600 bg-blue-50"
                                                onclick={() => {
                                                    saveFeedback(
                                                        criterion.criterion_id,
                                                        issueIdx,
                                                        activeFeedbackInput[
                                                            issueUniqueId
                                                        ]!,
                                                        feedbackInputText[
                                                            issueUniqueId
                                                        ],
                                                    );
                                                    cancelFeedbackInput(
                                                        issueUniqueId,
                                                    );
                                                }}>Save</button
                                            >
                                        </div>
                                    </div>
                                {:else}
                                    <div
                                        class="lda-feedback-actions mt-1"
                                        style="display: flex; gap: 6px;"
                                    >
                                        <button
                                            class="lda-action-btn"
                                            title="Reply"
                                            onclick={() =>
                                                openFeedbackInput(
                                                    issueUniqueId,
                                                    "reply",
                                                )}
                                        >
                                            {@html icons.reply} Reply
                                        </button>
                                        <button
                                            class="lda-action-btn"
                                            title="Propose Change"
                                            onclick={() =>
                                                openFeedbackInput(
                                                    issueUniqueId,
                                                    "change_proposal",
                                                )}
                                        >
                                            ✎ Propose Change
                                        </button>
                                    </div>
                                {/if}
                            </div>
                            <!-- end lda-issue-block -->
                        {/each}
                    </div>
                </div>
            {/if}

            <!-- Criterion-level actions (Ignore) -->
            <div
                class="lda-feedback-actions mt-2"
                style="display: flex; gap: 6px;"
            >
                <button
                    class="lda-action-btn"
                    title="Ignore"
                    onclick={ignoreBlock}
                >
                    {@html icons.ignore} Ignore
                </button>
            </div>
        </div>
    </div>
{/snippet}

<div class="lda-sidebar">
    <div class="lda-analysis-header">
        <!-- Title row: score on right -->
        <div class="lda-sidebar-title">
            <div class="lda-sidebar-title-left">
                {#if blockPreview()}
                    <blockquote class="lda-block-preview">
                        {blockPreview()}
                    </blockquote>
                {/if}
            </div>
            {#if evaluationData && evaluationData.summary}
                <div
                    class="lda-overall-score lda-text-{getSeverity(
                        evaluationData.summary.overall_score || 0,
                    )}"
                >
                    {evaluationData.summary.overall_score}/5
                </div>
            {/if}
        </div>

        <!-- Toolbar row: toggles + search button -->
        <div class="lda-toolbar">
            <div class="lda-filter-toggles">
                <label
                    class="lda-toggle"
                    title="Show only criteria with low scores"
                >
                    <input type="checkbox" bind:checked={showLowScoresOnly} />
                    <span>
                        Score ≤
                        <!-- inline threshold selector -->
                        <select
                            class="lda-threshold-select"
                            bind:value={scoreThreshold}
                            onclick={(e) => e.stopPropagation()}
                        >
                            {#each [1, 2, 3, 4] as n}
                                <option value={n}>{n}</option>
                            {/each}
                        </select>
                    </span>
                </label>
            </div>

            <button
                class="lda-toolbar-btn {showSearch
                    ? 'lda-toolbar-btn--active'
                    : ''}"
                title="Toggle search"
                onclick={() => {
                    showSearch = !showSearch;
                    if (!showSearch) searchQuery = "";
                }}
            >
                {@html icons.search}
            </button>
        </div>

        <!-- Search field: toggleable, slides in below toolbar -->
        {#if showSearch}
            <div class="lda-search-row" transition:slide>
                <input
                    type="text"
                    placeholder="Search criteria…"
                    bind:value={searchQuery}
                    class="lda-search-input"
                />
            </div>
        {/if}
    </div>

    <div class="lda-sidebar-scroll">
        {#if filteredCategories().length === 0}
            <div class="lda-empty-state">No matching criteria found.</div>
        {:else if filteredCategories().length === 1}
            {@const category = filteredCategories()[0]}

            {#each category.criteria as criterion (criterion.criterion_id)}
                {@render criterionRow(category.category, criterion)}
            {/each}
        {:else}
            {#each filteredCategories() as category (category.category)}
                <div class="lda-accordion-item">
                    <button
                        class="lda-accordion-header"
                        onclick={() => toggleCategory(category.category)}
                    >
                        <div class="lda-accordion-title-row">
                            <span class="lda-accordion-icon">
                                {@html expandedCategories[category.category]
                                    ? icons.chevronDown
                                    : icons.chevronRight}
                            </span>
                            <span class="lda-category-name"
                                >{category.category}</span
                            >
                            <EvaluationScore
                                rating={category.avgScore}
                                showValue={true}
                                size="sm"
                            />
                            <span class="lda-category-count">
                                ({category.applicableCount}/{category.totalCount})
                            </span>
                        </div>
                    </button>

                    {#if expandedCategories[category.category]}
                        <div
                            class="lda-accordion-content-panel"
                            transition:slide|local
                        >
                            {#each category.criteria as criterion (criterion.criterion_id)}
                                {@render criterionRow(
                                    category.category,
                                    criterion,
                                )}
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        {/if}
    </div>
</div>
