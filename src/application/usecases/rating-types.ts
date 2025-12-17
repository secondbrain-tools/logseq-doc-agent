/**
 * Internal use case types for rating operations
 */

export interface RatingRequest {
  elementId: string;
  overallRating: number;
  detailedRatings?: Array<{
    category: string;
    rating: number;
  }>;
}

export interface RatingResponse {
  success: boolean;
  ratingId?: string;
  error?: string;
}