<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { slide } from "svelte/transition";
  import type {
    BlockEvaluation,
    CriterionResult,
  } from "../../../domain/evaluation/entity";
  import { AddToSidebarUseCase } from "../../../application/usecases/add-to-sidebar.usecase";
  import { Services } from "../../../services";
  import { FrontendEvaluationCalculator } from "../../../infra/frontend/evaluation-calculator";
  import EvaluationScore from "./EvaluationScore.svelte";

  let {
    evaluationData,
    blockId,
    blockText,
    showPopover = false,
  }: {
    evaluationData: BlockEvaluation;
    blockId?: string;
    blockText?: string;
    showPopover?: boolean;
  } = $props();

  const dispatch = createEventDispatcher();
  const calculator = new FrontendEvaluationCalculator();

  let expandedCategories = $state<Record<string, boolean>>({});
  let expandedCriteria = $state<Record<string, boolean>>({});

  // Icons
  const icons = {
    chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
    chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  };

  function toggleCategory(categoryName: string) {
    expandedCategories[categoryName] = !expandedCategories[categoryName];
    expandedCategories = { ...expandedCategories };
  }

  function toggleCriterion(id: string) {
    expandedCriteria[id] = !expandedCriteria[id];
    expandedCriteria = { ...expandedCriteria };
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

  const overallRating = $derived(
    calculator.calculateOverallScore(evaluationData),
  );

  function openInSidebar(e: Event) {
    e.stopPropagation();
    if (evaluationData) {
      const useCase = new AddToSidebarUseCase(
        Services.instance.sidebarInjector,
      );
      const icon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>`;
      useCase.showAnalysisSidebar(evaluationData, blockId, icon, blockText);
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
</script>

{#snippet criterionList(
  categoryName: string,
  criteriaRatings: any[],
  useFlatList: boolean = false,
)}
  {#if criteriaRatings && criteriaRatings.length > 0}
    <div
      class="lda-criteria-list {useFlatList ? 'lda-flat-list-container' : ''}"
    >
      {#each criteriaRatings as criterion}
        {@const uniqueId = categoryName + "-" + criterion.criterion_id}
        <div class="lda-criterion-item">
          <button
            type="button"
            class="lda-criterion-header"
            use:genericClick={() => toggleCriterion(uniqueId)}
            style="display: flex; align-items: flex-start; justify-content: space-between; width: 100%; border: none; background: transparent; cursor: pointer; text-align: left; padding: 4px;"
          >
            <div style="display: flex; align-items: center; gap: 4px;">
              <span class="lda-accordion-icon">
                {@html expandedCriteria[uniqueId]
                  ? icons.chevronDown
                  : icons.chevronRight}
              </span>
              <span class="lda-criterion-name">{criterion.criterion_id}</span>
            </div>
            <EvaluationScore
              rating={criterion.score}
              showValue={false}
              size="sm"
            />
          </button>
          {#if expandedCriteria[uniqueId]}
            <div
              class="lda-criterion-content"
              transition:slide|local
              style="padding: 4px 12px 12px 24px; font-size: 0.9em; opacity: 0.9;"
            >
              <p style="margin: 0;">{criterion.reason}</p>

              {#if criterion.suggestions && criterion.suggestions.length > 0}
                <div class="lda-suggestions mt-2 pt-2 border-t">
                  <strong>Suggestions:</strong>
                  <ul
                    class="lda-suggestions-list list-disc pl-4 text-sm mt-1"
                    style="margin-top: 4px; padding-left: 16px;"
                  >
                    {#each criterion.suggestions as suggestion}
                      <li
                        class="lda-suggestion-item pb-1"
                        style="margin-bottom: 4px;"
                      >
                        {#if suggestion.selector?.exact}
                          <span class="lda-suggestion-target italic opacity-75"
                            >"{suggestion.selector.exact}"</span
                          > ->
                        {/if}
                        {#if suggestion.proposed_text}
                          <span
                            class="lda-suggestion-proposal bg-blue-100 dark:bg-blue-900 px-1 rounded"
                            style="background-color: var(--ls-secondary-background-color); padding: 0 4px; border-radius: 4px;"
                            >{suggestion.proposed_text}</span
                          >
                        {/if}
                        <div
                          class="lda-suggestion-rationale text-xs opacity-75"
                          style="font-size: 0.8em; opacity: 0.8; margin-top: 2px;"
                        >
                          {suggestion.rationale}
                        </div>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if criterion.evidence && criterion.evidence.length > 0}
                <div class="lda-evidence mt-2 pt-2 border-t text-xs">
                  <strong>Evidence:</strong>
                  <ul
                    class="lda-evidence-list list-disc pl-4 mt-1"
                    style="margin-top: 4px; padding-left: 16px;"
                  >
                    {#each criterion.evidence as ev}
                      {#each ev.selectors as selector}
                        {#if selector.exact}
                          <li
                            class="lda-evidence-item italic opacity-75"
                            style="font-size: 0.8em; opacity: 0.8; margin-bottom: 2px;"
                          >
                            "{selector.exact}"
                          </li>
                        {/if}
                      {/each}
                    {/each}
                  </ul>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

<div class="lda-rating-popover">
  <div class="lda-popover-header">
    <div class="lda-popover-header-row">
      <h4 id="lda-popover-title" class="lda-popover-title">
        Detailed Evaluation
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
    {#if categories().length === 1}
      <div style="padding-top: 4px;">
        {@render criterionList(
          categories()[0].category,
          categories()[0].criteriaRatings,
          true,
        )}
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
          </button>

          {#if expandedCategories[category.category]}
            <div class="lda-accordion-content-panel">
              {@render criterionList(
                category.category,
                category.criteriaRatings,
                false,
              )}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>
