<script lang="ts">
import { buildResponseSections } from "../../util/message-bubble.sections";
import ResponseSection from "./ResponseSection.svelte";

interface Props {
  text: string;
  collapsedSections: Record<string, boolean>;
  onToggleSection: (key: string) => void;
}

let { text, collapsedSections, onToggleSection }: Props = $props();

let sections = $derived(buildResponseSections(text));
</script>

<div class="lda-response-content">
  {#if sections.length > 0}
    {#each sections as section}
      <ResponseSection {section} {collapsedSections} onToggle={onToggleSection} />
    {/each}
  {/if}
</div>
