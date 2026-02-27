<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { BlockEvaluation } from "../../../domain/evaluation/entity";
  import { AddToSidebarUseCase } from "../../../application/usecases/add-to-sidebar.usecase";
  import { Services } from "../../../services";
  import { FrontendEvaluationCalculator } from "../../../infra/frontend/evaluation-calculator";
  import EvaluationScore from "./EvaluationScore.svelte";
  import EvaluationCriterionBlock from "./EvaluationCriterionBlock.svelte";
  import { groupByCategory, genericClick } from "./evaluation-review-logic";
  import { ICONS } from "../../icons";

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

  const dispatch = createEventDispatcher();
  const calculator = new FrontendEvaluationCalculator();

  let preCommitmentEnabled = $state<boolean>(false);

  $effect(() => {
    // Only fetch settings once per mount
    if (typeof window !== "undefined" && (window as any).logseq) {
      preCommitmentEnabled = !!(window as any).logseq.settings?.[
        "cognitiveForcing_preCommitmentPrompt"
      ];
    }
  });

  let expandedCategories = $state<Record<string, boolean>>({});

  function toggleCategory(categoryName: string) {
    expandedCategories[categoryName] = !expandedCategories[categoryName];
    expandedCategories = { ...expandedCategories };
  }

  function handleDataUpdate(updated: BlockEvaluation) {
    localEvaluationData = updated;
  }

  // Derive categories from evaluation data
  const summary = $derived(() => localEvaluationData.summary);

  const categories = $derived(() => {
    const groups = groupByCategory(localEvaluationData.results);
    return Object.entries(groups).map(([cat, res]) => ({
      category: cat,
      overallRating: calculator.calculateCategoryScore(res),
      criteriaRatings: res,
    }));
  });

  const overallRating = $derived(
    calculator.calculateOverallScore(evaluationData),
  );

  function openInSidebar(e?: MouseEvent) {
    if (e) e.stopPropagation();
    if (evaluationData) {
      const useCase = new AddToSidebarUseCase(
        Services.instance.sidebarInjector,
      );
      useCase.showAnalysisSidebar(
        evaluationData,
        blockId,
        undefined,
        blockText,
      );
      dispatch("close");
    }
  }
</script>

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
        use:genericClick={openInSidebar}
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
      <div style="padding-top: 4px;" class="lda-flat-list-container">
        {#each categories()[0].criteriaRatings as criterion, criterionIdx}
          <EvaluationCriterionBlock
            {criterion}
            {criterionIdx}
            categoryName={categories()[0].category}
            categoryIdx={0}
            defaultExpanded={false}
            {blockId}
            {preCommitmentEnabled}
            evaluationData={localEvaluationData}
            onDataUpdate={handleDataUpdate}
          />
        {/each}
      </div>
    {:else}
      {#each categories() as category, catIdx}
        <div class="lda-accordion-item">
          <button
            type="button"
            class="lda-accordion-header"
            use:genericClick={() => toggleCategory(category.category)}
          >
            <div class="lda-accordion-title-row">
              <span class="lda-accordion-icon">
                {@html expandedCategories[category.category]
                  ? ICONS.chevronDown
                  : ICONS.chevronRight}
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
              <div class="lda-criteria-list">
                {#each category.criteriaRatings as criterion, criterionIdx}
                  <EvaluationCriterionBlock
                    {criterion}
                    {criterionIdx}
                    categoryName={category.category}
                    categoryIdx={catIdx}
                    defaultExpanded={false}
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
