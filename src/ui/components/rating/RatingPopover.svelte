<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { slide } from "svelte/transition";
  import { RatingValue } from "../../../domain/rating";
  import type {
    FeedbackRating,
    CategoryRating,
    CriterionRating,
  } from "../../../domain/rating";
  import { AddToSidebarUseCase } from "../../../application/usecases/add-to-sidebar.usecase";
  import { FrontendSidebarInjector } from "../../../infra/frontend";
  import RatingStars from "./RatingStars.svelte";

  let {
    detailedRatings = [],
    feedbackData,
    categoryRatings,
    showPopover = false,
  }: {
    detailedRatings?: Array<{ category: string; rating: number }>;
    feedbackData?: FeedbackRating;
    categoryRatings?: CategoryRating[];
    showPopover: boolean;
  } = $props();

  const dispatch = createEventDispatcher();

  // Track expanded state for categories
  let expandedCategories = $state<Record<string, boolean>>({});

  // Icons
  const icons = {
    chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
    chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  };

  function toggleCategory(categoryName: string) {
    console.log("[LDA Debug] Toggle Category:", categoryName);
    expandedCategories[categoryName] = !expandedCategories[categoryName];
    expandedCategories = { ...expandedCategories }; // Force reactivity if object proxy isn't deep enough
  }

  // Use provided category ratings or fall back to detailedRatings
  // Fixed logic to handle empty array default properly
  const categories = $derived(
    categoryRatings && categoryRatings.length > 0
      ? categoryRatings
      : detailedRatings?.map((item) => ({
          category: item.category,
          overallRating: item.rating,
          criteriaRatings: [],
        })) || [],
  );

  const hasDetailedFeedback = $derived(
    categories.length > 0 &&
      categories.some(
        (cat) => cat.criteriaRatings && cat.criteriaRatings.length > 0,
      ),
  );

  function openInSidebar(e: Event) {
    e.stopPropagation();
    console.log("[LDA Debug] openInSidebar clicked", { feedbackData });
    if (feedbackData) {
      console.log("[LDA Debug] feedbackData present, creating useCase");
      const useCase = new AddToSidebarUseCase(new FrontendSidebarInjector());
      const icon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>`;
      useCase.showAnalysisSidebar(feedbackData, icon);
      dispatch("close");
    } else {
      console.warn("[LDA Debug] feedbackData is missing!");
    }
  }

  function genericClick(node: HTMLElement, fn: () => void) {
    const handler = (e: MouseEvent) => {
      e.stopPropagation();
      fn();
    };
    node.addEventListener("click", handler);
    // Prevent popover close on click inside
    const stop = (e: Event) => e.stopPropagation();
    node.addEventListener("mousedown", stop);
    return {
      destroy() {
        node.removeEventListener("click", handler);
        node.removeEventListener("mousedown", stop);
      },
    };
  }
</script>

<div class="lda-rating-popover">
  <div class="lda-popover-header">
    <div class="lda-popover-header-row">
      <h4 id="lda-popover-title" class="lda-popover-title">
        {hasDetailedFeedback ? "Detailed Feedback" : "Detailed Ratings"}
        {#if feedbackData}
          <div style="display: inline-block; margin-left: 8px;">
            <RatingStars
              rating={feedbackData.overallRating}
              showValue={true}
              size="sm"
            />
          </div>
        {/if}
      </h4>
      <button
        use:genericClick={() => openInSidebar(new Event("click"))}
        class="lda-sidebar-trigger"
        title="Open in Sidebar"
        type="button"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><path d="M15 3h6v18h-6M10 17l5-5-5-5M3 12h12" /></svg
        >
      </button>
    </div>
  </div>
  <div class="lda-popover-content">
    {#if hasDetailedFeedback}
      <!-- Detailed view with accordion categories -->
      {#each categories as category}
        {@const ratingObj = RatingValue.fromNumber(category.overallRating)}

        <div class="lda-accordion-item">
          <button
            type="button"
            class="lda-accordion-header"
            use:genericClick={() => toggleCategory(category.category)}
          >
            <div class="lda-accordion-title-row">
              <span class="lda-accordion-icon">
                {@html expandedCategories[category.category]
                  ? icons.chevronDown
                  : icons.chevronRight}
              </span>
              <span class="lda-category-name">{category.category}</span>
              <RatingStars
                rating={category.overallRating}
                showValue={true}
                size="sm"
              />
            </div>
            <!-- Progress Bar -->
            <div class="lda-dist-bar">
              <div
                class="lda-dist-segment"
                style="width: {ratingObj.getPercentage()}%; background: {ratingObj.getSeverity() ===
                'critical'
                  ? '#ff4d4f'
                  : ratingObj.getSeverity() === 'warning'
                    ? '#faad14'
                    : ratingObj.getSeverity() === 'success'
                      ? '#52c41a'
                      : '#d9d9d9'};"
              ></div>
            </div>
          </button>

          {#if expandedCategories[category.category]}
            <!-- Removed transition:slide temporarily to debug visibility issues -->
            <div class="lda-accordion-content-panel">
              {#if category.criteriaRatings && category.criteriaRatings.length > 0}
                <div class="lda-criteria-list">
                  {#each category.criteriaRatings as criterion}
                    <div class="lda-criterion-item">
                      <div class="lda-criterion-header">
                        <div
                          style="display: flex; align-items: center; justify-content: space-between; width: 100%;"
                        >
                          <span class="lda-criterion-name"
                            >{criterion.criterion}</span
                          >
                          <RatingStars
                            rating={criterion.rating}
                            showValue={false}
                            size="sm"
                          />
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
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
              <td class="lda-rating-stars">
                <RatingStars
                  rating={item.overallRating}
                  showValue={true}
                  size="sm"
                />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
