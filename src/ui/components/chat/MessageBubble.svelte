<script lang="ts">
import { slide } from "svelte/transition";
import type { Message, MessagePart } from "../../../domain/chat/types";
import {
  buildDisplayItems,
  findToolResult,
  getToolSummary,
  type ToolSubGroup,
} from "./message-bubble.utils";
import MessageBubbleResponse from "./MessageBubbleResponse.svelte";
import ResponseSection from "./ResponseSection.svelte";
import ChatModal from "./ChatModal.svelte";
import { ICONS } from "../../icons";
import {
  buildResponseSections,
  type ResponseSection as ResponseSectionData,
} from "../../util/message-bubble.sections";
import { clickHandler, clickAction } from "../../util/actions";
import { renderMarkdownHtml } from "../../util/message-bubble.sections";
import { tick } from "svelte";

interface Props {
  msg: Message;
  onToggleCollapse: (partIndex: number) => void;
  onContextMenu: (e: MouseEvent, msg: Message) => void;
  onSelect?: () => void;
  isHighlighted?: boolean;
  maximizeSignal?: number;
}
let {
  msg,
  onToggleCollapse,
  onContextMenu,
  onSelect,
  isHighlighted = false,
  maximizeSignal = 0,
}: Props = $props();

let displayItems = $derived(buildDisplayItems(msg));

// Local state for groups (keyed by index of first item or unique key)
let groupStates = $state<Record<string, boolean>>({}); // key -> isExpanded

function toggleGroup(key: string | number) {
  const k = String(key);
  groupStates[k] = !groupStates[k];
}

let isThinking = $derived(
  msg.role === "assistant" && (!msg.parts || msg.parts.length === 0) && !msg.content,
);

// ── Response maximize / section collapse ──
let isExpanded = $state(false);
let collapsedSections = $state<Record<string, boolean>>({});
let inlineScrollContainer = $state<HTMLElement | null>(null);
let savedScrollTop = 0;
let modalContentEl = $state<HTMLElement | null>(null);

// Combine all text from content parts for the expanded view
let fullResponseText = $derived(
  msg.parts
    ? msg.parts
        .filter((p) => p.type === "content")
        .map((p) => p.text || "")
        .join("\n\n")
    : msg.content || "",
);

let expandedSections = $derived(buildResponseSections(fullResponseText));

function toggleSection(key: string) {
  collapsedSections[key] = !collapsedSections[key];
}

function toggleExpanded() {
  if (!isExpanded && inlineScrollContainer) {
    savedScrollTop = inlineScrollContainer.scrollTop;
  }
  isExpanded = !isExpanded;

  if (!isExpanded && inlineScrollContainer) {
    tick().then(() => {
      inlineScrollContainer!.scrollTop = savedScrollTop;
    });
  }
}

function closeExpanded() {
  isExpanded = false;
  if (inlineScrollContainer) {
    tick().then(() => {
      inlineScrollContainer!.scrollTop = savedScrollTop;
    });
  }
}

// ── External maximize trigger (from parent via context menu / keyboard) ──
let prevMaximizeSignal = 0;
$effect(() => {
  if (maximizeSignal !== 0 && maximizeSignal !== prevMaximizeSignal) {
    prevMaximizeSignal = maximizeSignal;
    toggleExpanded();
  }
});
</script>

