<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import RatingPopover from './RatingPopover.svelte';
  
  export let rating: number = 3; // Default rating
  
  let showPopover = false;
  let popoverPosition = { x: 0, y: 0 };
  let popoverContainer: HTMLDivElement;
  const dispatch = createEventDispatcher();
  
  // Ensure the popover is attached to body to avoid container constraints
  onMount(() => {
    if (popoverContainer && document.body && popoverContainer.parentNode !== document.body) {
      document.body.appendChild(popoverContainer);
    }
  });
  
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
    
    // Calculate position for popover
    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    
    // Position the popover to float freely above content
    // Center it horizontally with the button, but position it higher up
    popoverPosition = {
      x: rect.left + rect.width / 2,
      y: rect.top - 10  // Position above the button instead of below
    };
    
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
  
  // Close popover when clicking outside
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

<svelte:window on:click={handleGlobalClick} />

<button
  type="button"
  class="feedback-rating"
  on:click={handleClick}
  on:keydown={handleKeydown}
  style="color: {getStarColor(rating)}"
  title="Rating: {rating}/4 - Click for details"
  aria-label="Rating {rating} out of 4 stars, click for details"
>
  {getStarDisplay(rating)}
</button>

{#if showPopover}
  <div
    bind:this={popoverContainer}
    class="popover-container"
    style="left: {popoverPosition.x}px; top: {popoverPosition.y}px;"
    on:click|stopPropagation
    on:keydown={handlePopoverKeydown}
    role="dialog"
    aria-labelledby="popover-title"
    tabindex="0"
  >
    <div class="popover-arrow"></div>
    <RatingPopover {detailedRatings} />
  </div>
{/if}

<style>
  .feedback-rating {
    display: inline-block;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all 0.2s ease;
    user-select: none;
    margin-left: 8px;
    vertical-align: middle;
    background: transparent;
    border: none;
  }
  
  .feedback-rating:hover {
    transform: scale(1.1);
    filter: brightness(1.2);
  }
  
  .popover-container {
    position: fixed;
    z-index: 1;
    transform: translateX(-50%) translateY(-100%);
    animation: fadeIn 0.2s ease-out;
    pointer-events: auto;
  }
  
  .popover-arrow {
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 8px solid white;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.1));
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-5px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
</style>