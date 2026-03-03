<script lang="ts">
    import { slide } from "svelte/transition";
    import type {
        Issue,
        BlockEvaluation,
    } from "../../../domain/evaluation/entity";
    import {
        saveFeedback,
        deleteFeedback,
        toggleIssueDone,
        savePreCommitmentSuggestion,
        needsPreCommitment,
        getPreCommitmentSuggestion,
        genericClick,
    } from "./evaluation-review-logic";
    import { ICONS } from "../../icons";
    import { onDestroy } from "svelte";
    import { Services } from "../../../services";

    let {
        issue,
        issueIdx,
        criterionId,
        criterionIdx,
        categoryIdx,
        uniqueId,
        blockId,
        preCommitmentEnabled,
        evaluationData,
        onDataUpdate,
    }: {
        issue: Issue;
        issueIdx: number;
        criterionId: string;
        criterionIdx: number;
        categoryIdx: number;
        uniqueId: string;
        blockId?: string;
        preCommitmentEnabled: boolean;
        evaluationData: BlockEvaluation;
        onDataUpdate: (data: BlockEvaluation) => void;
    } = $props();

    let activeFeedbackInput = $state<"reply" | "change_proposal" | null>(null);
    let feedbackInputText = $state("");
    let preCommitmentInputText = $state("");

    let fallbackPreCommitmentSuggestions = $state<Record<string, string>>({});

    // State for tracking which suggestion (if any) is currently being previewed
    let activeSuggestionIdx = $state<number | null>(null);

    const issueUniqueId = `${uniqueId}-${issueIdx}`;

    const isDone = $derived(
        issue.user_feedback?.some((fb) => fb.type === "done") || false,
    );

    const doneFeedbackIdx = $derived(
        issue.user_feedback?.findIndex((fb) => fb.type === "done") ?? -1,
    );

    // Clear previews when issue changes or component unmounts
    $effect(() => {
        // Track issueIdx to re-clear state if the parent popover changes the props
        let _currentIdx = issueIdx;
        activeSuggestionIdx = null;
        if (blockId) {
            Services.instance.evidenceHighlightService.clearPreview();
        }
    });

    onDestroy(() => {
        if (blockId) {
            Services.instance.evidenceHighlightService.clearPreview();
        }
    });

    function toggleSuggestionPreview(idx: number, suggestion: any) {
        if (!blockId) return;

        if (activeSuggestionIdx === idx) {
            // Deselect and clear preview
            activeSuggestionIdx = null;
            Services.instance.evidenceHighlightService.clearPreview();
        } else {
            // Select and preview
            activeSuggestionIdx = idx;
            Services.instance.evidenceHighlightService.previewSuggestion(
                blockId,
                suggestion,
            );
        }
    }

    function openFeedbackInput(type: "reply" | "change_proposal") {
        activeFeedbackInput = type;
        feedbackInputText = "";
    }

    function cancelFeedbackInput() {
        activeFeedbackInput = null;
        feedbackInputText = "";
    }

    async function handleSaveFeedback(
        type: "reply" | "change_proposal",
        text: string,
    ) {
        const updated = await saveFeedback(
            blockId,
            criterionId,
            issueIdx,
            type,
            text,
            evaluationData,
        );
        onDataUpdate(updated);
        cancelFeedbackInput();
    }

    async function handleDeleteFeedback(fbIdx: number) {
        const updated = await deleteFeedback(
            blockId,
            criterionId,
            issueIdx,
            fbIdx,
            evaluationData,
        );
        onDataUpdate(updated);
    }

    async function handleToggleDone() {
        const updated = await toggleIssueDone(
            blockId,
            criterionId,
            issueIdx,
            isDone,
            doneFeedbackIdx,
            evaluationData,
        );
        onDataUpdate(updated);
    }

    async function handleSavePreCommitment(text: string) {
        const updated = await savePreCommitmentSuggestion(
            blockId,
            criterionId,
            issueIdx,
            text,
            evaluationData,
        );
        onDataUpdate(updated);
        preCommitmentInputText = "";
    }

    function skipPreCommitment() {
        fallbackPreCommitmentSuggestions[issueUniqueId] = "__skipped__";
        fallbackPreCommitmentSuggestions = {
            ...fallbackPreCommitmentSuggestions,
        };
    }

    const showPreCommitmentPrompt = $derived(
        needsPreCommitment(
            issue,
            preCommitmentEnabled,
            fallbackPreCommitmentSuggestions,
            issueUniqueId,
        ),
    );

    const savedPreCommitment = $derived(
        getPreCommitmentSuggestion(
            issue,
            fallbackPreCommitmentSuggestions,
            issueUniqueId,
        ),
    );
