/**
 * Domain entities for the feedback rating system
 * These are pure domain entities that are framework-agnostic
 */

export interface FeedbackRating {
  id: string;
  overallRating: number;
  detailedRatings: DetailedRating[];
  timestamp: Date;
  targetElementId?: string;
}

export interface DetailedRating {
  category: string;
  rating: number;
  weight?: number;
}
