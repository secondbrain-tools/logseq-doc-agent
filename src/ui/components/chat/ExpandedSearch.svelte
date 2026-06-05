<script lang="ts">
import { clickAction } from "../../util/actions";
import { ICONS } from "../../icons";

interface Props {
  inputText: string;
  expandedTextareaElement: HTMLTextAreaElement | undefined;
}

let { inputText, expandedTextareaElement }: Props = $props();

let isOpen = $state(false);
let searchQuery = $state("");
let searchMatches: number[] = $state([]);
let searchMatchIndex = $state(-1);
let searchInputRef: HTMLInputElement | undefined = $state();

export function open() {
  isOpen = true;
  searchQuery = "";
  searchMatches = [];
  searchMatchIndex = -1;
  setTimeout(() => searchInputRef?.focus(), 50);
}

export function close() {
  isOpen = false;
  expandedTextareaElement?.focus();
}

export function toggle() {
  if (isOpen) close();
  else open();
}

function performSearch() {
  if (!searchQuery) {
    searchMatches = [];
    searchMatchIndex = -1;
    return;
  }

  const matches: number[] = [];
  const lowerQuery = searchQuery.toLowerCase();
  const lowerText = inputText.toLowerCase();
  let pos = lowerText.indexOf(lowerQuery);

  while (pos !== -1) {
    matches.push(pos);
    pos = lowerText.indexOf(lowerQuery, pos + 1);
  }

  searchMatches = matches;

  if (matches.length > 0) {
    const currentPos = expandedTextareaElement?.selectionStart || 0;
    const nextMatchIdx = matches.findIndex((m) => m >= currentPos);
    searchMatchIndex = nextMatchIdx !== -1 ? nextMatchIdx : 0;
    goToMatch(searchMatchIndex, true);
  } else {
    searchMatchIndex = -1;
  }
}

function goToMatch(index: number, keepFocus = false) {
  if (index < 0 || index >= searchMatches.length) return;

  const start = searchMatches[index];
  const end = start + searchQuery.length;

  if (expandedTextareaElement) {
    if (!keepFocus) expandedTextareaElement.focus();
    expandedTextareaElement.setSelectionRange(start, end);
  }
}

function findNext() {
  if (searchMatches.length === 0) return;
  searchMatchIndex = (searchMatchIndex + 1) % searchMatches.length;
  goToMatch(searchMatchIndex);
}

function findPrev() {
  if (searchMatches.length === 0) return;
  searchMatchIndex = (searchMatchIndex - 1 + searchMatches.length) % searchMatches.length;
  goToMatch(searchMatchIndex);
}
</script>

{#if isOpen}
  <div class="lda-search-container">
    <input
      class="lda-search-input"
      type="text"
      placeholder="Find..."
      bind:value={searchQuery}
      bind:this={searchInputRef}
      oninput={() => performSearch()}
      onkeydown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.shiftKey) findPrev();
          else findNext();
        } else if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
    />
    <span class="lda-search-info">
      {#if searchMatches.length > 0}
        {searchMatchIndex + 1} / {searchMatches.length}
      {:else if searchQuery}
        0 / 0
      {/if}
    </span>
    <button
      class="lda-search-btn"
      use:clickAction={findPrev}
      title="Previous (Shift+Enter)"
      disabled={searchMatches.length === 0}
    >
      {@html ICONS.searchPrev}
    </button>
    <button
      class="lda-search-btn"
      use:clickAction={findNext}
      title="Next (Enter)"
      disabled={searchMatches.length === 0}
    >
      {@html ICONS.searchNext}
    </button>
    <button class="lda-search-btn" use:clickAction={close} title="Close (Esc)">
      {@html ICONS.searchClose}
    </button>
  </div>
{/if}
