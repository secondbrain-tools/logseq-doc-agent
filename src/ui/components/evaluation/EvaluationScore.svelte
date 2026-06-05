<script lang="ts">
let {
  rating = 0,
  max = 5,
  showValue = false,
  size = "md", // sm, md, lg
}: {
  rating: number;
  max?: number;
  showValue?: boolean;
  size?: "sm" | "md" | "lg";
} = $props();

const roundedValue = $derived(Math.round(rating * 2) / 2);

const severity = $derived.by(() => {
  if (rating === 0) return "muted";
  if (roundedValue > 4) return "excellent";
  if (roundedValue > 3) return "good";
  if (roundedValue > 2) return "warning";
  return "bad";
});

const isNotApplicable = $derived(rating === 0);
const formattedString = $derived(`${rating.toFixed(1)}/${max}`);

// Size mapping
const sizeMap: Record<string, number> = {
  sm: 12, // 12px
  md: 16, // 16px
  lg: 20, // 20px
};
const iconSize = $derived(sizeMap[size] || 16);

function getStarType(index: number, value: number): "full" | "half" | "empty" {
  if (value >= index) return "full";
  if (value >= index - 0.5) return "half";
  return "empty";
}

const uid = Math.random().toString(36).slice(2);
</script>

<div class="lda-rating-stars lda-text-{severity}">
  {#if isNotApplicable}
    <span style="font-size: {iconSize}px; line-height: 1;">○</span>
  {:else}
    {#each Array(max) as _, i}
      {@const starType = getStarType(i + 1, roundedValue)}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={iconSize}
        height={iconSize}
        fill="currentColor"
        class="lda-star-icon"
      >
        {#if starType === "full"}
          <path
            d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
          />
        {:else if starType === "half"}
          <defs>
            <linearGradient id="half-grad-{i}-{uid}">
              <stop offset="50%" stop-color="currentColor" />
              <stop offset="50%" stop-color="currentColor" stop-opacity="0.3" />
            </linearGradient>
          </defs>
          <path
            fill="url(#half-grad-{i}-{uid})"
            d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
          />
        {:else}
          <path
            fill-opacity="0.3"
            d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
          />
        {/if}
      </svg>
    {/each}
  {/if}

  {#if showValue}
    <span class="lda-rating-text" style="font-size: {iconSize === 12 ? 11 : 13}px;">
      ({formattedString})
    </span>
  {/if}
</div>
