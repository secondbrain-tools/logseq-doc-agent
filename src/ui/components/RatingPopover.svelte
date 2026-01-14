<script lang="ts">
  import { RatingValue } from '../../domain/value-objects';
  import type { FeedbackRating, CategoryRating } from '../../domain/entities';
  
  let {
    detailedRatings = [],
    feedbackData,
    categoryRatings = [],
    showPopover = false
  }: {
    detailedRatings?: Array<{category: string, rating: number}>;
    feedbackData?: FeedbackRating;
    categoryRatings?: CategoryRating[];
    showPopover: boolean;
  } = $props();
  
  // Get star color based on rating value
  function getStarColor(ratingValue: number): string {
    const rating = RatingValue.fromNumber(ratingValue);
    return rating.getColor();
  }
  
  // Generate star display based on rating
  function getStarDisplay(ratingValue: number): string {
    const rating = RatingValue.fromNumber(ratingValue);
    return rating.toStars();
  }

  // Use provided category ratings or fall back to detailedRatings for backward compatibility
  const categories = $derived(categoryRatings || detailedRatings?.map(item => ({
    category: item.category,
    overallRating: item.rating,
    criteriaRatings: []
  })) || []);

  $inspect("feedbackData", feedbackData,showPopover );
  $inspect("categoryRatings", categoryRatings, showPopover);

  // Check if we have detailed feedback data
  const hasDetailedFeedback = $derived(categoryRatings && categoryRatings.length > 0 &&
    categoryRatings.some(cat => cat.criteriaRatings && cat.criteriaRatings.length > 0));
</script>

<div class="lda-rating-popover">
  <div class="lda-popover-header">
    <h4 id="lda-popover-title">
      {hasDetailedFeedback ? 'Detailed Feedback' : 'Detailed Ratings'}
      {#if feedbackData}
        <span class="lda-overall-rating">
          Overall: {getStarDisplay(feedbackData.overallRating)} ({feedbackData.overallRating}/4)
        </span>
      {/if}
    </h4>
  </div>
  <div class="lda-popover-content">
    {#if hasDetailedFeedback}
      <!-- Detailed view with criteria and feedback -->
      {#each categories as category}
        <div class="lda-category-section">
          <div class="lda-category-header">
            <h5 class="lda-category-name">{category.category}</h5>
            <div class="lda-category-rating" style="color: {getStarColor(category.overallRating)}">
              {getStarDisplay(category.overallRating)} ({category.overallRating}/4)
            </div>
          </div>
          {#if category.criteriaRatings && category.criteriaRatings.length > 0}
            <div class="lda-criteria-list">
              {#each category.criteriaRatings as criterion}
                <div class="lda-criterion-item">
                  <div class="lda-criterion-header">
                    <span class="lda-criterion-name">{criterion.criterion}</span>
                    <span class="lda-criterion-rating" style="color: {getStarColor(criterion.rating)}">
                      {getStarDisplay(criterion.rating)} ({criterion.rating}/4)
                    </span>
                  </div>
                  {#if criterion.feedback && criterion.feedback.trim() !== ''}
                    <div class="lda-criterion-feedback">{criterion.feedback}</div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    {:else}
      <!-- Simple view with just categories and ratings -->
      <table class="lda-ratings-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Rating</th>
          </tr>
        </thead>
        <tbody>
          {#each categories as item}
            <tr>
              <td class="lda-category-name">{item.category}</td>
              <td class="lda-rating-stars" style="color: {getStarColor(item.overallRating)}">
                {getStarDisplay(item.overallRating)} ({item.overallRating}/4)
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<!-- Styles are now in src/ui/styles/feedback-components.css -->