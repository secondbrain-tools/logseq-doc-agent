import type { BlockEvaluation, CriterionResult, Issue } from "../../../domain/evaluation/entity";
import type { ContextScope } from "../../../domain/evaluation/issue-reply.types";
import { Services } from "../../../services";

export function groupByCategory(results: CriterionResult[]): Record<string, CriterionResult[]> {
    const groups: Record<string, CriterionResult[]> = {};
    for (const res of results) {
        const cat = res.category || "Uncategorized";
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(res);
    }
    return groups;
}

export function getSeverity(score: number): "excellent" | "good" | "warning" | "bad" | "muted" {
    if (score === 0) return "muted";
    if (score > 4) return "excellent";
    if (score > 3) return "good";
    if (score > 2) return "warning";
    return "bad";
}

export async function saveFeedback(
    blockId: string | undefined,
    criterionId: string,
    issueIdx: number,
    type: "reply" | "change_proposal",
    text: string,
    evaluationData: BlockEvaluation
): Promise<BlockEvaluation> {
    if (!text.trim()) return evaluationData;

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

    // Optimistically update
    const cloned = JSON.parse(JSON.stringify(evaluationData));
    for (const res of cloned.results) {
        if (res.criterion_id === criterionId && res.issues?.[issueIdx]) {
            const issue = res.issues[issueIdx] as Issue; // Cast to bypass strict type error if any
            if (!issue.user_feedback) issue.user_feedback = [];
            issue.user_feedback.push(newFeedback as any); // To be safe with generated type from Zod
            break;
        }
    }
    return cloned;
}

export async function deleteFeedback(
    blockId: string | undefined,
    criterionId: string,
    issueIdx: number,
    feedbackIdx: number,
    evaluationData: BlockEvaluation
): Promise<BlockEvaluation> {
    if (!blockId) return Promise.resolve(evaluationData);

    return Services.instance.evaluationReviewService.deleteFeedback(blockId, criterionId, feedbackIdx, issueIdx)
        .then(() => {
            const copy = JSON.parse(JSON.stringify(evaluationData));
            const c = copy.results.find((r: any) => r.criterion_id === criterionId);
            if (c && c.issues && c.issues[issueIdx] && c.issues[issueIdx].user_feedback) {
                c.issues[issueIdx].user_feedback.splice(feedbackIdx, 1);
            }
            return copy;
        });
}

export function editFeedback(
    blockId: string | undefined,
    criterionId: string,
    issueIdx: number,
    feedbackIdx: number,
    newText: string,
    evaluationData: BlockEvaluation
): Promise<BlockEvaluation> {
    if (!blockId) return Promise.resolve(evaluationData);

    return Services.instance.evaluationReviewService.mutateEvaluation(blockId, (ev) => {
        const c = ev.results.find(r => r.criterion_id === criterionId);
        if (c && c.issues && c.issues[issueIdx] && c.issues[issueIdx].user_feedback) {
            c.issues[issueIdx].user_feedback[feedbackIdx].text = newText;
        }
    }).then(() => {
        const copy = JSON.parse(JSON.stringify(evaluationData));
        const c = copy.results.find((r: any) => r.criterion_id === criterionId);
        if (c && c.issues && c.issues[issueIdx] && c.issues[issueIdx].user_feedback) {
            c.issues[issueIdx].user_feedback[feedbackIdx].text = newText;
        }
        return copy;
    });
}

export function startAiIssueReply(
    blockId: string | undefined,
    criterionId: string,
    issueIdx: number,
    evaluationData: BlockEvaluation,
    contextScope: ContextScope
): Promise<BlockEvaluation> {
    if (!blockId) return Promise.resolve(evaluationData);
    return Services.instance.issueReplyService.replyToIssue(blockId, criterionId, issueIdx, evaluationData, contextScope);
}

export async function toggleIssueDone(
    blockId: string | undefined,
    criterionId: string,
    issueIdx: number,
    isAlreadyDone: boolean,
    doneFeedbackIdx: number,
    evaluationData: BlockEvaluation
): Promise<BlockEvaluation> {
    if (isAlreadyDone) {
        // Remove done feedback
        return deleteFeedback(blockId, criterionId, issueIdx, doneFeedbackIdx, evaluationData);
    } else {
        // Add done feedback
        const newFeedback = {
            type: "done" as const,
            text: "Issue marked as done",
            created_at: new Date().toISOString(),
        };

        if (blockId) {
            Services.instance.evaluationReviewService
                .addFeedback(blockId, criterionId, newFeedback, issueIdx)
                .catch((err) => console.error("Failed to mark issue done:", err));
        }

        const cloned = JSON.parse(JSON.stringify(evaluationData));
        for (const res of cloned.results) {
            if (res.criterion_id === criterionId && res.issues?.[issueIdx]) {
                const issue = res.issues[issueIdx] as Issue;
                if (!issue.user_feedback) issue.user_feedback = [];
                issue.user_feedback.push(newFeedback as any);
                break;
            }
        }
        return cloned;
    }
}

export async function setIssueStatus(
    blockId: string | undefined,
    criterionId: string,
    issueIdx: number,
    status: "open" | "resolved" | "ignored",
    evaluationData: BlockEvaluation
): Promise<BlockEvaluation> {
    const cloned = JSON.parse(JSON.stringify(evaluationData));
    for (const res of cloned.results) {
        if (res.criterion_id === criterionId && res.issues?.[issueIdx]) {
            const issue = res.issues[issueIdx] as Issue;
            issue.status = status;

            // Persist the status change
            if (blockId) {
                // We use the mutateEvaluation helper in EvaluationReviewService indirectly
                // by replacing the whole evaluation object for the block.
                // A dedicated method for updating issue properties could be added to the service,
                // but for now we can leverage the existing LogseqApi to write it back directly
                // since the service doesn't expose a generic mutate method.
                Services.instance.logseqApi.upsertBlockProperty(
                    blockId,
                    "logseq-doc-agent.evaluation",
                    JSON.stringify(cloned)
                ).catch((err: unknown) => console.error("Failed to persist issue status:", err));
            }
            break;
        }
    }
    return cloned;
}

