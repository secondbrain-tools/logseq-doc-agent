/**
 * Internal use case types for reasoning operations
 */

export interface ReasoningRequest {
  ratingId: string;
  context?: string;
}

export interface ReasoningResponse {
  success: boolean;
  reasoning?: string;
  error?: string;
}