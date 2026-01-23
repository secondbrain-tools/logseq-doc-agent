<script lang="ts">
    import { RatingValue } from "../../../domain/rating";

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

    const ratingObj = $derived(RatingValue.fromNumber(rating, max));
    const roundedValue = $derived(ratingObj.toRoundedValue());

    // Size mapping
    const sizeMap = {
        sm: 12, // 12px
        md: 16, // 16px
        lg: 20, // 20px
    };
    const iconSize = $derived(sizeMap[size] || 16);

    // SVG Paths
    // Half star logic needs careful SVG masking or partial fill.
    // Easier approach: Use full star, half star, empty star definitions.

    function getStarType(
        index: number,
        value: number,
    ): "full" | "half" | "empty" {
        // index is 1-based (1, 2, 3, 4)
        if (value >= index) return "full";
        if (value >= index - 0.5) return "half";
        return "empty";
    }

    // Unique ID for gradients to prevent collisions between multiple instances
    const uid = Math.random().toString(36).slice(2);
</script>

<div
    class="lda-rating-stars {ratingObj.getSeverity() === 'bad'
        ? 'lda-text-bad'
        : ratingObj.getSeverity() === 'warning'
          ? 'lda-text-warning'
          : ratingObj.getSeverity() === 'good'
            ? 'lda-text-good'
            : ratingObj.getSeverity() === 'excellent'
              ? 'lda-text-excellent'
              : 'lda-text-muted'}"
>
    {#if ratingObj.isNotApplicable()}
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
                    <!-- Partial fill using unique gradient ID -->
                    <defs>
                        <linearGradient id="half-grad-{i}-{uid}">
                            <stop offset="50%" stop-color="currentColor" />
                            <stop
                                offset="50%"
                                stop-color="currentColor"
                                stop-opacity="0.3"
                            />
                            <!-- Using opacity for empty part to show it exists but dim -->
                        </linearGradient>
                    </defs>
                    <path
                        fill="url(#half-grad-{i}-{uid})"
                        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                    />
                    <!-- Fallback/Overlay stroke could be nice but keeping it simple for now -->
                {:else}
                    <!-- Empty star (outline or dim check) -->
                    <path
                        fill-opacity="0.3"
                        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                    />
                {/if}
            </svg>
        {/each}
    {/if}

    {#if showValue}
        <span
            class="lda-rating-text"
            style="font-size: {iconSize === 12 ? 11 : 13}px;"
        >
            ({ratingObj.toFormattedString()})
        </span>
    {/if}
</div>
