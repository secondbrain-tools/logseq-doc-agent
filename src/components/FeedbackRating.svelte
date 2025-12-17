<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import RatingPopover from './RatingPopover.svelte';
  
  
  let { rating = 3 }: { rating?: number } = $props(); // Default rating
  
  let showPopover = $state(false);

  const dispatch = createEventDispatcher();
  
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
  
  // Handle click to toggle popover
  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    showPopover = !showPopover;
    dispatch('toggle', { show: showPopover });
  }


  // Handle keyboard events for accessibility
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick(event as any);
    }
  }

    // Handle keyboard events for the popover
  function handlePopoverKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      showPopover = false;
      dispatch('toggle', { show: false });
    }
  }
  
    function handleGlobalClick() {
    showPopover = false;
  }

  // Mock data for detailed ratings
  const detailedRatings = [
    { category: 'Content Quality', rating: 4 },
    { category: 'Clarity', rating: 3 },
    { category: 'Usefulness', rating: 4 },
    { category: 'Accuracy', rating: 2 },
    { category: 'Completeness', rating: 3 }
  ];
</script>

<svelte:window onclick={handleGlobalClick} />

<div class="lda-dropdown-container">
  <button
    type="button"
    class="lda-feedback-rating"
    onclick={handleClick}
    onkeydown={handleKeydown}
    style="color: {getStarColor(rating)}"
    title="Rating: {rating}/4 - Click for details"
    aria-label="Rating {rating} out of 4 stars, click for details"
  >
    {getStarDisplay(rating)}
  </button>

  {#if showPopover}
    <div
      class="lda-popover-container"
      onclick={(e) => e.stopPropagation()}
      onkeydown={handlePopoverKeydown}
      role="dialog"
      aria-labelledby="popover-title"
      tabindex="0"
    >
      <RatingPopover {detailedRatings} />
    </div>
  {/if}
</div>

<!-- Styles are now in src/styles/feedback-components.css -->