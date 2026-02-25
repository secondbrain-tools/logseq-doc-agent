<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { slide } from "svelte/transition";
    import type {
        BlockEvaluation,
        CriterionResult,
    } from "../../domain/evaluation/entity";
    import EvaluationScore from "./evaluation/EvaluationScore.svelte";

    let {
        evaluationData,
    }: {
        evaluationData: BlockEvaluation;
    } = $props();

    const dispatch = createEventDispatcher();

    // --- State ---
    let showLowScoresOnly = $state(false);
    let showApplicableOnly = $state(false);
    let searchQuery = $state("");

    // Track expanded state for categories
    let expandedCategories = $state<Record<string, boolean>>({});

    // --- Derived ---
    // Group results by category
    const groupedByCategory = $derived(() => {
        const groups: Record<string, CriterionResult[]> = {};
        for (const res of evaluationData?.results || []) {
            const cat = res.category || "Uncategorized";
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(res);
        }
        return groups;
    });

    // Filter and Sort Categories
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
                        ? c.score <= 2 && c.score > 0
                        : true;
                    const matchesApplicable = showApplicableOnly
                        ? c.score > 0
                        : true;
                    return matchesSearch && matchesScore && matchesApplicable;
                })
                .sort((a, b) => {
                    const aVal = (a.score as number) === 0 ? 99 : a.score;
                    const bVal = (b.score as number) === 0 ? 99 : b.score;
                    return aVal - bVal;
                });

            if (filteredCriteria.length > 0) {
                // Determine category mock average score
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

    function ignoreBlock() {
        dispatch("ignore", { evaluationData });
    }

    // Icons
    const icons = {
        chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
        chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
        reply: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
        ignore: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    };
</script>

{#snippet criterionRow(categoryName: string, criterion: any)}
    {@const uniqueId = categoryName + "-" + criterion.criterion_id}
    <div class="lda-criterion-row">
        <div class="lda-criterion-top">
            <div class="lda-criterion-title">
                {criterion.criterion_id}
            </div>
            <div class="lda-rating-wrapper">
                <EvaluationScore
                    rating={criterion.score}
                    showValue={false}
                    size="sm"
                />
            </div>
        </div>

        <div class="lda-feedback-full" transition:slide|local>
            <p>{criterion.reason}</p>

            {#if criterion.suggestions && criterion.suggestions.length > 0}
                <div class="lda-suggestions mt-2 pt-2 border-t">
                    <strong>Suggestions:</strong>
                    <ul
                        class="lda-suggestions-list list-disc pl-4 text-sm mt-1"
                    >
                        {#each criterion.suggestions as suggestion}
                            <li class="lda-suggestion-item pb-1">
                                {#if suggestion.selector?.exact}
                                    <span
                                        class="lda-suggestion-target italic opacity-75"
                                        >"{suggestion.selector.exact}"</span
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
                </div>
            {/if}

            <div class="lda-feedback-actions mt-2">
                <button
                    class="lda-action-btn"
                    title="Ignore"
                    onclick={ignoreBlock}
                >
                    {@html icons.ignore} Ignore
                </button>
                <button class="lda-action-btn" title="Reply" onclick={() => {}}>
                    {@html icons.reply} Reply
                </button>
            </div>
        </div>
    </div>
{/snippet}

<div class="lda-sidebar">
    <div class="lda-analysis-header">
        <div class="lda-sidebar-title">
            <h3>Analysis Report</h3>
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

        <div class="lda-filters">
            <input
                type="text"
                placeholder="Search criteria..."
                bind:value={searchQuery}
                class="lda-search-input"
            />
            <div class="lda-filter-toggles">
                <label class="lda-toggle">
                    <input type="checkbox" bind:checked={showLowScoresOnly} />
                    <span>Matches ≤ 2</span>
                </label>
                <label class="lda-toggle">
                    <input type="checkbox" bind:checked={showApplicableOnly} />
                    <span>Applicable Only</span>
                </label>
            </div>
        </div>
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
