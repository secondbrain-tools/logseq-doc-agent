<script lang="ts">
    import { slide } from "svelte/transition";
    import type {
        Issue,
        BlockEvaluation,
    } from "../../../domain/evaluation/entity";
    import type { ContextScope } from "../../../domain/evaluation/issue-reply.types";
    import {
        saveFeedback,
        deleteFeedback,
        toggleIssueDone, // Keeping for backward compat if old "done" feedbacks exist
        setIssueStatus,
        setSuggestionStatus,
        applySuggestion,
        savePreCommitmentSuggestion,
        needsPreCommitment,
        getPreCommitmentSuggestion,
        genericClick,
        startAiIssueReply,
        editFeedback,
    } from "./evaluation-review-logic";
    import { ICONS } from "../../icons";
    import { onDestroy } from "svelte";
    import { Services } from "../../../services";
    import { untrack } from "svelte";

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

    let contextScope = $state<ContextScope>({
        includeDocument: false,
        includeEvaluation: false,
    });
    let isAiGenerating = $state(false);
    let editingFeedbackIdx = $state<number | null>(null);
    let editingFeedbackText = $state("");

    let fallbackPreCommitmentSuggestions = $state<Record<string, string>>({});

    // State for tracking which suggestion (if any) is currently being previewed
    let activeSuggestionIdx = $state<number | null>(null);

    const issueUniqueId = $derived(`${uniqueId}-${issueIdx}`);
    const feedbackInputId = $derived(
        `lda-feedback-input-${issueUniqueId}-${activeFeedbackInput ?? "inactive"}`,
    );

    const isDone = $derived(
        issue.status === "resolved" ||
            issue.user_feedback?.some((fb) => fb.type === "done") ||
            false,
    );

    const isIgnored = $derived(issue.status === "ignored");

    const doneFeedbackIdx = $derived(
        issue.user_feedback?.findIndex((fb) => fb.type === "done") ?? -1,
    );

    const hasChangeProposal = $derived(
        issue.user_feedback?.some((fb) => fb.type === "change_proposal") ??
            false,
    );

    // Clear previews when issue changes or component unmounts
    $effect(() => {
        // Track issueIdx to re-clear state if the parent popover changes the props
        let _currentIdx = issueIdx;

        // We use untrack to prevent this effect from re-running when activeSuggestionIdx changes locally
        untrack(() => {
            activeSuggestionIdx = null;
            if (blockId) {
                Services.instance.evidenceHighlightService.clearPreview();
            }
        });
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
            console.log(
                `[EvaluationIssueBlock] new index ${idx} selected, applying preview`,
            );
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
        if (!text.trim()) return;
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

        if (type === "reply") {
            await triggerAiReply(updated);
        }
    }

    async function triggerAiReply(evData: BlockEvaluation) {
        try {
            isAiGenerating = true;
            const updatedWithAi = await startAiIssueReply(
                blockId,
                criterionId,
                issueIdx,
                evData,
                contextScope,
            );
            onDataUpdate(updatedWithAi);
        } catch (e) {
            console.error("AI reply failed", e);
        } finally {
            isAiGenerating = false;
        }
    }

    async function handleDiscussProposal(e?: MouseEvent) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        await triggerAiReply(evaluationData);
    }

    function startEditFeedback(idx: number, text: string) {
        editingFeedbackIdx = idx;
        editingFeedbackText = text;
    }

    function cancelEditFeedback() {
        editingFeedbackIdx = null;
        editingFeedbackText = "";
    }

    async function handleSaveEditedFeedback(idx: number) {
        if (!editingFeedbackText.trim()) {
            cancelEditFeedback();
            return;
        }
        const updated = await editFeedback(
            blockId,
            criterionId,
            issueIdx,
            idx,
            editingFeedbackText,
            evaluationData,
        );
        onDataUpdate(updated);
        cancelEditFeedback();
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

    async function handleToggleDone(e?: MouseEvent) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        // First clear any previews to avoid ghost highlights
        if (blockId) {
            Services.instance.evidenceHighlightService.clearPreview();
            activeSuggestionIdx = null;
        }

        if (
            issue.status === "resolved" ||
            issue.status === "ignored" ||
            isDone
        ) {
            // Reopen
            const updated = await setIssueStatus(
                blockId,
                criterionId,
                issueIdx,
                "open",
                evaluationData,
            );
            if (isDone && doneFeedbackIdx >= 0) {
                // Clean up legacy done feedback if it exists
                const cleaned = await toggleIssueDone(
                    blockId,
                    criterionId,
                    issueIdx,
                    true,
                    doneFeedbackIdx,
                    updated,
                );
                onDataUpdate(cleaned);
            } else {
                onDataUpdate(updated);
            }
        } else {
            // Resolve directly via button
            const updated = await setIssueStatus(
                blockId,
                criterionId,
                issueIdx,
                "resolved",
                evaluationData,
            );
            onDataUpdate(updated);
        }
    }

    async function handleIgnoreIssue(e?: MouseEvent) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        if (blockId) {
            Services.instance.evidenceHighlightService.clearPreview();
            activeSuggestionIdx = null;
        }
        const updated = await setIssueStatus(
            blockId,
            criterionId,
            issueIdx,
            "ignored",
            evaluationData,
        );
        onDataUpdate(updated);
    }

    async function handleApplySuggestion(sIdx: number, e?: MouseEvent) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        const updated = await applySuggestion(
            blockId,
            criterionId,
            issueIdx,
            sIdx,
            evaluationData,
        );
        if (updated) {
            onDataUpdate(updated);
            activeSuggestionIdx = null;
        }
    }

    async function handleDismissSuggestion(sIdx: number, e?: MouseEvent) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        const updated = await setSuggestionStatus(
            blockId,
            criterionId,
            issueIdx,
            sIdx,
            "dismissed",
            evaluationData,
        );
        onDataUpdate(updated);
        if (activeSuggestionIdx === sIdx) {
            if (blockId)
                Services.instance.evidenceHighlightService.clearPreview();
            activeSuggestionIdx = null;
        }
    }

    async function handleReactivateSuggestion(sIdx: number, e?: MouseEvent) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        const updated = await setSuggestionStatus(
            blockId,
            criterionId,
            issueIdx,
            sIdx,
            "pending",
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

    function clickOutsideAction(node: HTMLElement) {
        const handleClick = (e: MouseEvent) => {
            // Wait for next tick so button click doesn't immediately close it
            setTimeout(() => {
                const target = e.target as HTMLElement;

                // If they clicked outside the block entirely, OR they clicked inside the block
                // but NOT on a suggestion item/card or counterargument block, we deselect.
                const isOutsideIssueBlock = !node.contains(target);
                const isInsideInteractable = target.closest?.(
                    ".lda-suggestion-item, .lda-suggestion-card",
                );

                if (
                    (isOutsideIssueBlock || !isInsideInteractable) &&
                    activeSuggestionIdx !== null
                ) {
                    activeSuggestionIdx = null;
                    if (blockId)
                        Services.instance.evidenceHighlightService.clearPreview();
                }
            }, 0);
        };
        const doc = parent.document || document;
        doc.addEventListener("click", handleClick, true);
        return {
            destroy() {
                doc.removeEventListener("click", handleClick, true);
            },
        };
    }
</script>

<div
    class="lda-issue-block bg-white dark:bg-gray-800 p-2 rounded border {isDone
        ? 'lda-issue-done'
        : ''} {isIgnored ? 'lda-issue-ignored opacity-60 bg-gray-50' : ''}"
    style="border-color: var(--ls-border-color);"
    use:clickOutsideAction
