<script lang="ts">
  let { detailedRatings = [] }: { detailedRatings?: Array<{category: string, rating: number}> } = $props();
  
  // Get star color based on rating value
  function getStarColor(ratingValue: number): string {
    switch(ratingValue) {
      case 1: return '#ef4444'; // red
      case 2: return '#eab308'; // yellow
      case 3: return '#86efac'; // light green
      case 4: return '#16a34a'; // dark green
      default: return '#6b7280'; // gray
    }
  }
  
  // Generate star display based on rating
  function getStarDisplay(ratingValue: number): string {
    const starSymbol = '★';
    return starSymbol.repeat(ratingValue);
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

<!-- Styles are now in src/styles/feedback-components.css -->