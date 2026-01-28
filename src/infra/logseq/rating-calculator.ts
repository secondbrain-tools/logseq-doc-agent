import type { RatingCalculator } from '../../application/ports';
import type { FeedbackRating, CategoryRating, DetailedRating } from '../../domain/rating';

/**
 * Concrete implementation of RatingCalculator for Logseq plugins
 */
export class LogseqRatingCalculator implements RatingCalculator {
  calculateOverallRating(detailedRatings: any[]): number {
    if (!detailedRatings || detailedRatings.length === 0) {
      return 0;
    }

    const sum = detailedRatings.reduce((acc, rating) => acc + rating.rating, 0);
    return Math.round(sum / detailedRatings.length);
  }

  calculateWeightedRating(ratings: any[], weights: number[]): number {
    if (!ratings || ratings.length === 0 || !weights || weights.length === 0) {
      return 0;
    }

    if (ratings.length !== weights.length) {
      console.warn('Number of ratings does not match number of weights');
      return this.calculateOverallRating(ratings);
    }

    const weightedSum = ratings.reduce((acc, rating, index) => {
      return acc + (rating.rating * weights[index]);
    }, 0);

    const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);

    if (totalWeight === 0) {
      return this.calculateOverallRating(ratings);
    }

    return Math.round(weightedSum / totalWeight);
  }

  /**
   * Calculate overall rating from new FeedbackRating structure
   */
  calculateOverallRatingFromFeedback(feedbackRating: FeedbackRating): number {
    if (!feedbackRating.categoryRatings || feedbackRating.categoryRatings.length === 0) {
      return 0;
    }

    // Use the pre-calculated overall rating from the domain entity
    return feedbackRating.overallRating;
  }

  /**
   * Calculate category rating from CategoryRating structure
   */
  calculateCategoryRating(categoryRating: CategoryRating): number {
    if (!categoryRating.criteriaRatings || categoryRating.criteriaRatings.length === 0) {
      return 0;
    }

    // Use the pre-calculated overall rating from the domain entity
    return categoryRating.overallRating;
  }

  /**
   * Calculate overall rating by averaging all criteria across all categories
   */
  calculateOverallRatingFromCategories(categoryRatings: CategoryRating[]): number {
    if (!categoryRatings || categoryRatings.length === 0) {
      return 0;
    }

    const allCriteriaRatings: number[] = [];

    for (const category of categoryRatings) {
      for (const criterion of category.criteriaRatings) {
        allCriteriaRatings.push(criterion.rating);
      }
    }

    if (allCriteriaRatings.length === 0) {
      return 0;
    }

    const sum = allCriteriaRatings.reduce((acc, rating) => acc + rating, 0);
    return Math.round((sum / allCriteriaRatings.length) * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Legacy method for backward compatibility
   */
  calculateOverallRatingFromLegacy(detailedRatings: DetailedRating[]): number {
    return this.calculateOverallRating(detailedRatings);
  }
}