>
    <div class="lda-issue-header flex items-center justify-between mb-1">
        <div class="flex items-center gap-2">
            <span
                class="text-sm flex items-start"
                style={isDone || isIgnored
                    ? "opacity: 0.8; font-weight: normal;"
                    : "font-weight: 600;"}
            >
                {#if isDone}
                    <span
                        class="lda-large-icon text-green-600 flex items-center shrink-0"
                        style="margin-right: 12px; margin-top: 2px;"
                        title="Resolved">{@html ICONS.checkCircle}</span
                    >
                {:else if isIgnored}
                    <span
                        class="lda-large-icon text-red-500 flex items-center shrink-0"
                        style="margin-right: 12px; margin-top: 2px;"
                        title="Ignored">{@html ICONS.ban}</span
                    >
                {/if}
                <span>{issue.description}</span>
            </span>
            {#if issue.impact && issue.impact !== "low" && !isDone && !isIgnored}
                <span
                    class="lda-impact-tag lda-impact-{issue.impact}"
                    title={issue.impact === "high"
                        ? "High Impact"
                        : "Medium Impact"}
                    aria-label={issue.impact === "high"
                        ? "High Impact"
                        : "Medium Impact"}
                    >{issue.impact === "high" ? "H" : "M"}</span
                >
            {/if}
        </div>

        <div class="lda-issue-toolbar flex items-center gap-1">
            {#if isDone || isIgnored}
                <button
                    type="button"
                    class="lda-done-toggle opacity-70 hover:opacity-100"
                    use:genericClick={handleToggleDone}
                    title="Reopen issue"
                >
                    {@html ICONS.undo}
                </button>
            {:else}
                <button
                    type="button"
                    class="lda-done-toggle text-green-600 opacity-50 hover:opacity-100"
                    use:genericClick={handleToggleDone}
                    title="Mark as resolved"
                >
                    {@html ICONS.checkCircle}
                </button>
                <button
                    type="button"
                    class="lda-done-toggle text-red-500 opacity-50 hover:opacity-100"
                    use:genericClick={handleIgnoreIssue}
                    title="Ignore issue"
                >
                    {@html ICONS.ban}
                </button>
            {/if}
        </div>
    </div>

    {#if !isDone && !isIgnored}
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
                                    {#if suggestion.status === "dismissed"}
                                        <div
                                            class="lda-suggestion-card lda-suggestion-dismissed bg-gray-50 opacity-60 p-2 flex justify-between items-center text-xs border rounded mb-1"
                                        >
                                            <span
                                                class="italic text-gray-500 line-through"
                                                >Option {String.fromCharCode(
                                                    65 + i,
                                                )} dismissed</span
                                            >
                                            <button
                                                type="button"
                                                class="lda-action-btn-icon hover:text-blue-600"
                                                title="Reactivate"
                                                use:genericClick={(e) =>
                                                    handleReactivateSuggestion(
                                                        i,
                                                        e,
                                                    )}
                                            >
                                                {@html ICONS.undo}
                                            </button>
                                        </div>
                                    {:else}
                                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                                        <div
                                            class="lda-suggestion-card {activeSuggestionIdx ===
                                            i
                                                ? 'lda-suggestion-card--active'
                                                : ''} {suggestion.status ===
                                            'accepted'
                                                ? 'lda-suggestion-accepted border-green-500 bg-green-50'
                                                : ''} cursor-pointer transition-all duration-200"
                                            use:genericClick={() => {
                                                if (
                                                    suggestion.status !==
                                                    "accepted"
                                                )
                                                    toggleSuggestionPreview(
                                                        i,
                                                        suggestion,
                                                    );
                                            }}
                                        >
                                            <div
                                                class="lda-suggestion-card-header"
                                            >
                                                <span
                                                    class="lda-suggestion-label font-semibold {suggestion.status ===
                                                    'accepted'
                                                        ? 'text-green-700'
                                                        : ''}"
                                                >
                                                    Option {String.fromCharCode(
                                                        65 + i,
                                                    )}
                                                    {suggestion.status ===
                                                    "accepted"
                                                        ? "✓ Accepted"
                                                        : ""}
                                                </span>
                                            </div>
                                            <div
                                                class="lda-suggestion-card-body"
                                            >
                                                {#if suggestion.selector?.exact}
                                                    <span
                                                        class="lda-suggestion-target italic opacity-75 {suggestion.status ===
                                                        'accepted'
                                                            ? 'line-through text-green-800'
                                                            : ''}"
                                                        >"{suggestion.selector
                                                            .exact}"</span
                                                    > ->
                                                {/if}
                                                {#if suggestion.proposed_text}
                                                    <span
                                                        class="lda-suggestion-proposal bg-blue-100 {suggestion.status ===
                                                        'accepted'
                                                            ? 'bg-green-200 text-green-900 border border-green-400'
                                                            : ''} dark:bg-blue-900 px-1 rounded"
                                                        >{suggestion.proposed_text}</span
                                                    >
                                                {/if}
                                                <div
                                                    class="lda-suggestion-rationale text-xs opacity-75 mt-1 {suggestion.status ===
                                                    'accepted'
                                                        ? 'text-green-800'
                                                        : ''}"
                                                >
                                                    {suggestion.rationale}
                                                </div>

                                                {#if activeSuggestionIdx === i && suggestion.status !== "accepted"}
                                                    <div
                                                        class="lda-suggestion-actions mt-2 flex justify-end gap-2"
                                                        transition:slide|local
                                                    >
                                                        <button
                                                            type="button"
                                                            class="lda-action-btn flex items-center justify-center w-6 h-6 rounded shrink-0 border border-red-200 text-red-600 hover:bg-red-50 p-0"
                                                            title="Dismiss"
                                                            use:genericClick={(
                                                                e,
                                                            ) =>
                                                                handleDismissSuggestion(
                                                                    i,
                                                                    e,
                                                                )}
                                                        >
                                                            <span
                                                                class="scale-125 flex"
                                                                >{@html ICONS.close}</span
                                                            >
                                                        </button>
                                                        <button
                                                            type="button"
                                                            class="lda-action-btn flex items-center justify-center w-6 h-6 rounded shrink-0 border border-green-500 text-green-700 bg-green-50 hover:bg-green-100 p-0"
                                                            title="Apply"
                                                            use:genericClick={(
                                                                e,
                                                            ) =>
                                                                handleApplySuggestion(
                                                                    i,
                                                                    e,
                                                                )}
                                                        >
                                                            <span
                                                                class="scale-125 flex"
                                                                >{@html ICONS.check}</span
                                                            >
                                                        </button>
                                                    </div>
                                                {/if}
                                            </div>
                                        </div>
                                    {/if}
                                {/each}
                            </div>
                        {:else}
                            <ul
                                class="lda-suggestions-list list-disc pl-4 mt-1"
                            >
                                {#each issue.suggestions as suggestion, i}
                                    {#if suggestion.status === "dismissed"}
                                        <li
                                            class="lda-suggestion-item lda-suggestion-dismissed text-gray-500 italic pb-1 flex justify-between"
                                        >
                                            <span class="line-through flex-1"
                                                >Suggestion dismissed</span
                                            >
                                            <button
                                                type="button"
                                                class="lda-action-btn-icon hover:text-blue-600"
                                                title="Reactivate"
                                                use:genericClick={(e) =>
                                                    handleReactivateSuggestion(
                                                        i,
                                                        e,
                                                    )}
                                            >
                                                {@html ICONS.undo}
                                            </button>
                                        </li>
                                    {:else}
                                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                                        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                                        <li
                                            class="lda-suggestion-item pb-1 transition-colors {suggestion.status ===
                                            'accepted'
                                                ? 'text-green-700 font-medium'
                                                : 'cursor-pointer'} {activeSuggestionIdx ===
                                            i
                                                ? 'lda-suggestion-item--active'
                                                : ''}"
                                            use:genericClick={() => {
                                                if (
                                                    suggestion.status !==
                                                    "accepted"
                                                )
                                                    toggleSuggestionPreview(
                                                        i,
                                                        suggestion,
                                                    );
                                            }}
                                        >
                                            {#if suggestion.selector?.exact}
                                                <span
                                                    class="lda-suggestion-target italic opacity-75 {suggestion.status ===
                                                    'accepted'
                                                        ? 'line-through text-green-800'
                                                        : ''}"
                                                    >"{suggestion.selector
                                                        .exact}"</span
                                                > ->
                                            {/if}
                                            {#if suggestion.proposed_text}
                                                <span
                                                    class="lda-suggestion-proposal bg-blue-100 {suggestion.status ===
                                                    'accepted'
                                                        ? 'bg-green-200 text-green-900 border border-green-400'
                                                        : ''} dark:bg-blue-900 px-1 rounded"
                                                    >{suggestion.proposed_text}</span
                                                >
                                            {/if}
                                            {#if suggestion.status === "accepted"}
                                                <span
                                                    class="ml-1 text-[10px] text-green-600 uppercase font-bold tracking-wider"
                                                    >✓ Accepted</span
                                                >
                                            {/if}
                                            <div
                                                class="lda-suggestion-rationale text-xs opacity-75 {suggestion.status ===
                                                'accepted'
                                                    ? 'text-green-800'
                                                    : ''}"
                                            >
                                                {suggestion.rationale}
                                            </div>

                                            {#if activeSuggestionIdx === i && suggestion.status !== "accepted"}
                                                <div
                                                    class="lda-suggestion-actions mt-2 flex justify-start gap-2"
                                                    transition:slide|local
                                                >
                                                    <button
                                                        type="button"
                                                        class="lda-action-btn flex items-center justify-center w-6 h-6 rounded shrink-0 border border-green-500 text-green-700 bg-green-50 hover:bg-green-100 p-0"
                                                        title="Apply"
                                                        use:genericClick={(e) =>
                                                            handleApplySuggestion(
                                                                i,
                                                                e,
                                                            )}
                                                    >
                                                        <span
                                                            class="scale-100 flex"
                                                            >{@html ICONS.check}</span
                                                        >
                                                    </button>
                                                    <button
                                                        type="button"
                                                        class="lda-action-btn flex items-center justify-center w-6 h-6 rounded shrink-0 border border-red-200 text-red-600 hover:bg-red-50 p-0"
                                                        title="Dismiss"
                                                        use:genericClick={(e) =>
                                                            handleDismissSuggestion(
                                                                i,
                                                                e,
                                                            )}
                                                    >
                                                        <span
                                                            class="scale-100 flex"
                                                            >{@html ICONS.close}</span
                                                        >
                                                    </button>
                                                </div>
                                            {/if}
                                        </li>
                                    {/if}
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
                                    class="lda-feedback-item bg-gray-50 p-2 rounded text-xs border {item
                                        .fb.type === 'ai_reply'
                                        ? 'lda-feedback-item--ai bg-blue-50 border-blue-200'
                                        : ''}"
                                    style="border-color: var(--ls-border-color);"
                                >
                                    <div class="flex justify-between mb-[2px]">
                                        <span
                                            class="font-semibold text-gray-600 capitalize opacity-80"
                                        >
                                            {item.fb.type === "ai_reply"
                                                ? "🤖 AI Reply"
                                                : item.fb.type.replace(
                                                      "_",
                                                      " ",
                                                  )}
                                        </span>
                                        <div class="flex gap-2 items-center">
                                            <span class="opacity-50 text-[10px]"
                                                >{new Date(
                                                    item.fb.created_at,
                                                ).toLocaleDateString()}</span
                                            >
                                            {#if item.fb.type === "change_proposal"}
                                                <button
                                                    type="button"
                                                    class="lda-action-btn-icon opacity-50 hover:opacity-100"
                                                    title="Edit proposal"
                                                    use:genericClick={() =>
                                                        startEditFeedback(
                                                            item.i,
                                                            item.fb.text,
                                                        )}>✎</button
                                                >
                                                <button
                                                    type="button"
                                                    class="lda-action-btn-icon opacity-50 hover:opacity-100 text-blue-500"
                                                    title="Discuss with AI"
                                                    use:genericClick={handleDiscussProposal}
                                                    >💬</button
                                                >
                                            {/if}
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
                                    {#if editingFeedbackIdx === item.i}
                                        <div class="mt-2 text-gray-800">
                                            <textarea
                                                class="lda-feedback-input w-full p-2 text-xs border rounded mb-2 bg-white"
                                                rows="2"
                                                bind:value={editingFeedbackText}
                                                style="border-color: var(--ls-border-color); color: var(--ls-primary-text-color);"
                                            ></textarea>
                                            <div class="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    class="lda-action-btn"
                                                    use:genericClick={cancelEditFeedback}
                                                    >Cancel</button
                                                >
                                                <button
                                                    type="button"
                                                    class="lda-action-btn border-blue-500 text-blue-600 bg-blue-50"
                                                    use:genericClick={() =>
                                                        handleSaveEditedFeedback(
                                                            item.i,
                                                        )}>Save</button
                                                >
                                            </div>
                                        </div>
                                    {:else}
                                        <div class="text-gray-800">
                                            {item.fb.text}
                                        </div>
                                    {/if}
                                </div>
                            {/each}

                            {#if isAiGenerating}
                                <div
                                    class="lda-feedback-item lda-feedback-item--ai bg-gray-50 p-2 rounded text-xs border animate-pulse opacity-70"
                                >
                                    <div class="flex items-center gap-2">
                                        <span class="font-semibold"
                                            >🤖 AI is thinking...</span
                                        >
                                    </div>
                                </div>
                            {/if}
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
                            for={feedbackInputId}
                            class="block text-xs font-semibold opacity-80 capitalize mb-1"
                            >{activeFeedbackInput.replace("_", " ")}</label
                        >
                        <textarea
                            id={feedbackInputId}
                            class="lda-feedback-input w-full p-2 text-xs border rounded mb-2 bg-white"
                            style="border-color: var(--ls-border-color); color: var(--ls-primary-text-color);"
                            rows="2"
                            placeholder={activeFeedbackInput === "reply"
                                ? "Add your reply (sends to AI)..."
                                : "What would you change?"}
                            bind:value={feedbackInputText}
                        ></textarea>
                        <div class="flex justify-between items-center mt-1">
                            <div
                                class="flex gap-3 items-center text-gray-500"
                                style="font-size: 11px;"
                            >
                                <label
                                    class="flex items-center gap-[4px] cursor-pointer"
                                    title="Include complete document instead of just the relevant block"
                                >
                                    <input
                                        type="checkbox"
                                        bind:checked={
                                            contextScope.includeDocument
                                        }
                                        style="transform: scale(0.9); margin: 0;"
                                    /> Document
                                </label>
                                <label
                                    class="flex items-center gap-[4px] cursor-pointer"
                                    title="Include complete block eval instead of just the current issue"
                                >
                                    <input
                                        type="checkbox"
                                        bind:checked={
                                            contextScope.includeEvaluation
                                        }
                                        style="transform: scale(0.9); margin: 0;"
                                    /> Evaluation
                                </label>
                            </div>
                            <div class="flex gap-2">
                                <button
                                    type="button"
                                    class="lda-action-btn lda-action-btn-sm"
                                    use:genericClick={cancelFeedbackInput}
                                    >Cancel</button
                                >
                                <button
                                    type="button"
                                    class="lda-action-btn lda-action-btn-sm border-blue-500 text-blue-600 bg-blue-50"
                                    use:genericClick={() =>
                                        handleSaveFeedback(
                                            activeFeedbackInput!,
                                            feedbackInputText,
                                        )}
                                    >{activeFeedbackInput === "reply"
                                        ? "Send to AI"
                                        : "Save Proposal"}</button
                                >
                            </div>
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
                        {#if !hasChangeProposal}
                            <button
                                type="button"
                                class="lda-action-btn"
                                use:genericClick={() =>
                                    openFeedbackInput("change_proposal")}
                            >
                                ✎ Propose Change
                            </button>
                        {/if}
                    </div>
                {/if}
            {/if}
        </div>
        <!-- /slide -->
    {/if}
    <!-- /!isDone -->
</div>
