/**
 * Internal use case types for feedback target operations
 */

export interface FeedbackTargetRequest {
  elementType?: 'block' | 'page' | 'graph';
  filterCriteria?: Record<string, any>;
}

export interface FeedbackTargetResponse {
  success: boolean;
  targets?: Array<{
    id: string;
    type: string;
    content: string;
    metadata?: Record<string, any>;
  }>;
  error?: string;
}