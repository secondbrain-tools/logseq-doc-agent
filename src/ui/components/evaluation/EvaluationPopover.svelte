<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { slide } from "svelte/transition";
  import type {
    BlockEvaluation,
    CriterionResult,
  } from "../../../domain/evaluation/entity";
  import { AddToSidebarUseCase } from "../../../application/usecases/add-to-sidebar.usecase";
  import { FrontendSidebarInjector } from "../../../infra/frontend";
  import { FrontendEvaluationCalculator } from "../../../infra/frontend/evaluation-calculator";
  import EvaluationScore from "./EvaluationScore.svelte";

  let {
    evaluationData,
    showPopover = false,
  }: {
    evaluationData: BlockEvaluation;
    showPopover: boolean;
  } = $props();

  const dispatch = createEventDispatcher();
  const calculator = new FrontendEvaluationCalculator();

  // Track expanded state for categories
  let expandedCategories = $state<Record<string, boolean>>({});

  // Icons
  const icons = {
    chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
    chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  };

  function toggleCategory(categoryName: string) {
    expandedCategories[categoryName] = !expandedCategories[categoryName];
    expandedCategories = { ...expandedCategories };
  }

  // Derive categories from evaluation data
  const categories = $derived(() => {
    const groups: Record<string, CriterionResult[]> = {};
    for (const res of evaluationData.results) {
      const cat = res.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(res);
    }

    return Object.entries(groups).map(([cat, res]) => ({
      category: cat,
      overallRating: calculator.calculateCategoryScore(res),
      criteriaRatings: res,
    }));
  });

  const hasDetailedFeedback = $derived(
    categories().length > 0 &&
      categories().some(
        (cat) => cat.criteriaRatings && cat.criteriaRatings.length > 0,
      ),
  );

  const overallRating = $derived(
    calculator.calculateOverallScore(evaluationData),
  );

  function openInSidebar(e: Event) {
    e.stopPropagation();
    if (evaluationData) {
      const useCase = new AddToSidebarUseCase(new FrontendSidebarInjector());
      const icon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>`;
      useCase.showAnalysisSidebar(evaluationData, icon);
      dispatch("close");
    }
  }

  function genericClick(node: HTMLElement, fn: () => void) {
    const handler = (e: MouseEvent) => {
      e.stopPropagation();
      fn();
    };
    node.addEventListener("click", handler);
    const stop = (e: Event) => e.stopPropagation();
    node.addEventListener("mousedown", stop);
    return {
      destroy() {
        node.removeEventListener("click", handler);
        node.removeEventListener("mousedown", stop);
      },
    };
  }

  function getSeverity(rating: number): string {
    const rounded = Math.round(rating * 2) / 2;
    if (rating === 0) return "muted";
    if (rounded > 4) return "excellent";
    if (rounded > 3) return "good";
    if (rounded > 2) return "warning";
    return "bad";
  }

  function getPercentage(rating: number): number {
    return Math.round((rating / 5) * 100);
  }
</script>

{#snippet criterionList(criteriaRatings: any[], useFlatList: boolean = false)}
  {#if criteriaRatings && criteriaRatings.length > 0}
    <div
      class="lda-criteria-list {useFlatList ? 'lda-flat-list-container' : ''}"
    >
      {#each criteriaRatings as criterion}
        <div class="lda-criterion-item">
          <div class="lda-criterion-header">
            <div
              style="display: flex; align-items: center; justify-content: space-between; width: 100%;"
            >
              <span class="lda-criterion-name">{criterion.criterion_id}</span>
              <EvaluationScore
                rating={criterion.score}
                showValue={false}
                size="sm"
              />
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

<div class="lda-rating-popover">
  <div class="lda-popover-header">
    <div class="lda-popover-header-row">
      <h4 id="lda-popover-title" class="lda-popover-title">
        {hasDetailedFeedback ? "Detailed Evaluation" : "Detailed Scores"}
        {#if evaluationData}
          <div style="display: inline-block; margin-left: 8px;">
            <EvaluationScore
              rating={overallRating}
              showValue={true}
              size="sm"
            />
          </div>
        {/if}
      </h4>
      <button
        use:genericClick={() => openInSidebar(new Event("click"))}
        class="lda-sidebar-trigger"
        title="Open in Sidebar"
        type="button"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><path d="M15 3h6v18h-6M10 17l5-5-5-5M3 12h12" /></svg
        >
      </button>
    </div>
  </div>
  <div class="lda-popover-content">
    {#if hasDetailedFeedback}
      {#if categories().length === 1}
        <div style="padding-top: 10px; padding-bottom: 5px;">
          {@render criterionList(categories()[0].criteriaRatings, true)}
        </div>
      {:else}
        {#each categories() as category}
          <div class="lda-accordion-item">
            <button
              type="button"
              class="lda-accordion-header"
              use:genericClick={() => toggleCategory(category.category)}
            >
              <div class="lda-accordion-title-row">
                <span class="lda-accordion-icon">
                  {@html expandedCategories[category.category]
                    ? icons.chevronDown
                    : icons.chevronRight}
                </span>
                <span class="lda-category-name">{category.category}</span>
                <EvaluationScore
                  rating={category.overallRating}
                  showValue={true}
                  size="sm"
                />
              </div>
              <div class="lda-dist-bar">
                <div
                  style="width: {getPercentage(category.overallRating)}%;"
                  class="lda-dist-segment lda-bg-{getSeverity(
                    category.overallRating,
                  )}"
                ></div>
              </div>
            </button>

            {#if expandedCategories[category.category]}
              <div class="lda-accordion-content-panel">
                {@render criterionList(category.criteriaRatings, false)}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    {:else}
      <table class="lda-ratings-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {#each categories() as item}
            <tr>
              <td class="lda-category-name">{item.category}</td>
              <td class="lda-rating-stars">
                <EvaluationScore
                  rating={item.overallRating}
                  showValue={true}
                  size="sm"
                />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
