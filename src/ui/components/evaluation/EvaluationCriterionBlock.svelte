<script lang="ts">
import { slide } from "svelte/transition";
import type { CriterionResult, BlockEvaluation, Issue } from "../../../domain/evaluation/entity";
import EvaluationScore from "./EvaluationScore.svelte";
import EvaluationIssueBlock from "./EvaluationIssueBlock.svelte";
import { ICONS } from "../../icons";
import { genericClick } from "./evaluation-review-logic";

let {
  criterion,
  criterionIdx,
  categoryName,
  categoryIdx,
  defaultExpanded = false,
  blockId = undefined,
  preCommitmentEnabled = false,
  compactIssueList = false,
  accordionMode = false,
  isExpandedInAccordion = false,
  onExpandToggle = undefined,
  onIssueSelect = undefined,
  evaluationData,
  onDataUpdate,
}: {
  criterion: CriterionResult;
  criterionIdx: number;
  categoryName: string;
  categoryIdx: number;
  defaultExpanded?: boolean;
  accordionMode?: boolean;
  isExpandedInAccordion?: boolean;
  onExpandToggle?: (id: string) => void;
  blockId?: string;
  preCommitmentEnabled?: boolean;
  compactIssueList?: boolean;
  onIssueSelect?: (
    criterion: CriterionResult,
    criterionIdx: number,
    issue: Issue,
    issueIdx: number,
  ) => void;
  evaluationData: BlockEvaluation;
  onDataUpdate: (data: BlockEvaluation) => void;
} = $props();

let localExpanded = $state(false);
// Use an effect to sync localExpanded if defaultExpanded prop changes
$effect(() => {
  localExpanded = defaultExpanded;
});

const uniqueId = $derived(`${categoryName}-${criterion.criterion_id}`);

const isExpanded = $derived(accordionMode ? isExpandedInAccordion : localExpanded);

function toggleExpand() {
  if (accordionMode) {
    onExpandToggle?.(criterion.criterion_id);
  } else {
    localExpanded = !localExpanded;
  }
}

function handleIssueClick(issue: Issue, issueIdx: number) {
  onIssueSelect?.(criterion, criterionIdx, issue, issueIdx);
}
</script>

<div class="lda-criterion-item lda-criterion-block">
  <button
    type="button"
    class="lda-criterion-header"
    use:genericClick={toggleExpand}
    style="display: flex; align-items: flex-start; justify-content: space-between; width: 100%; border: none; background: transparent; cursor: pointer; text-align: left; padding: 4px;"
  >
    <div style="display: flex; align-items: center; gap: 4px;">
      <span class="lda-accordion-icon">
        {@html isExpanded ? ICONS.chevronDown : ICONS.chevronRight}
      </span>
      <span class="lda-criterion-name font-semibold" style="font-size: 13px;"
        >{criterion.criterion_id}</span
      >
    </div>
    <div style="display: flex; align-items: center; gap: 6px;">
      <EvaluationScore rating={criterion.score} showValue={false} size="sm" />
      {#if criterion.confidence !== undefined}
        <span
          class="lda-confidence-badge {criterion.confidence < 60 ? 'lda-confidence-low' : ''}"
          title="AI Confidence Score"
        >
          {criterion.confidence}%
        </span>
      {/if}
    </div>
  </button>

  {#if isExpanded}
    <div
      class="lda-criterion-content"
      transition:slide|local
      style="padding: 4px 12px 12px 24px; font-size: 0.9em; opacity: 0.9;"
    >
      <div class="lda-feedback-full text-xs text-gray-700 dark:text-gray-300 mb-2">
        {criterion.reason}
      </div>

      {#if criterion.issues && criterion.issues.length > 0}
        <div class="lda-issues-container mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <strong class="text-xs opacity-80" style="display: block; margin-bottom: 8px;"
            >Issues found:</strong
          >

          {#if compactIssueList}
            <!-- Compact mode: clickable issue titles only -->
            <div class="lda-issue-title-list">
              {#each criterion.issues as issue, issueIdx}
                {@const isDone = issue.user_feedback?.some((fb) => fb.type === "done") || false}
                <button
                  type="button"
                  class="lda-issue-title-btn {isDone ? 'lda-issue-title-done' : ''}"
                  use:genericClick={() => handleIssueClick(issue, issueIdx)}
                >
                  <span class="lda-issue-title-text">{issue.description}</span>
                  <div class="lda-issue-title-meta">
                    {#if isDone}
                      <span class="lda-issue-done-badge">✓</span>
                    {:else if issue.impact && issue.impact !== "low"}
                      <span
                        class="lda-impact-tag lda-impact-{issue.impact}"
                        title={issue.impact === "high" ? "High Impact" : "Medium Impact"}
                        aria-label={issue.impact === "high" ? "High Impact" : "Medium Impact"}
                        >{issue.impact === "high" ? "H" : "M"}</span
                      >
                    {/if}
                    {@html ICONS.chevronRight}
                  </div>
                </button>
              {/each}
            </div>
          {:else}
            <!-- Full mode: inline issue blocks -->
            <div class="lda-issues-list flex flex-col gap-3">
              {#each criterion.issues as issue, issueIdx}
                <EvaluationIssueBlock
                  {issue}
                  {issueIdx}
                  criterionId={criterion.criterion_id}
                  {criterionIdx}
                  {categoryIdx}
                  {uniqueId}
                  {blockId}
                  {preCommitmentEnabled}
                  {evaluationData}
                  {onDataUpdate}
                />
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