</script>

<div
    class="lda-issue-block bg-white dark:bg-gray-800 p-2 rounded border {isDone
        ? 'lda-issue-done'
        : ''}"
    style="border-color: var(--ls-border-color);"
>
    <div class="lda-issue-header flex items-center justify-between mb-1">
        <div class="flex items-center gap-2">
            <span
                class="font-semibold text-sm"
                style={isDone
                    ? "text-decoration: line-through; opacity: 0.6;"
                    : ""}>{issue.description}</span
            >
            {#if issue.impact && issue.impact !== "low" && !isDone}
                <span class="lda-impact-tag lda-impact-{issue.impact}"
                    >{issue.impact}</span
                >
            {/if}
        </div>
        <!-- Done toggle icon -->
        <button
            type="button"
            class="lda-done-toggle {isDone
                ? 'opacity-100 text-green-600'
                : 'opacity-30 hover:opacity-100'}"
            use:genericClick={handleToggleDone}
            title={isDone ? "Reopen issue" : "Mark as done"}
        >
            {@html ICONS.check}
        </button>
    </div>

    {#if !isDone}
        <div transition:slide|local>
            {#if showPreCommitmentPrompt}
                <div
                    class="lda-precommitment-prompt p-3 rounded text-sm mt-3"
                    style="background: var(--ls-secondary-background-color); border: 1px dashed var(--ls-border-color);"
                >
                    <div class="font-semibold mb-2">What would you change?</div>
                    <div class="text-xs mb-2 opacity-80">
                        Before seeing the AI's suggestions, propose your own fix
                        for this issue.
                    </div>
                    <textarea
                        class="lda-feedback-input w-full p-2 text-xs border rounded mb-2"
                        style="border-color: var(--ls-border-color); color: var(--ls-primary-text-color); background: var(--ls-primary-background-color);"
                        rows="3"
                        placeholder="Describe what you would change or improve..."
                        bind:value={preCommitmentInputText}
                    ></textarea>
                    <div class="flex justify-end gap-2">
                        <button
                            type="button"
                            class="lda-action-btn"
                            use:genericClick={skipPreCommitment}>Skip</button
                        >
                        <button
                            type="button"
                            class="lda-action-btn border-blue-500 text-blue-600"
                            style="background: var(--ls-secondary-background-color);"
                            use:genericClick={() =>
                                handleSavePreCommitment(preCommitmentInputText)}
                            >Submit & Reveal</button
                        >
                    </div>
                </div>
            {:else}
                {#if savedPreCommitment && savedPreCommitment !== "__skipped__"}
                    <div
                        class="lda-self-suggestion-badge p-2 text-xs rounded mb-2"
                        style="background: var(--ls-secondary-background-color); border: 1px solid var(--ls-border-color);"
                    >
                        <span
                            class="font-semibold"
                            style="color: var(--ls-link-text-color);"
                            >Your suggestion:</span
                        >
                        <div class="mt-1 opacity-90">{savedPreCommitment}</div>
                    </div>
                {/if}

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
                                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                                    <div
                                        class="lda-suggestion-card {activeSuggestionIdx ===
                                        i
                                            ? 'lda-suggestion-card--active'
                                            : ''} cursor-pointer transition-all duration-200"
                                        use:genericClick={() => {
                                            toggleSuggestionPreview(
                                                i,
                                                suggestion,
                                            );
                                        }}
                                    >
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
                                                    >"{suggestion.selector
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
                                {#each issue.suggestions as suggestion, i}
                                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                                    <li
                                        class="lda-suggestion-item pb-1 cursor-pointer transition-colors {activeSuggestionIdx ===
                                        i
                                            ? 'lda-suggestion-item--active'
                                            : ''}"
                                        use:genericClick={() => {
                                            toggleSuggestionPreview(
                                                i,
                                                suggestion,
                                            );
                                        }}
                                    >
                                        {#if suggestion.selector?.exact}
                                            <span
                                                class="lda-suggestion-target italic opacity-75"
                                                >"{suggestion.selector
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

                <!-- User Feedback List -->
                {#if issue.user_feedback && issue.user_feedback.filter((fb) => fb.type !== "done").length > 0}
                    <div class="lda-user-feedback mt-2 pt-2 border-t">
                        <div class="mt-1 flex flex-col gap-[6px]">
                            {#each issue.user_feedback
                                .map((fb, i) => ({ fb, i }))
                                .filter((item) => item.fb.type !== "done") as item}
                                <div
                                    class="lda-feedback-item bg-gray-50 p-2 rounded text-xs border"
                                    style="background-color: var(--ls-secondary-background-color); border-color: var(--ls-border-color);"
                                >
                                    <div class="flex justify-between mb-[2px]">
                                        <span
                                            class="font-semibold text-gray-600 capitalize opacity-80"
                                            >{item.fb.type.replace(
                                                "_",
                                                " ",
                                            )}</span
                                        >
                                        <div class="flex gap-2 items-center">
                                            <span class="opacity-50 text-[10px]"
                                                >{new Date(
                                                    item.fb.created_at,
                                                ).toLocaleDateString()}</span
                                            >
                                            <button
                                                type="button"
                                                class="lda-action-btn-icon opacity-50 hover:opacity-100"
                                                title="Delete feedback"
                                                use:genericClick={() =>
                                                    handleDeleteFeedback(
                                                        item.i,
                                                    )}>×</button
                                            >
                                        </div>
                                    </div>
                                    <div class="text-gray-800">
                                        {item.fb.text}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- Feedback Actions / Input -->
                {#if activeFeedbackInput}
                    <div
                        class="lda-feedback-input-container mt-2 pt-2 border-t"
                        transition:slide|local
                    >
                        <label
                            class="block text-xs font-semibold mb-1 opacity-80 capitalize"
                            >{activeFeedbackInput.replace("_", " ")}</label
                        >
                        <textarea
                            class="lda-feedback-input w-full p-2 text-xs border rounded mb-2 bg-white"
                            style="border-color: var(--ls-border-color); color: var(--ls-primary-text-color);"
                            rows="2"
                            placeholder={activeFeedbackInput === "reply"
                                ? "Add your reply..."
                                : "What would you change?"}
                            bind:value={feedbackInputText}
                        ></textarea>
                        <div class="flex justify-end gap-2">
                            <button
                                type="button"
                                class="lda-action-btn"
                                use:genericClick={cancelFeedbackInput}
                                >Cancel</button
                            >
                            <button
                                type="button"
                                class="lda-action-btn border-blue-500 text-blue-600 bg-blue-50"
                                use:genericClick={() =>
                                    handleSaveFeedback(
                                        activeFeedbackInput!,
                                        feedbackInputText,
                                    )}>Save</button
                            >
                        </div>
                    </div>
                {:else}
                    <div class="lda-feedback-actions mt-2 flex gap-[6px]">
                        <button
                            type="button"
                            class="lda-action-btn"
                            use:genericClick={() => openFeedbackInput("reply")}
                        >
                            {@html ICONS.reply} Reply
                        </button>
                        <button
                            type="button"
                            class="lda-action-btn"
                            use:genericClick={() =>
                                openFeedbackInput("change_proposal")}
                        >
                            ✎ Propose Change
                        </button>
                    </div>
                {/if}
            {/if}
        </div>
        <!-- /slide -->
    {/if}
    <!-- /!isDone -->
</div>
