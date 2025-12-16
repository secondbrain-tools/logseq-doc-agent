<script lang="ts">
  export let detailedRatings: Array<{category: string, rating: number}> = [];
  
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

<div class="rating-popover">
  <div class="popover-header">
    <h4 id="popover-title">Detailed Ratings</h4>
  </div>
  <div class="popover-content">
    <table class="ratings-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Rating</th>
        </tr>
      </thead>
      <tbody>
        {#each detailedRatings as item}
          <tr>
            <td class="category-name">{item.category}</td>
            <td class="rating-stars" style="color: {getStarColor(item.rating)}">
              {getStarDisplay(item.rating)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .rating-popover {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    min-width: 250px;
    max-width: 350px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
  }
  
  .popover-header {
    background: #f9fafb;
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .popover-header h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #374151;
  }
  
  .popover-content {
    padding: 12px 16px;
  }
  
  .ratings-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  
  .ratings-table th {
    text-align: left;
    padding: 8px 4px;
    font-weight: 600;
    color: #6b7280;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .ratings-table td {
    padding: 8px 4px;
    border-bottom: 1px solid #f3f4f6;
  }
  
  .ratings-table tr:last-child td {
    border-bottom: none;
  }
  
  .category-name {
    color: #374151;
    font-weight: 500;
  }
  
  .rating-stars {
    font-weight: bold;
    font-size: 14px;
    text-align: center;
  }
</style>