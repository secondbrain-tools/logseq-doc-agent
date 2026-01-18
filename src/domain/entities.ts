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

export interface Prompt {
  id: string; // The UUID of the block
  content: string; // The text content of the prompt
  type: string; // Extensible type
}

export interface FeedbackPrompt extends Prompt {
  type: 'feedback';
  // Potential future expansion: criteria extracted from content or children
}
