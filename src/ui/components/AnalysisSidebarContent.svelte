<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { RatingValue } from "../../domain/rating";
    import type {
        FeedbackRating,
        CategoryRating,
        CriterionRating,
    } from "../../domain/rating";
    import { fade, slide } from "svelte/transition";
    import RatingStars from "./rating/RatingStars.svelte";

    let {
        feedbackData,
    }: {
        feedbackData: FeedbackRating;
    } = $props();

    const dispatch = createEventDispatcher();

    // --- State ---
    let showLowScoresOnly = $state(false);
    let showApplicableOnly = $state(false);
    let searchQuery = $state("");

    // Track expanded state for categories and feedback items
    let expandedCategories = $state<Record<string, boolean>>({});
    let expandedFeedback = $state<Record<string, boolean>>({});

    // --- Derived ---

    // Filter and Sort Categories
    const filteredCategories = $derived(
        (feedbackData?.categoryRatings || [])
            .map((cat) => {
                // Filter criteria within category
                const filteredCriteria = (cat.criteriaRatings || [])
                    .filter((c) => {
                        const matchesSearch = c.criterion
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase());
                        const matchesScore = showLowScoresOnly
                            ? c.rating <= 2 && c.rating > 0
                            : true; // Assuming <=2 includes 1 and 2.
                        const matchesApplicable = showApplicableOnly
                            ? c.rating > 0
                            : true;
                        return (
                            matchesSearch && matchesScore && matchesApplicable
                        );
                    })
                    .sort((a, b) => {
                        // Default sorting: lowest score first.
                        // Treat 0 (N/A) as high or low? Usually N/A is at bottom.
                        const aVal = a.rating === 0 ? 99 : a.rating;
                        const bVal = b.rating === 0 ? 99 : b.rating;
                        return aVal - bVal;
                    });

                return {
                    ...cat,
                    criteriaRatings: filteredCriteria,
                    // Recalculate stats for the visible items if needed,
                    // but the header usually shows stats for the *whole* category or filtered?
                    // "Category header: Average + (applicable/total)" usually implies the category's source truth.
                    // Let's keep the category stats as is, but maybe dim if empty?
                };
            })
            .filter((cat) => cat.criteriaRatings.length > 0), // Only show categories that have matching criteria
    );

    // --- Helpers ---

    // getStarColor helper removed in favor of CSS classes
    // .lda-bg-{severity} and .lda-text-{severity}

    function getApplicableCount(criteria: CriterionRating[]) {
        return criteria.filter((c) => c.rating > 0).length;
    }

    function toggleCategory(categoryName: string) {
        expandedCategories[categoryName] = !expandedCategories[categoryName];
    }

    function toggleFeedback(id: string) {
        expandedFeedback[id] = !expandedFeedback[id];
    }

    function copyFeedback(text: string) {
        navigator.clipboard.writeText(text);
        // Could add toast here
    }

    function ignoreBlock() {
        console.log("Ignore block triggered");
        dispatch("ignore", { feedbackData });
    }

    function reRunAnalysis() {
        console.log("Rerun analysis triggered");
        dispatch("rerun", { feedbackData });
    }

    // Icons (Simple SVG strings)
    const icons = {
        chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
        chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
        copy: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
        ignore: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
    };
</script>

<div class="lda-sidebar">
    <!-- Header / Filters -->
    <div class="lda-sidebar-header">
        <div class="lda-sidebar-title">
            <h3>Analysis Report</h3>
            {#if feedbackData}
                <div
                    class="lda-overall-score lda-text-{RatingValue.fromNumber(
                        feedbackData.overallRating,
                    ).getSeverity()}"
                >
                    {feedbackData.overallRating}/5
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

    <!-- Content -->
    <div class="lda-sidebar-scroll">
        {#if filteredCategories.length === 0}
            <div class="lda-empty-state">No matching criteria found.</div>
        {:else}
            {#each filteredCategories as category (category.category)}
                {@const ratingObj = RatingValue.fromNumber(
                    category.overallRating,
                )}
                {@const applicable = getApplicableCount(
                    category.criteriaRatings,
                )}
                {@const total = category.criteriaRatings.length}

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
                            <span
                                class="lda-category-avg lda-text-{RatingValue.fromNumber(
                                    category.overallRating,
                                ).getSeverity()}"
                            >
                                Avg {category.overallRating}
                            </span>
                            <span class="lda-category-count">
                                ({applicable}/{total})
                            </span>
                        </div>
                        <!-- Progress Bar -->
                        <div class="lda-dist-bar">
                            <div
                                class="lda-dist-segment lda-bg-{ratingObj.getSeverity()}"
                                style="width: {ratingObj.getPercentage()}%;"
                            ></div>
                        </div>
                    </button>

                    {#if expandedCategories[category.category]}
                        <div
                            class="lda-accordion-content-panel"
                            transition:slide|local
                        >
                            {#each category.criteriaRatings as criterion (criterion.criterion)}
                                {@const uniqueId =
                                    category.category +
                                    "-" +
                                    criterion.criterion}
                                <div class="lda-criterion-row">
                                    <div class="lda-criterion-top">
                                        <div class="lda-rating-wrapper">
                                            <RatingStars
                                                rating={criterion.rating}
                                                showValue={false}
                                                size="sm"
                                            />
                                        </div>
                                        <div class="lda-criterion-info">
                                            <div class="lda-criterion-title">
                                                {criterion.criterion}
                                            </div>
                                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                                            <div
                                                class="lda-feedback-preview"
                                                onclick={() =>
                                                    toggleFeedback(uniqueId)}
                                            >
                                                {expandedFeedback[uniqueId]
                                                    ? ""
                                                    : (
                                                          criterion.feedback ||
                                                          ""
                                                      ).slice(0, 60) +
                                                      (criterion.feedback
                                                          ?.length > 60
                                                          ? "..."
                                                          : "")}
                                            </div>
                                        </div>
                                    </div>

                                    {#if expandedFeedback[uniqueId] || criterion.feedback?.length <= 60}
                                        <div
                                            class="lda-feedback-full"
                                            transition:slide|local
                                        >
                                            <p>{criterion.feedback}</p>
                                            <div class="lda-feedback-actions">
                                                <button
                                                    class="lda-action-btn"
                                                    title="Copy Feedback"
                                                    onclick={() =>
                                                        copyFeedback(
                                                            criterion.feedback,
                                                        )}
                                                >
                                                    {@html icons.copy} Copy
                                                </button>
                                                <button
                                                    class="lda-action-btn"
                                                    title="Ignore"
                                                    onclick={ignoreBlock}
                                                >
                                                    {@html icons.ignore} Ignore
                                                </button>
                                                <button
                                                    class="lda-action-btn"
                                                    title="Re-run"
                                                    onclick={reRunAnalysis}
                                                >
                                                    {@html icons.refresh} Re-run
                                                </button>
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        {/if}
    </div>
</div>
