/**
 * UI-only mappers/formatters for rating display
 */

import { RatingValue } from '../../domain/value-objects';

/**
 * Format rating value as a percentage
 */
export function formatRatingAsPercentage(rating: number, maxRating: number = 4): string {
  const percentage = (rating / maxRating) * 100;
  return `${Math.round(percentage)}%`;
}

/**
 * Format rating value with stars and text
 */
export function formatRatingWithStars(rating: number, maxRating: number = 4): string {
  const ratingValue = RatingValue.fromNumber(rating, maxRating);
  const stars = ratingValue.toStars();
  const percentage = formatRatingAsPercentage(rating, maxRating);
  return `${stars} (${percentage})`;
}

/**
 * Get rating color class for CSS
 */
export function getRatingColorClass(rating: number): string {
  if (rating <= 1) return 'lda-rating-poor';
  if (rating <= 2) return 'lda-rating-fair';
  if (rating <= 3) return 'lda-rating-good';
  return 'lda-rating-excellent';
}

/**
 * Format detailed ratings for display
 */
export function formatDetailedRatings(detailedRatings: Array<{category: string, rating: number}>): string {
  if (!detailedRatings || detailedRatings.length === 0) {
    return 'No ratings available';
  }
  
  return detailedRatings
    .map(item => `${item.category}: ${formatRatingWithStars(item.rating)}`)
    .join(', ');
}