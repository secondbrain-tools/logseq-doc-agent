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

<style>
  .lda-rating-popover {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    min-width: 250px;
    max-width: 350px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
  }
  
  .lda-popover-header {
    background: #f9fafb;
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .lda-popover-header h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #374151;
  }
  
  .lda-popover-content {
    padding: 12px 16px;
  }
  
  .lda-ratings-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  
  .lda-ratings-table th {
    text-align: left;
    padding: 8px 4px;
    font-weight: 600;
    color: #6b7280;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .lda-ratings-table td {
    padding: 8px 4px;
    border-bottom: 1px solid #f3f4f6;
  }
  
  .ratings-table tr:last-child td {
    border-bottom: none;
  }
  
  .lda-category-name {
    color: #374151;
    font-weight: 500;
  }
  
  .lda-rating-stars {
    font-weight: bold;
    font-size: 14px;
    text-align: center;
  }
</style>