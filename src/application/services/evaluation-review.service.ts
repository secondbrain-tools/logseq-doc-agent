import type { LogseqApi } from "../../application/ports/logseq-ports";
import {
  LDA_EVALUATION_PROPERTY,
  LDA_EVALUATION_PROPERTY_CAMEL,
} from "../../domain/logseq/properties";
import type { BlockEvaluation } from "../../domain/evaluation/entity";
import type { z } from "zod";
import type { UserFeedbackSchema, UserFeedback } from "../../domain/evaluation/entity";

export class EvaluationReviewService {
  constructor(private readonly logseq: LogseqApi) {}

  /**
   * Adds a user feedback item to a specific criterion or issue within a block's evaluation.
   */
  async addFeedback(
    blockUuid: string,
    criterionId: string,
    feedback: UserFeedback,
    issueIdx?: number,
  ): Promise<void> {
    await this.mutateEvaluation(blockUuid, (evaluation) => {
      const criterion = evaluation.results.find((r) => r.criterion_id === criterionId);
      if (!criterion) throw new Error(`Criterion ${criterionId} not found in evaluation`);

      if (typeof issueIdx === "number") {
        // Issue-level feedback
        if (!criterion.issues || !criterion.issues[issueIdx]) {
          throw new Error(`Issue at index ${issueIdx} not found in criterion ${criterionId}`);
        }
        const issue = criterion.issues[issueIdx];
        if (!issue.user_feedback) issue.user_feedback = [];
        issue.user_feedback.push(feedback);
      } else {
        // Criterion-level feedback (e.g. pre-commitment score/suggestion)
        if (!criterion.user_feedback) criterion.user_feedback = [];
        criterion.user_feedback.push(feedback);
      }
    });
  }

  /**
   * Deletes a user feedback item from a specific criterion or issue.
   */
  async deleteFeedback(
    blockUuid: string,
    criterionId: string,
    feedbackIdx: number,
    issueIdx?: number,
  ): Promise<void> {
    await this.mutateEvaluation(blockUuid, (evaluation) => {
      const criterion = evaluation.results.find((r) => r.criterion_id === criterionId);
      if (!criterion) throw new Error(`Criterion ${criterionId} not found in evaluation`);

      if (typeof issueIdx === "number") {
        // Issue-level feedback
        if (!criterion.issues || !criterion.issues[issueIdx]) {
          throw new Error(`Issue at index ${issueIdx} not found in criterion ${criterionId}`);
        }
        const issue = criterion.issues[issueIdx];
        if (issue.user_feedback) {
          issue.user_feedback.splice(feedbackIdx, 1);
        }
      } else {
        // Criterion-level feedback
        if (criterion.user_feedback) {
          criterion.user_feedback.splice(feedbackIdx, 1);
        }
      }
    });
  }

  /**
   * Internal helper to read, modify, and write back the evaluation property.
   */
  public async mutateEvaluation(
    blockUuid: string,
    mutator: (evaluation: BlockEvaluation) => void,
  ): Promise<void> {
    const block = await this.logseq.getBlock(blockUuid);
    if (!block) throw new Error(`Block ${blockUuid} not found`);

    const evalString =
      block.properties?.[LDA_EVALUATION_PROPERTY.replace("logseq-doc-agent.", "")] ||
      block.properties?.[LDA_EVALUATION_PROPERTY] ||
      block.properties?.[LDA_EVALUATION_PROPERTY_CAMEL];

    if (!evalString)
      throw new Error(
        `Block ${blockUuid} has no evaluation property. Looked for: ${LDA_EVALUATION_PROPERTY_CAMEL}`,
      );

    let evaluation: BlockEvaluation;
    try {
      evaluation = typeof evalString === "string" ? JSON.parse(evalString) : evalString;
    } catch (e) {
      throw new Error(`Failed to parse evaluation JSON for block ${blockUuid}`);
    }

    mutator(evaluation);

    await this.logseq.upsertBlockProperty(
      blockUuid,
      LDA_EVALUATION_PROPERTY,
      JSON.stringify(evaluation),
    );
  }
}
