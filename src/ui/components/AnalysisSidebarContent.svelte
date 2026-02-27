<script lang="ts">
    import { slide } from "svelte/transition";
    import type { BlockEvaluation } from "../../domain/evaluation/entity";
    import EvaluationScore from "./evaluation/EvaluationScore.svelte";
    import EvaluationCriterionBlock from "./evaluation/EvaluationCriterionBlock.svelte";
    import {
        groupByCategory,
        getSeverity,
        genericClick,
    } from "./evaluation/evaluation-review-logic";
    import { ICONS } from "../icons";

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
        JSON.parse(
            JSON.stringify($state.snapshot(evaluationData)),
        ) as BlockEvaluation,
    );

    // Sync if external props change
    $effect(() => {
        localEvaluationData = JSON.parse(
            JSON.stringify($state.snapshot(evaluationData)),
        ) as BlockEvaluation;
    });

    let preCommitmentEnabled = $state<boolean>(false);

    $effect(() => {
        // Only fetch settings once per mount
        if (typeof window !== "undefined" && (window as any).logseq) {
            preCommitmentEnabled = !!(window as any).logseq.settings?.[
                "cognitiveForcing_preCommitmentPrompt"
            ];
        }
    });

    // --- State ---
    let showLowScoresOnly = $state(false);
    let searchQuery = $state("");
    let showSearch = $state(false);
    let scoreThreshold = $state(2); // configurable: 1-4

    // Track expanded state for categories
    let expandedCategories = $state<Record<string, boolean>>({});

    const filteredCategories = $derived(() => {
        const groups = groupByCategory(localEvaluationData?.results || []);
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

    function toggleCategory(categoryName: string) {
        expandedCategories[categoryName] = !expandedCategories[categoryName];
    }

    function handleDataUpdate(updated: BlockEvaluation) {
        localEvaluationData = updated;
    }

    // Block text preview (first 150 chars)
    const blockPreview = $derived(() => {
        if (!blockText) return null;
        const clean = blockText.replace(/\[\[|\]\]/g, "").trim();
        return clean.length > 150 ? clean.slice(0, 150) + "…" : clean;
    });
</script>

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
                use:genericClick={() => {
                    showSearch = !showSearch;
                    if (!showSearch) searchQuery = "";
                }}
            >
                {@html ICONS.searchIcon}
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

    <div class="lda-sidebar-scroll p-[10px]">
        {#if filteredCategories().length === 0}
            <div class="lda-empty-state">No matching criteria found.</div>
        {:else if filteredCategories().length === 1}
            {@const category = filteredCategories()[0]}
            <div class="lda-flat-list-container">
                {#each category.criteria as criterion, criterionIdx (criterion.criterion_id)}
                    <EvaluationCriterionBlock
                        {criterion}
                        {criterionIdx}
                        categoryName={category.category}
                        categoryIdx={0}
                        defaultExpanded={true}
                        {blockId}
                        {preCommitmentEnabled}
                        evaluationData={localEvaluationData}
                        onDataUpdate={handleDataUpdate}
                    />
                {/each}
            </div>
        {:else}
            {#each filteredCategories() as category, catIdx (category.category)}
                <div class="lda-accordion-item">
                    <button
                        type="button"
                        class="lda-accordion-header"
                        use:genericClick={() =>
                            toggleCategory(category.category)}
                    >
                        <div class="lda-accordion-title-row">
                            <span class="lda-accordion-icon">
                                {@html expandedCategories[category.category]
                                    ? ICONS.chevronDown
                                    : ICONS.chevronRight}
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
                            <div class="lda-criteria-list">
                                {#each category.criteria as criterion, criterionIdx (criterion.criterion_id)}
                                    <EvaluationCriterionBlock
                                        {criterion}
                                        {criterionIdx}
                                        categoryName={category.category}
                                        categoryIdx={catIdx}
                                        defaultExpanded={true}
                                        {blockId}
                                        {preCommitmentEnabled}
                                        evaluationData={localEvaluationData}
                                        onDataUpdate={handleDataUpdate}
                                    />
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>
            {/each}
        {/if}
    </div>
</div>
