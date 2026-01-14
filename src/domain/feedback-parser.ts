/**
 * Domain parser for Logseq feedback JSON structure
 * Handles parsing of the nested feedback format into domain entities
 */

import type { FeedbackRating, CategoryRating, CriterionRating } from './entities';
import { RatingValue, RatingCategory, FeedbackText, CriterionName } from './value-objects';

/**
 * Raw Logseq feedback structure interface
 */
export interface LogseqFeedbackData {
  [categoryName: string]: {
    [criterionName: string]: {
      rating: number;
      feedback: string;
    };
  };
}

/**
 * Parser class for converting Logseq feedback JSON to domain entities
 */
export class FeedbackParser {
  /**
   * Parse Logseq feedback data into a FeedbackRating domain entity
   */
  static parseFromFeedbackData(
    id: string,
    feedbackData: LogseqFeedbackData,
    targetElementId?: string
  ): FeedbackRating {
    const categoryRatings: CategoryRating[] = [];
    let allRatings: number[] = [];



    // Parse each category
    for (const [categoryName, criteria] of Object.entries(feedbackData)) {
      const criteriaRatings: CriterionRating[] = [];
      const categoryRatingValues: number[] = [];

      // Parse each criterion within the category
      for (const [criterionName, criterionData] of Object.entries(criteria)) {
        const ratingValue = RatingValue.fromNumber(criterionData.rating);
        const feedbackText = FeedbackText.fromString(criterionData.feedback);
        const criterion = CriterionName.fromString(criterionName);

        criteriaRatings.push({
          criterion: criterion.toString(),
          rating: ratingValue.value,
          feedback: feedbackText.toString()
        });
        if (ratingValue.value > 0) {
            categoryRatingValues.push(ratingValue.value);
            allRatings.push(ratingValue.value);
        }
      }

      // Calculate category overall rating (average of criteria in this category)
      const categoryOverallRating = this.calculateAverage(categoryRatingValues);

      categoryRatings.push({
        category: categoryName,
        overallRating: categoryOverallRating,
        criteriaRatings
      });
    }

    // Calculate overall feedback rating (average of all criteria ratings)
    const overallRating = this.calculateAverage(allRatings);

    return {
      id,
      overallRating,
      categoryRatings,
      timestamp: new Date(),
      targetElementId
    };
  }

  /**
   * Parse from JSON string
   */
  static parseFromJsonString(
    id: string,
    jsonString: string,
    targetElementId?: string
  ): FeedbackRating {
    try {
      const feedbackData: LogseqFeedbackData = JSON.parse(jsonString);
      return this.parseFromFeedbackData(id, feedbackData, targetElementId);
    } catch (error) {
      throw new Error(`Failed to parse feedback JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert FeedbackRating back to Logseq format
   */
  static toLogseqFormat(feedbackRating: FeedbackRating): LogseqFeedbackData {
    const result: LogseqFeedbackData = {};

    for (const categoryRating of feedbackRating.categoryRatings) {
      result[categoryRating.category] = {};
      
      for (const criterionRating of categoryRating.criteriaRatings) {
        result[categoryRating.category][criterionRating.criterion] = {
          rating: criterionRating.rating,
          feedback: criterionRating.feedback
        };
      }
    }

    return result;
  }

  /**
   * Calculate average of an array of numbers
   */
  private static calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    const sum = numbers.reduce((acc, val) => acc + val, 0);
    return Math.round((sum / numbers.length) * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Validate Logseq feedback data structure
   */
  static validateLogseqData(data: any): data is LogseqFeedbackData {
    if (!data || typeof data !== 'object') {
      return false;
    }

    for (const [categoryName, category] of Object.entries(data)) {
      if (typeof categoryName !== 'string' || !category || typeof category !== 'object') {
        return false;
      }

      for (const [criterionName, criterion] of Object.entries(category)) {
        if (typeof criterionName !== 'string' || !criterion || typeof criterion !== 'object') {
          return false;
        }

        const criterionData = criterion as any;
        if (
          typeof criterionData.rating !== 'number' ||
          criterionData.rating < 0 ||
          criterionData.rating > 4 ||
          typeof criterionData.feedback !== 'string'
        ) {
          return false;
        }
      }
    }

    return true;
  }
}