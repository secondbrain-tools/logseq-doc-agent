<script lang="ts">
import ResponseSection from "./ResponseSection.svelte";
import type { ResponseSection as ResponseSectionData } from "../../util/message-bubble.sections";
import { clickHandler } from "../../util/actions";
import { ICONS } from "../../icons";

interface Props {
  section: ResponseSectionData;
  collapsedSections: Record<string, boolean>;
  onToggle: (key: string) => void;
}

let { section, collapsedSections, onToggle }: Props = $props();

let isCollapsed = $derived(collapsedSections[section.key] ?? false);
</script>

<section
  class="lda-response-section lda-response-section--level-{section.level} {section.level === 0
    ? 'lda-response-section--intro'
    : ''}"
  data-response-section={section.key}
>
  {#if section.level > 0}
    {#if section.isCollapsible}
      <button
        type="button"
        class="lda-response-section-header lda-response-section-header--button"
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed
          ? `Expand ${section.headingText || "section"}`
          : `Collapse ${section.headingText || "section"}`}
        title={isCollapsed
          ? `Expand ${section.headingText || "section"}`
          : `Collapse ${section.headingText || "section"}`}
        use:clickHandler={() => onToggle(section.key)}
      >
        <span
          class="lda-response-section-toggle {isCollapsed
            ? 'lda-response-section-toggle--collapsed'
            : ''}"
          aria-hidden="true"
        >
          {@html ICONS.chevronDown}
        </span>
        <span class="lda-response-section-heading">{@html section.headingHtml}</span>
      </button>
    {:else}
      <div class="lda-response-section-header">
        <span class="lda-response-section-heading">{@html section.headingHtml}</span>
      </div>
    {/if}
  {/if}

  {#if !isCollapsed}
    <div class="lda-response-section-body">
      {#if section.bodyHtml}
        <div class="markdown-body">{@html section.bodyHtml}</div>
      {/if}

      {#each section.children as child}
        <ResponseSection section={child} {collapsedSections} {onToggle} />
      {/each}
    </div>
  {/if}
</section>
