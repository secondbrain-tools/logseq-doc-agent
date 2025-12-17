<script lang="ts">
  import { RatingValue } from '../../domain/value-objects';
  
  let { detailedRatings = [] }: { detailedRatings?: Array<{category: string, rating: number}> } = $props();
  
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
</script>

<div class="lda-rating-popover">  
  <div class="lda-popover-header">
    <h4 id="lda-popover-title">Detailed Ratings</h4>
  </div>
  <div class="lda-popover-content">
    <table class="lda-ratings-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Rating</th>
        </tr>
      </thead>
      <tbody>
        {#each detailedRatings as item}
          <tr>
            <td class="lda-category-name">{item.category}</td>
            <td class="lda-rating-stars" style="color: {getStarColor(item.rating)}">
              {getStarDisplay(item.rating)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<!-- Styles are now in src/ui/styles/feedback-components.css -->