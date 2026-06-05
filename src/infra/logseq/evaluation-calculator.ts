import type { EvaluationCalculator } from "../../application/ports/evaluation-ports";
import type { BlockEvaluation, CriterionResult } from "../../domain/evaluation/entity";

/**
 * Concrete implementation of EvaluationCalculator for Logseq plugins
 */
export class LogseqEvaluationCalculator implements EvaluationCalculator {
  calculateOverallScore(evaluation: BlockEvaluation): number {
    if (evaluation.summary?.overall_score != null) {
      return evaluation.summary.overall_score;
    }

    if (!evaluation.results || evaluation.results.length === 0) {
      return 0;
    }

    const sum = evaluation.results.reduce((acc, criterion) => acc + criterion.score, 0);
    return Math.round((sum / evaluation.results.length) * 100) / 100;
  }

  calculateCategoryScore(criteriaResults: CriterionResult[]): number {
    if (!criteriaResults || criteriaResults.length === 0) {
      return 0;
    }

    const sum = criteriaResults.reduce((acc, criterion) => acc + criterion.score, 0);
    return Math.round((sum / criteriaResults.length) * 100) / 100;
  }
}
