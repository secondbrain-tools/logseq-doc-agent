/**
 * Ports for evaluation-related operations
 */

import type { BlockEvaluation, CriterionResult } from "../../domain/evaluation/entity";

export interface EvaluationRepository {
  saveEvaluation(evaluation: BlockEvaluation): Promise<BlockEvaluation>;
  getEvaluation(id: string): Promise<BlockEvaluation | null>;
  getAllEvaluations(): Promise<BlockEvaluation[]>;
  deleteEvaluation(id: string): Promise<boolean>;
}

export interface EvaluationTargetRepository {
  findEvaluationTargets(criteria?: any): Promise<any[]>;
  getTargetById(id: string): Promise<any>;
}

export interface EvaluationCalculator {
  /**
   * Calculate overall score from BlockEvaluation structure
   * Falls back to computing average of criteria results if summary is missing
   */
  calculateOverallScore(evaluation: BlockEvaluation): number;

  /**
   * Calculate category rating from a set of criteria results
   */
  calculateCategoryScore(criteriaResults: CriterionResult[]): number;
}
