import type { RatingCalculator } from '../../application/ports';

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
}