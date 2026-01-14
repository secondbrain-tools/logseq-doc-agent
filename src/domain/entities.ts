/**
 * Domain entities for the feedback rating system
 * These are pure domain entities that are framework-agnostic
 */

export interface FeedbackRating {
  id: string;
  overallRating: number;
  categoryRatings: CategoryRating[];
  timestamp: Date;
  targetElementId?: string;
}

export interface CategoryRating {
  category: string;
  overallRating: number;
  criteriaRatings: CriterionRating[];
}

export interface CriterionRating {
  criterion: string;
  rating: number;
  feedback: string;
}

// Legacy interface for backward compatibility
export interface DetailedRating {
  category: string;
  rating: number;
  weight?: number;
}
