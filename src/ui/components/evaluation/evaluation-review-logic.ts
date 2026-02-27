import type { BlockEvaluation, CriterionResult, Issue } from "../../../domain/evaluation/entity";
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
    if (blockId) {
        Services.instance.evaluationReviewService
            .deleteFeedback(blockId, criterionId, feedbackIdx, issueIdx)
            .catch((err) => console.error("Failed to delete feedback:", err));
    }

    const cloned = JSON.parse(JSON.stringify(evaluationData));
    for (const res of cloned.results) {
        if (res.criterion_id === criterionId && res.issues?.[issueIdx]) {
            const issue = res.issues[issueIdx] as Issue;
            if (issue.user_feedback) {
                issue.user_feedback.splice(feedbackIdx, 1);
            }
            break;
        }
    }
    return cloned;
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