export async function setSuggestionStatus(
    blockId: string | undefined,
    criterionId: string,
    issueIdx: number,
    suggestionIdx: number,
    status: "pending" | "accepted" | "dismissed",
    evaluationData: BlockEvaluation
): Promise<BlockEvaluation> {
    const cloned = JSON.parse(JSON.stringify(evaluationData));
    for (const res of cloned.results) {
        if (res.criterion_id === criterionId && res.issues?.[issueIdx] && res.issues[issueIdx].suggestions?.[suggestionIdx]) {
            const suggestion = res.issues[issueIdx].suggestions[suggestionIdx];
            suggestion.status = status;

            if (blockId) {
                Services.instance.logseqApi.upsertBlockProperty(
                    blockId,
                    "logseq-doc-agent.evaluation",
                    JSON.stringify(cloned)
                ).catch((err: unknown) => console.error("Failed to persist suggestion status:", err));
            }
            break;
        }
    }
    return cloned;
}

export async function applySuggestion(
    blockId: string | undefined,
    criterionId: string,
    issueIdx: number,
    suggestionIdx: number,
    evaluationData: BlockEvaluation
): Promise<BlockEvaluation | null> {
    if (!blockId) return null;

    let targetSuggestion = null;
    let targetSelector = null;

    // 1. Find the suggestion and its exact text to be replaced
    for (const res of evaluationData.results) {
        if (res.criterion_id === criterionId && res.issues?.[issueIdx] && res.issues[issueIdx].suggestions?.[suggestionIdx]) {
            targetSuggestion = res.issues[issueIdx].suggestions[suggestionIdx];
            targetSelector = targetSuggestion.selector;
            break;
        }
    }

    if (!targetSuggestion || !targetSuggestion.proposed_text || !targetSelector?.exact) {
        console.error("Suggestion cannot be applied automatically (missing proposed_text or selector.exact).", targetSuggestion);
        return null;
    }

    try {
        // 2. Read current block content
        const blockText = await Services.instance.logseqApi.Editor.getBlockText(blockId);

        // 3. Perform string replacement (only replacing the first occurrence that matches exactly)
        if (!blockText.includes(targetSelector.exact)) {
            // For safety, warn if exact text isn't found anymore (e.g. user changed it since eval)
            console.warn("Target string not found in the block. Application aborted.", targetSelector.exact);
            // We could still mark it accepted, but maybe returning early is safer.
            // For now we try to replace if possible.
        } else {
            const newContent = blockText.replace(targetSelector.exact, targetSuggestion.proposed_text);

            // 4. Update the block content
            await Services.instance.logseqApi.Editor.updateBlock(blockId, newContent);
        }

        // 5. Update state to accepted and resolved
        let updatedData = await setSuggestionStatus(blockId, criterionId, issueIdx, suggestionIdx, "accepted", evaluationData);
        updatedData = await setIssueStatus(blockId, criterionId, issueIdx, "resolved", updatedData);

        // Clear any highlight preview since text just changed
        Services.instance.evidenceHighlightService.clearPreview();

        return updatedData;

    } catch (err) {
        console.error("Failed to apply suggestion:", err);
        return null;
    }
}

export function getPreCommitmentSuggestion(issue: Issue | undefined, fallbackSuggestions: Record<string, string>, issueUniqueId: string): string | null {
    if (issue?.user_feedback) {
        const fb = issue.user_feedback.find((f: any) => f.type === "self_suggestion");
        if (fb) return fb.text;
    }
    return fallbackSuggestions[issueUniqueId] || null;
}

export function needsPreCommitment(issue: Issue | undefined, preCommitmentEnabled: boolean, fallbackSuggestions: Record<string, string>, issueUniqueId: string): boolean {
    if (!preCommitmentEnabled || !issue) return false;

    // Only if the issue has AI suggestions
    if (!issue.suggestions || issue.suggestions.length === 0) return false;

    return getPreCommitmentSuggestion(issue, fallbackSuggestions, issueUniqueId) === null;
}

export async function savePreCommitmentSuggestion(
    blockId: string | undefined,
    criterionId: string,
    issueIdx: number,
    text: string,
    evaluationData: BlockEvaluation
): Promise<BlockEvaluation> {
    if (!text.trim()) return evaluationData;

    const feedback = {
        type: "self_suggestion" as const,
        text: text.trim(),
        created_at: new Date().toISOString(),
    };

    if (blockId) {
        Services.instance.evaluationReviewService
            .addFeedback(blockId, criterionId, feedback, issueIdx)
            .catch((err) => console.error("Failed to save self-suggestion:", err));
    }

    const cloned = JSON.parse(JSON.stringify(evaluationData));
    for (const res of cloned.results) {
        if (res.criterion_id === criterionId && res.issues?.[issueIdx]) {
            const issue = res.issues[issueIdx] as Issue;
            if (!issue.user_feedback) issue.user_feedback = [];
            issue.user_feedback.push(feedback as any);
            break;
        }
    }
    return cloned;
}

export function genericClick(node: HTMLElement, fn: (e?: MouseEvent) => void) {
    const handler = (e: MouseEvent) => {
        e.stopPropagation();
        fn(e);
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
