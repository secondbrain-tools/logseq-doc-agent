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
  const calculator = new FrontendEvaluationCalculator();

  // Pre-Commitment: self-suggestion before revealing AI suggestions
  let preCommitmentEnabled = $state<boolean>(false);
  let preCommitmentSuggestions = $state<Record<string, string>>({});
  let preCommitmentInputText = $state<Record<string, string>>({});

  $effect(() => {
    // Only fetch settings once per mount
    if (typeof window !== "undefined" && (window as any).logseq) {
      preCommitmentEnabled = !!(window as any).logseq.settings?.[
        "cognitiveForcing_preCommitmentPrompt"
      ];
    }
  });

  let expandedCategories = $state<Record<string, boolean>>({});
  let expandedCriteria = $state<Record<string, boolean>>({});

  // Track which criterion has an active feedback input and what type
  let activeFeedbackInput = $state<
    Record<string, "reply" | "change_proposal" | null>
  >({});
  let feedbackInputText = $state<Record<string, string>>({});

  // Icons
  const icons = {
    chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
    chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
    reply: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
  };

  function toggleCategory(categoryName: string) {
    expandedCategories[categoryName] = !expandedCategories[categoryName];
    expandedCategories = { ...expandedCategories };
  }

  function toggleCriterion(id: string) {
    expandedCriteria[id] = !expandedCriteria[id];
    expandedCriteria = { ...expandedCriteria };
  }

  function openFeedbackInput(
    criterionId: string,
    type: "reply" | "change_proposal",
  ) {
    activeFeedbackInput[criterionId] = type;
    if (!feedbackInputText[criterionId]) {
      feedbackInputText[criterionId] = "";
    }
    activeFeedbackInput = { ...activeFeedbackInput };
  }

  function cancelFeedbackInput(criterionId: string) {
    activeFeedbackInput[criterionId] = null;
    feedbackInputText[criterionId] = "";
    activeFeedbackInput = { ...activeFeedbackInput };
  }

  function saveFeedback(
    criterionId: string,
    criterionIdx: number,
    categoryIdx: number,
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
        .addFeedback(blockId, criterionId, newFeedback, issueIdx)
        .catch((err) => console.error("Failed to save feedback:", err));
    }

    // Optimistically update the local state for immediate feedback
    const cat = categories()[categoryIdx];
    const crit = cat.criteriaRatings[criterionIdx];
    if (crit.issues && crit.issues[issueIdx]) {
      const issue = crit.issues[issueIdx];
      if (!issue.user_feedback) {
        issue.user_feedback = [];
      }
      issue.user_feedback.push(newFeedback);
      localEvaluationData = { ...localEvaluationData };
    }

    cancelFeedbackInput(criterionId + "-" + issueIdx);
  }

  function deleteFeedback(
    criterionId: string,
    criterionIdx: number,
    categoryIdx: number,
    issueIdx: number,
    feedbackIdx: number,
  ) {
    if (blockId) {
      Services.instance.evaluationReviewService
        .deleteFeedback(blockId, criterionId, feedbackIdx, issueIdx)
        .catch((err) => console.error("Failed to delete feedback:", err));
    }

    const cat = categories()[categoryIdx];
    const crit = cat.criteriaRatings[criterionIdx];
    if (crit.issues && crit.issues[issueIdx]) {
      const issue = crit.issues[issueIdx];
      if (issue.user_feedback) {
        issue.user_feedback.splice(feedbackIdx, 1);
        localEvaluationData = { ...localEvaluationData };
      }
    }
  }

  function getPreCommitmentSuggestion(criterion: any): string | null {
    if (criterion.user_feedback) {
      const fb = criterion.user_feedback.find(
        (f: any) => f.type === "self_suggestion",
      );
      if (fb) return fb.text;
    }
    return preCommitmentSuggestions[criterion.criterion_id] || null;
  }

  function needsPreCommitment(criterion: any): boolean {
    if (!preCommitmentEnabled) return false;
    // Only for criteria with issues that have suggestions
    if (!criterion.issues || criterion.issues.length === 0) return false;
    const hasSuggestions = criterion.issues.some(
      (i: any) => i.suggestions && i.suggestions.length > 0,
    );
    if (!hasSuggestions) return false;

    return getPreCommitmentSuggestion(criterion) === null;
  }

  function savePreCommitmentSuggestion(
    criterionId: string,
    criterionIdx: number,
    categoryIdx: number,
    text: string,
  ) {
    if (!text.trim()) return;
    preCommitmentSuggestions[criterionId] = text.trim();
    preCommitmentSuggestions = { ...preCommitmentSuggestions };

    // Save as criterion-level feedback
    const feedback = {
      type: "self_suggestion" as const,
      text: text.trim(),
      created_at: new Date().toISOString(),
    };
    if (blockId) {
      Services.instance.evaluationReviewService
        .addFeedback(blockId, criterionId, feedback)
        .catch((err) => console.error("Failed to save self-suggestion:", err));
    }

    // Optimistically update
    const cat = categories()[categoryIdx];
    const crit = cat.criteriaRatings[criterionIdx];
    if (!crit.user_feedback) crit.user_feedback = [];
    crit.user_feedback.push(feedback);
    localEvaluationData = { ...localEvaluationData };

    // Clear the input text
    preCommitmentInputText[criterionId] = "";
  }

  // Derive categories from evaluation data
  const summary = $derived(() => localEvaluationData.summary);
  const categories = $derived(() => {
    const groups: Record<string, CriterionResult[]> = {};
    for (const res of localEvaluationData.results) {
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
  categoryIdx: number,
  useFlatList: boolean = false,
)}
  {#if criteriaRatings && criteriaRatings.length > 0}
    <div
      class="lda-criteria-list {useFlatList ? 'lda-flat-list-container' : ''}"
    >
      {#each criteriaRatings as criterion, criterionIdx}
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
            <div style="display: flex; align-items: center; gap: 6px;">
              <EvaluationScore
                rating={criterion.score}
                showValue={false}
                size="sm"
              />
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
              {#if needsPreCommitment(criterion)}
                <span
                  class="text-xs italic px-1 rounded"
                  style="color: var(--ls-link-text-color); opacity: 0.7;"
                  title="Propose your fix before seeing AI suggestions">✎</span
                >
              {/if}
            </div>
          </button>
          {#if expandedCriteria[uniqueId]}
            <div
              class="lda-criterion-content"
              transition:slide|local
              style="padding: 4px 12px 12px 24px; font-size: 0.9em; opacity: 0.9;"
            >
              {#if needsPreCommitment(criterion)}
                <p style="margin: 0;">{criterion.reason}</p>

                <div
                  class="lda-precommitment-prompt p-3 rounded text-sm mt-3"
                  style="background: var(--ls-secondary-background-color); border: 1px dashed var(--ls-border-color);"
                >
                  <div class="font-semibold mb-2">What would you change?</div>
                  <div class="text-xs mb-2 opacity-80">
                    Before seeing the AI's suggestions, propose your own fix for
                    this criterion.
                  </div>
                  <textarea
                    class="lda-feedback-input w-full p-2 text-xs border rounded mb-2"
                    style="border-color: var(--ls-border-color); color: var(--ls-primary-text-color); background: var(--ls-primary-background-color);"
                    rows="3"
                    placeholder="Describe what you would change or improve..."
                    bind:value={preCommitmentInputText[criterion.criterion_id]}
                  ></textarea>
                  <div class="flex justify-end gap-2">
                    <button
                      type="button"
                      class="lda-action-btn"
                      use:genericClick={() => {
                        // Skip pre-commitment — just reveal suggestions without submitting
                        preCommitmentSuggestions[criterion.criterion_id] =
                          "__skipped__";
                        preCommitmentSuggestions = {
                          ...preCommitmentSuggestions,
                        };
                      }}>Skip</button
                    >
                    <button
                      type="button"
                      class="lda-action-btn border-blue-500 text-blue-600"
                      style="background: var(--ls-secondary-background-color);"
                      use:genericClick={() =>
                        savePreCommitmentSuggestion(
                          criterion.criterion_id,
                          criterionIdx,
                          categoryIdx,
                          preCommitmentInputText[criterion.criterion_id] || "",
                        )}>Submit & Reveal</button
                    >
                  </div>
                </div>
              {:else}
                {#if getPreCommitmentSuggestion(criterion) && getPreCommitmentSuggestion(criterion) !== "__skipped__"}
                  <div
                    class="lda-self-suggestion-badge p-2 text-xs rounded mb-2"
                    style="background: var(--ls-secondary-background-color); border: 1px solid var(--ls-border-color);"
                  >
                    <span
                      class="font-semibold"
                      style="color: var(--ls-link-text-color);"
                      >Your suggestion:</span
                    >
                    <div class="mt-1 opacity-90">
                      {getPreCommitmentSuggestion(criterion)}
                    </div>
                  </div>
                {/if}

                <p style="margin: 0;">{criterion.reason}</p>

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
                                    <div class="italic">"{selector.exact}"</div>
                                  {/if}
                                {/each}
                              {/each}
                            </div>
                          {/if}

                          {#if issue.suggestions && issue.suggestions.length > 0}
                            <div class="lda-issue-suggestions text-xs">
                              {#if issue.suggestions.length >= 2}
                                <div class="lda-alternatives-container mt-1">
                                  {#each issue.suggestions as suggestion, i}
                                    <div class="lda-suggestion-card">
                                      <div class="lda-suggestion-card-header">
                                        <span class="lda-suggestion-label"
                                          >Option {String.fromCharCode(
                                            65 + i,
                                          )}</span
                                        >
                                      </div>
                                      <div class="lda-suggestion-card-body">
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
                            <div class="lda-user-feedback mt-2 pt-2 border-t">
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
                                        >{feedback.type.replace("_", " ")}</span
                                      >
                                      <div
                                        style="display: flex; gap: 8px; align-items: center;"
                                      >
                                        <span class="opacity-50 text-[10px]"
                                          >{new Date(
                                            feedback.created_at,
                                          ).toLocaleDateString()}</span
                                        >
                                        <button
                                          type="button"
                                          class="lda-action-btn-icon opacity-50 hover:opacity-100"
                                          title="Delete feedback"
                                          use:genericClick={() =>
                                            deleteFeedback(
                                              criterion.criterion_id,
                                              criterionIdx,
                                              categoryIdx,
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
                                {activeFeedbackInput[issueUniqueId].replace(
                                  "_",
                                  " ",
                                )}
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
                                bind:value={feedbackInputText[issueUniqueId]}
                              ></textarea>
                              <div class="flex justify-end gap-2">
                                <button
                                  type="button"
                                  class="lda-action-btn"
                                  use:genericClick={() =>
                                    cancelFeedbackInput(issueUniqueId)}
                                  >Cancel</button
                                >
                                <button
                                  type="button"
                                  class="lda-action-btn border-blue-500 text-blue-600 bg-blue-50"
                                  use:genericClick={() =>
                                    saveFeedback(
                                      criterion.criterion_id,
                                      criterionIdx,
                                      categoryIdx,
                                      issueIdx,
                                      activeFeedbackInput[issueUniqueId]!,
                                      feedbackInputText[issueUniqueId],
                                    )}>Save</button
                                >
                              </div>
                            </div>
                          {:else}
                            <div
                              class="lda-feedback-actions mt-2"
                              style="display: flex; gap: 6px;"
                            >
                              <button
                                type="button"
                                class="lda-action-btn"
                                use:genericClick={() =>
                                  openFeedbackInput(issueUniqueId, "reply")}
                              >
                                {@html icons.reply} Reply
                              </button>
                              <button
                                type="button"
                                class="lda-action-btn"
                                use:genericClick={() =>
                                  openFeedbackInput(
                                    issueUniqueId,
                                    "change_proposal",
                                  )}
                              >
                                ✎ Propose Change
                              </button>
                            </div>
                          {/if}
                          <!-- end activeFeedbackInput per issue -->
                        </div>
                        <!-- end lda-issue-block -->
                      {/each}
                      <!-- end each issue -->
                    </div>
                    <!-- end lda-issues-list -->
                  </div>
                  <!-- end lda-issues-container -->
                {/if}
                <!-- end criterion.issues -->
              {/if}
              <!-- end needsPreCommitment else -->
            </div>
            <!-- end lda-criterion-content -->
          {/if}
          <!-- end expandedCriteria -->
        </div>
        <!-- end lda-criterion-item -->
      {/each}
    </div>
    <!-- end lda-criteria-list -->
  {/if}
  <!-- end criteriaRatings -->
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
          0,
          true,
        )}
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
                catIdx,
                false,
              )}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>
