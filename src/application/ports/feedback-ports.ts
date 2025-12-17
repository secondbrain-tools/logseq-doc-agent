/**
 * Ports for feedback-related operations
 */

export interface FeedbackRepository {
  saveRating(rating: any): Promise<any>;
  getRating(id: string): Promise<any>;
  getAllRatings(): Promise<any[]>;
  deleteRating(id: string): Promise<boolean>;
}

export interface FeedbackTargetRepository {
  findFeedbackTargets(criteria?: any): Promise<any[]>;
  getTargetById(id: string): Promise<any>;
}

export interface RatingCalculator {
  calculateOverallRating(detailedRatings: any[]): number;
  calculateWeightedRating(ratings: any[], weights: number[]): number;
}