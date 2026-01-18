/**
 * Ports for feedback-related operations
 */

import type { FeedbackRating, CategoryRating, DetailedRating } from '../../domain/entities';

export interface FeedbackRepository {
  saveRating(rating: FeedbackRating): Promise<FeedbackRating>;
  getRating(id: string): Promise<FeedbackRating | null>;
  getAllRatings(): Promise<FeedbackRating[]>;
  deleteRating(id: string): Promise<boolean>;
}

export interface FeedbackTargetRepository {
  findFeedbackTargets(criteria?: any): Promise<any[]>;
  getTargetById(id: string): Promise<any>;
}

export interface RatingCalculator {
  calculateOverallRating(detailedRatings: any[]): number;
  calculateWeightedRating(ratings: any[], weights: number[]): number;
  
  // New methods for the enhanced feedback structure
  calculateOverallRatingFromFeedback(feedbackRating: FeedbackRating): number;
  calculateCategoryRating(categoryRating: CategoryRating): number;
  calculateOverallRatingFromCategories(categoryRatings: CategoryRating[]): number;
  
  // Legacy method for backward compatibility
  calculateOverallRatingFromLegacy(detailedRatings: DetailedRating[]): number;
}

export interface FeedbackParser {
  parseFromLogseqData(id: string, logseqData: any, targetElementId?: string): FeedbackRating;
  parseFromJsonString(id: string, jsonString: string, targetElementId?: string): FeedbackRating;
  toLogseqFormat(feedbackRating: FeedbackRating): any;
  validateLogseqData(data: any): boolean;
}