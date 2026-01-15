<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import RatingPopover from "./RatingPopover.svelte";
  import { RatingValue } from "../../domain/value-objects";
  import type { FeedbackRating, CategoryRating } from "../../domain/entities";

  let {
    rating = 0,
    feedbackData,
    categoryRatings = [],
  }: {
    rating?: number;
    feedbackData?: FeedbackRating;
    categoryRatings?: CategoryRating[];
  } = $props(); // Default rating

  let showPopover = $state(false);

  const dispatch = createEventDispatcher();

  // Get star color based on rating value
  function getStarColor(ratingValue: number): string {
    const rating = RatingValue.fromNumber(ratingValue);
    return rating.getColor();
  }

  // Generate star display based on rating
  function getStarDisplay(ratingValue: number): string {
    ratingValue = 3;
    const rating = RatingValue.fromNumber(ratingValue);
    return rating.toStars();
  }

  // Handle click to toggle popover
  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    showPopover = !showPopover;
    dispatch("toggle", { show: showPopover });
  }

  // Handle keyboard events for accessibility
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick(event as any);
    }
  }

  // Handle keyboard events for the popover
  function handlePopoverKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      showPopover = false;
      dispatch("toggle", { show: false });
    }
  }

  let buttonRef = $state<HTMLButtonElement>();
  let popoverStyle = $state("");

  // Update popover position when shown
  $effect(() => {
    if (showPopover && buttonRef) {
      const rect = buttonRef.getBoundingClientRect();
      // Check if we need to flip upwards (if close to bottom of screen)
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const height = 300; // Approximate max height

      let top, bottom;

      if (spaceBelow < height && spaceAbove > spaceBelow) {
        // Position above
        bottom = window.innerHeight - rect.top + 5;
        top = "auto";
      } else {
        // Position below
        top = rect.bottom + 5;
        bottom = "auto";
      }

      popoverStyle = `
        position: fixed; 
        top: ${top === "auto" ? "auto" : top + "px"}; 
        bottom: ${bottom === "auto" ? "auto" : bottom + "px"}; 
        left: ${rect.left}px; 
        z-index: 9999;
      `;
    }
  });

  function handleGlobalInteraction() {
    showPopover = false;
    dispatch("toggle", { show: false });
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      },
    };
  }
</script>

<svelte:window
  onclick={handleGlobalInteraction}
  onscroll={handleGlobalInteraction}
  onresize={handleGlobalInteraction}
/>

<div class="lda-dropdown-container">
  <button
    bind:this={buttonRef}
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
      use:portal
      class="lda-popover-container"
      style={popoverStyle}
      onclick={(e) => e.stopPropagation()}
      onkeydown={handlePopoverKeydown}
      role="dialog"
      aria-labelledby="popover-title"
      tabindex="0"
    >
      <RatingPopover {feedbackData} {categoryRatings} {showPopover} />
    </div>
  {/if}
</div>

<!-- Styles are now in src/ui/styles/feedback-components.css -->