{#snippet ToolCallSnippet(
  part: MessagePart,
  pIndex: number,
  resultPart: MessagePart | undefined,
  isCollapsed: boolean,
)}
  {@const summary = getToolSummary(part, resultPart)}
  <div
    class="mb-2 border rounded text-xs lda-tool-call"
    style="background: var(--ls-secondary-background-color); border-color: var(--ls-border-color); width: 100%; max-width: min(16rem, 100%);"
  >
    <!-- Header -->
    <button
      type="button"
      class="flex justify-between items-center w-full p-2 cursor-pointer focus:outline-none hover:opacity-80 transition-opacity gap-3"
      style="background: none; border: none; color: var(--ls-primary-text-color); text-align: left;"
      use:clickHandler={() => onToggleCollapse(pIndex)}
      aria-expanded={!isCollapsed}
    >
      <div class="flex items-center gap-2 font-mono overflow-hidden">
        <span>🔨</span>
        <div class="flex items-baseline gap-2 overflow-hidden">
          <span class="font-bold whitespace-nowrap">{part.toolName}</span>
          {#if summary}
            <span class="opacity-60 truncate font-normal text-[10px]">{summary}</span>
          {/if}
        </div>
        {#if resultPart}
          <span
            class="text-green-500 flex-shrink-0"
            style="color: var(--ls-success-text-color, green);">✔</span
          >
        {/if}
      </div>
      <div class="font-bold text-lg leading-none ml-auto pl-2">
        {isCollapsed ? "+" : "−"}
      </div>
    </button>

    <!-- Expanded Content -->
    {#if !isCollapsed}
      <div class="p-2 border-t lda-animate-fadeIn" style="border-color: var(--ls-border-color);">
        {#if part.toolArgs}
          <div class="mb-2">
            <div class="font-semibold mb-1 opacity-70">Parameters:</div>
            <pre
              class="overflow-x-auto p-2 rounded border custom-scrollbar"
              style="background: var(--ls-primary-background-color); border-color: var(--ls-border-color); color: var(--ls-primary-text-color); max-height: 200px;">{JSON.stringify(
                part.toolArgs,
                null,
                2,
              )}</pre>
          </div>
        {/if}
        {#if resultPart}
          <div class="mt-2">
            <div class="font-semibold mb-1 opacity-70">Result:</div>
            <pre
              class="overflow-x-auto p-2 rounded border custom-scrollbar"
              style="background: var(--ls-tertiary-background-color, #f5f5f5); border-color: var(--ls-border-color); color: var(--ls-primary-text-color); max-height: 200px;">{typeof resultPart.toolResult ===
              "string"
                ? resultPart.toolResult
                : JSON.stringify(resultPart.toolResult, null, 2)}</pre>
          </div>
        {:else}
          <div class="italic opacity-50 mt-1">Waiting for result...</div>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<div class="lda-message-row {msg.role}">
  <!-- Avatar / Sender Name -->
  <div class="lda-message-meta">
    <div
      class="lda-avatar {msg.role === 'user' ? 'ls-accent-user' : 'ls-accent-agent'}"
      style="background-color: {msg.role === 'user'
        ? 'var(--ls-link-text-color)'
        : 'var(--ls-secondary-text-color)'};"
    ></div>
    <span class="font-bold">{msg.personalityName || (msg.role === "user" ? "You" : "AI")}</span>
  </div>

  <!-- Bubble -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  {#if !isThinking}
    <div
      class="lda-bubble {msg.role === 'user' ? 'ls-bg-user' : 'ls-bg-agent'}"
      bind:this={inlineScrollContainer}
      oncontextmenu={(e) => onContextMenu(e, msg)}
      onclick={() => onSelect?.()}
      class:lda-bubble-highlighted={isHighlighted}
    >
      <!-- Maximize button (assistant bubbles with text) -->
      {#if msg.role === "assistant" && fullResponseText.trim()}
        <button
          type="button"
          class="lda-response-maximize"
          title="Maximize response"
          aria-label="Maximize response"
          use:clickAction={toggleExpanded}
        >
          {@html ICONS.maximizeInput}
        </button>
      {/if}

      <!-- Standard Content (Flat) -->
      {#if !msg.parts || msg.parts.length === 0}
        {#if msg.role === "assistant"}
          <MessageBubbleResponse
            text={msg.content}
            {collapsedSections}
            onToggleSection={toggleSection}
          />
        {:else}
          <div class="markdown-body">{@html renderMarkdownHtml(msg.content)}</div>
        {/if}
      {/if}

      <!-- Multi-part Content -->
      {#if msg.parts}
        {#each displayItems as item}
          {#if item.type === "part"}
            <!-- Render Single Part -->
            {@const part = item.part}
            {@const pIndex = item.index}

            {#if part.type === "reasoning"}
              <div class="mb-2 pl-2" style="border-color: var(--ls-border-color);">
                <button
                  class="text-xs font-medium flex items-center hover:underline focus:outline-none"
                  style="color: var(--ls-secondary-text-color); background: none; border: none; cursor: pointer;"
                  use:clickHandler={() => onToggleCollapse(pIndex)}
                >
                  <span class="mr-1">{part.isCollapsed ? "▶" : "▼"}</span>
                  Reasoning
                </button>
                {#if !part.isCollapsed}
                  <div
                    transition:slide={{
                      duration: 300,
                      axis: "y",
                    }}
                    class="text-xs italic mt-1 lda-animate-fadeIn"
                    style="color: var(--ls-secondary-text-color);"
                  >
                    {part.text}
                  </div>
                {/if}
              </div>
            {:else if part.type === "tool_call"}
              {@const resultPart = findToolResult(msg, part.toolCallId)}
              {@const isCollapsed = part.isCollapsed ?? true}
              {@render ToolCallSnippet(part, pIndex, resultPart, isCollapsed)}
            {:else if part.type === "content"}
              <MessageBubbleResponse
                text={part.text || ""}
                {collapsedSections}
                onToggleSection={toggleSection}
              />
            {:else if part.type === "context"}
              <div class="mb-2">
                <details
                  class="group border rounded-sm"
                  style="border-color: var(--ls-border-color); background: var(--ls-secondary-background-color);"
                >
                  <summary
                    class="flex items-center cursor-pointer p-2 text-xs font-medium select-none focus:outline-none opacity-80 hover:opacity-100"
                  >
                    <span class="mr-2 transform group-open:rotate-90 transition-transform">▶</span>
                    <span>📄 Context: {part.contextName || "Attached Document"}</span>
                  </summary>
                  <div
                    class="p-2 border-t text-xs overflow-x-auto whitespace-pre-wrap font-mono"
                    style="border-color: var(--ls-border-color); color: var(--ls-secondary-text-color);"
                  >
                    {part.contextContent || part.text || ""}
                  </div>
                </details>
              </div>
            {:else if part.type === "prompt"}
              <span class="lda-prompt-bubble-tag">
                <span class="lda-prompt-bubble-icon">✨</span>
                <span class="lda-prompt-bubble-name">{part.promptName}</span>
              </span>
            {/if}
          {:else if item.type === "tool_group"}
            {@const groupKey = item.subgroups[0].parts[0].index}
            {@const isMulti = item.subgroups.length > 1}

            {#snippet ToolGroupCard(subgroup: ToolSubGroup, key: string | number)}
              {@const isGroupExpanded = groupStates[String(key)] ?? false}
              <div class="mb-2 relative" style="width: fit-content; max-width: min(16rem, 100%);">
                <!-- Stack effect layers -->
                {#if !isGroupExpanded}
                  <div
                    class="absolute top-1 left-1 w-full h-full rounded border"
                    style="background: var(--ls-secondary-background-color); border-color: var(--ls-border-color); opacity: 0.5; z-index: 0;"
                  ></div>
                {/if}

                <button
                  class="flex items-center gap-2 p-2 rounded border text-xs cursor-pointer hover:bg-opacity-80 transition hover:shadow-sm relative z-10"
                  style="background: var(--ls-secondary-background-color); border-color: var(--ls-border-color); color: var(--ls-primary-text-color); width: 100%; min-width: 0;"
                  use:clickHandler={() => toggleGroup(key)}
                >
                  <span class="font-mono">🔨</span>
                  <span class="font-bold flex-1 text-left">{subgroup.label}</span>
                  <span
                    class="text-[10px] transform transition-transform {isGroupExpanded
                      ? 'rotate-180'
                      : ''}">▼</span
                  >
                </button>

                {#if isGroupExpanded}
                  <div
                    class="pl-4 mt-2 border-l-2 flex flex-col gap-2 lda-animate-fadeIn"
                    style="border-color: var(--ls-border-color);"
                  >
                    {#each subgroup.parts as p}
                      {@const part = p.part}
                      {@const isCollapsed = part.isCollapsed ?? true}
                      {@render ToolCallSnippet(part, p.index, p.result, isCollapsed)}
                    {/each}
                  </div>
                {/if}
              </div>
            {/snippet}

            {#if isMulti}
              {@const isExpanded = groupStates[String(groupKey)] ?? false}
              <div class="mb-2 pl-2">
                <button
                  class="text-xs font-medium flex items-center hover:underline focus:outline-none"
                  style="color: var(--ls-secondary-text-color); background: none; border: none; cursor: pointer;"
                  use:clickHandler={() => toggleGroup(groupKey)}
                >
                  <span class="mr-1">{isExpanded ? "▼" : "▶"}</span>
                  {item.label}
                </button>
                {#if isExpanded}
                  <div class="pl-2 mt-2 flex flex-col gap-2 lda-animate-fadeIn">
                    {#each item.subgroups as subgroup, subIndex}
                      {@render ToolGroupCard(subgroup, `${groupKey}_${subIndex}`)}
                    {/each}
                  </div>
                {/if}
              </div>
            {:else}
              {@render ToolGroupCard(item.subgroups[0], groupKey)}
            {/if}
          {/if}
        {/each}
      {/if}
    </div>
  {/if}
</div>

{#if isExpanded}
  <ChatModal isOpen={true} onClose={closeExpanded} title="Response">
    {#snippet headerActions()}
      <button
        type="button"
        class="lda-btn-icon-sm lda-response-restore"
        title="Restore inline"
        aria-label="Restore inline"
        use:clickHandler={closeExpanded}
      >
        {@html ICONS.restore}
      </button>
    {/snippet}
    <div
      class="lda-response-shell lda-response-shell--expanded"
      bind:this={modalContentEl}
      role="region"
      aria-label="Response content"
      oncontextmenu={(e) => onContextMenu(e, msg)}
    >
      <div class="lda-response-content">
        {#each expandedSections as section}
          <ResponseSection {section} {collapsedSections} onToggle={toggleSection} />
        {/each}
      </div>
    </div>
  </ChatModal>
{/if}
