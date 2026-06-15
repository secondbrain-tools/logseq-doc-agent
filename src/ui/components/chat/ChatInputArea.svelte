<script lang="ts">
import { tick } from "svelte";
import AgentSelector from "./AgentSelector.svelte";
import ModelSelector, { type ProviderGroup } from "./ModelSelector.svelte";
import ContextMenu from "./ContextMenu.svelte";
import ChatModal from "./ChatModal.svelte";
import PickerOverlay from "./PickerOverlay.svelte";
import ExpandedSearch from "./ExpandedSearch.svelte";
import type { AgentDefinition } from "../../../domain/agent/types";
import { searchPages, searchBlocks } from "../../../infra/logseq/context-utils";
import type { ContextItem } from "../../../infra/logseq/context-utils";
import type { ChatPrompt } from "../../../domain/chat/prompt";
import { autoresize, clickAction, clickHandler } from "../../util/actions";
import { ICONS } from "../../icons";
import { applyPromptSelection, applyContextSelection } from "../../util/textarea-text-utils";

interface ActiveContext {
  item: ContextItem;
  isActive: boolean;
  isAuto?: boolean;
}

interface Props {
  inputText: string;
  selectedPrompts: string[];
  availablePrompts: ChatPrompt[];
  isLoading: boolean;
  activeContexts: ActiveContext[];
  agents: AgentDefinition[];
  selectedAgent: string;
  modelGroups: ProviderGroup[];
  selectedModel: string;
  selectedProviderId: string;
  reasoningEffort: "none" | "low" | "medium" | "high";
  currentModelSupportsReasoning: boolean;
  focusSignal?: number;
  expandSignal?: number;

  onSendMessage: () => void;
  onAddContext: () => void;
  onAddManualContext: (item: ContextItem) => void;
  onRemoveContext: (id: string) => void;
  onToggleContext: (id: string) => void;
  onModelChange: (modelId: string, providerId: string) => void;
  onAgentChange: (agentName: string) => void;
  onStop?: () => void;
  onAgentListOpen?: () => void;
  onPromptPickerOpen?: () => void;
}

let {
  inputText = $bindable(),
  selectedPrompts = $bindable(),
  availablePrompts = [],
  isLoading,
  activeContexts,
  agents,
  selectedAgent,
  modelGroups,
  selectedModel = $bindable(),
  selectedProviderId = $bindable(),
  reasoningEffort = $bindable(),
  currentModelSupportsReasoning,
  focusSignal,
  expandSignal,
  onSendMessage,
  onAddContext,
  onAddManualContext,
  onRemoveContext,
  onToggleContext,
  onModelChange,
  onAgentChange,
  onStop,
  onAgentListOpen,
  onPromptPickerOpen,
}: Props = $props();

// --- Local State ---
let isContextMenuOpen = $state(false);
let isMaxedOut = $state(false);
let isExpanded = $state(false);
let reasoningMenu = $state({ visible: false, x: 0, y: 0 });

// Prompt Picker State
let isPromptPickerOpen = $state(false);
let promptFilter = $state("");

// Context Picker State
let isContextPickerOpen = $state(false);
let contextPickerMode = $state<"page" | "block">("page");
let contextPickerFilter = $state("");
let contextPickerItems: ContextItem[] = $state([]);
let searchDebounceTimer: any;

// Picker position (shared; prompt and context pickers are never open simultaneously)
let pickerPos = $state({ top: 0, left: 0 });

// Element & component refs
let textareaElement: HTMLTextAreaElement | undefined = $state();
let expandedTextareaElement: HTMLTextAreaElement | undefined = $state();
let inlinePickerRef: any = $state();
let expandedPickerRef: any = $state();
let searchRef: any = $state();

$effect(() => {
  if (focusSignal && textareaElement) {
    textareaElement.focus();
  }
});

$effect(() => {
  if (expandSignal) {
    console.log("[UI] expandSignal received:", expandSignal);
    setTimeout(() => {
      console.log("[UI] Triggering delayed toggleExpand");
      void toggleExpand();
    }, 100);
  }
});

// Capture-phase guard: when the expanded textarea is focused and the user
// presses PageUp/PageDown, stop the event before Logseq's capture-phase
// listeners can scroll the sidebar. Synthetic key events don't trigger
// default actions in textareas, so we scroll and move the cursor manually.
// Use the window that owns the textarea (parent when sidebar is in parent doc).
$effect(() => {
  if (!isExpanded || !expandedTextareaElement) return;

  const el = expandedTextareaElement;
  const targetWin = el.ownerDocument.defaultView ?? window;

  function charOffsetAtLineStart(text: string, lineIndex: number): number {
    const lines = text.split("\n");
    if (lineIndex <= 0) return 0;
    return lines.slice(0, lineIndex).join("\n").length;
  }

  const handler = (e: KeyboardEvent) => {
    if (e.key !== "PageUp" && e.key !== "PageDown") return;
    if (el.ownerDocument.activeElement !== el) return;

    e.preventDefault();
    e.stopPropagation();

    const text = el.value;
    const lines = text.split("\n");
    const lineCount = lines.length;
    const style = targetWin.getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 24;
    const linesPerPage = Math.max(1, Math.floor(el.clientHeight / lineHeight));

    const cursor = el.selectionStart;
    const lineIndex = text.substring(0, cursor).split("\n").length - 1;

    if (e.key === "PageDown") {
      el.scrollTop = Math.min(el.scrollTop + el.clientHeight, el.scrollHeight - el.clientHeight);
      const newLine = Math.min(lineIndex + linesPerPage, lineCount - 1);
      const newOffset = charOffsetAtLineStart(text, newLine);
      el.setSelectionRange(newOffset, newOffset);
    } else {
      el.scrollTop = Math.max(el.scrollTop - el.clientHeight, 0);
      const newLine = Math.max(lineIndex - linesPerPage, 0);
      const newOffset = charOffsetAtLineStart(text, newLine);
      el.setSelectionRange(newOffset, newOffset);
    }
  };

  targetWin.addEventListener("keydown", handler, true);
  return () => targetWin.removeEventListener("keydown", handler, true);
});

// --- Helpers ---
function getActiveTextarea() {
  return isExpanded ? expandedTextareaElement : textareaElement;
}

function updatePopoverPosition() {
  if (!isExpanded || !expandedTextareaElement) return;

  const el = expandedTextareaElement;
  const textBefore = el.value.substring(0, el.selectionEnd);
  const lines = textBefore.split("\n");
  const lineNum = lines.length - 1;
  const colNum = lines[lines.length - 1].length;

  const style = window.getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight) || 24;
  const paddingTop = parseFloat(style.paddingTop) || 8;
  const paddingLeft = parseFloat(style.paddingLeft) || 8;
  // Rough char width for proportional fonts: 55% of font size
  const charWidth = (parseFloat(style.fontSize) || 16) * 0.55;

  const rawTop = paddingTop + lineNum * lineHeight - el.scrollTop + lineHeight + 16;
  const rawLeft = paddingLeft + colNum * charWidth - el.scrollLeft;

  pickerPos = {
    top: Math.max(0, Math.min(rawTop, el.clientHeight - 250)),
    left: Math.max(0, Math.min(rawLeft, el.clientWidth - 260)),
  };
}

// --- Input Handling ---
function handleInput() {
  if (isPromptPickerOpen) {
    const lastSlash = inputText.lastIndexOf("/");
    const cursor = getActiveTextarea()?.selectionStart || inputText.length;

    if (lastSlash !== -1 && cursor > lastSlash) {
      const checkString = inputText.substring(lastSlash + 1, cursor);
      if (checkString.includes(" ")) {
        isPromptPickerOpen = false;
      } else {
        promptFilter = checkString;
        if (isExpanded) updatePopoverPosition();
      }
    } else {
      isPromptPickerOpen = false;
    }
  }

  if (isContextPickerOpen) {
    const trigger = contextPickerMode === "page" ? "[[" : "((";
    const lastTrigger = inputText.lastIndexOf(trigger);
    const cursor = getActiveTextarea()?.selectionStart || inputText.length;

    if (lastTrigger !== -1 && cursor > lastTrigger + 1) {
      const filter = inputText.substring(lastTrigger + 2, cursor);
      const closingTrigger = contextPickerMode === "page" ? "]]" : "))";

      if (filter.includes(closingTrigger)) {
        isContextPickerOpen = false;
      } else {
        contextPickerFilter = filter;
        if (isExpanded) updatePopoverPosition();
        debounceContextSearch(filter, contextPickerMode);
      }
    } else {
      isContextPickerOpen = false;
    }
  }
}

function debounceContextSearch(query: string, mode: "page" | "block") {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(async () => {
    if (!isContextPickerOpen) return;
    if (mode === "page") {
      const results = await searchPages(query);
      contextPickerItems = results.map((r) => ({
        id: r.uuid,
        type: "page",
        name: r.name || "Untitled Page",
      }));
    } else {
      const results = await searchBlocks(query);
      contextPickerItems = results.map((r) => ({
        id: r.uuid,
        type: "block",
        name: r.content ? r.content.substring(0, 100).replace(/\n/g, " ") : "Empty Block",
      }));
    }
  }, 150);
}

// --- Keyboard Handling ---
const NAV_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Backspace",
  "Delete",
  "PageUp",
  "PageDown",
];

function handleKeydown(e: KeyboardEvent) {
  // Delegate to the active picker overlay first
  const activePickerRef = isExpanded ? expandedPickerRef : inlinePickerRef;
  if (activePickerRef?.handleKeyDown(e)) {
    e.stopPropagation();
    return;
  }

  if (e.key === "/") handleSlashKey(e);
  else if (e.key === "[" || e.key === "(") handleBracketKey(e);

  // Stop Logseq from hijacking navigation keys
  if (NAV_KEYS.includes(e.key)) e.stopPropagation();

  // Prevent Space from bubbling to ChatModal backdrop (which would close it)
  if (e.key === " ") e.stopPropagation();

  // Ctrl/Cmd+F: search (expanded only)
  if ((e.ctrlKey || e.metaKey) && e.key === "f" && isExpanded) {
    e.preventDefault();
    e.stopPropagation();
    searchRef?.toggle();
    return;
  }

  // Alt+Arrow: toggle expand
  if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    e.stopPropagation();
    void toggleExpand();
    return;
  }

  if (e.key === "Escape") handleEscapeKey(e);
  if (e.key === "Enter") handleEnterKey(e);
}

function handleSlashKey(e: KeyboardEvent) {
  const start = getActiveTextarea()?.selectionStart ?? 0;
  if (start === 0 || inputText[start - 1] === " " || inputText[start - 1] === "\n") {
    isPromptPickerOpen = true;
    promptFilter = "";
    if (isExpanded) updatePopoverPosition();
    onPromptPickerOpen?.();
  }
}

function handleBracketKey(e: KeyboardEvent) {
  const start = getActiveTextarea()?.selectionStart ?? 0;
  if (start > 0 && inputText[start - 1] === e.key) {
    if (start === 1 || inputText[start - 2] === " " || inputText[start - 2] === "\n") {
      isContextPickerOpen = true;
      contextPickerMode = e.key === "[" ? "page" : "block";
      contextPickerFilter = "";
      contextPickerItems = [];
      if (isExpanded) updatePopoverPosition();
      debounceContextSearch("", contextPickerMode);
    }
  }
}

function handleEscapeKey(e: KeyboardEvent) {
  if (isExpanded) {
    void toggleExpand();
    e.stopPropagation();
  } else {
    (e.target as HTMLTextAreaElement).blur();
  }
}

function handleEnterKey(e: KeyboardEvent) {
  e.stopPropagation();
  if (e.shiftKey) {
    e.preventDefault();
    const textarea = e.target as HTMLTextAreaElement;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    inputText = inputText.substring(0, start) + "\n" + inputText.substring(end);
    setTimeout(() => {
      const newPos = start + 1;
      textarea.selectionStart = newPos;
      textarea.selectionEnd = newPos;
    }, 0);
  } else {
    e.preventDefault();
    if (isExpanded) void toggleExpand();
    onSendMessage();
  }
}

// --- Prompt Actions ---
function selectPrompt(promptName: string) {
  if (!selectedPrompts.includes(promptName)) {
    selectedPrompts = [...selectedPrompts, promptName];
  }
  isPromptPickerOpen = false;

  const lastSlash = inputText.lastIndexOf("/");
  inputText = applyPromptSelection(inputText, lastSlash, promptFilter);
}

function removePrompt(promptName: string) {
  selectedPrompts = selectedPrompts.filter((p) => p !== promptName);
}

// --- Context Actions ---
function selectContextItem(item: ContextItem) {
  onAddManualContext(item);
  isContextPickerOpen = false;

  const trigger = contextPickerMode === "page" ? "[[" : "((";
  const closingTag = contextPickerMode === "page" ? "]]" : "))";
  const identifier = contextPickerMode === "page" ? item.name : item.id;

  const { text, cursorPos } = applyContextSelection(
    inputText,
    trigger,
    closingTag,
    identifier,
    contextPickerFilter.length,
  );
  inputText = text;

  setTimeout(() => {
    const target = getActiveTextarea();
    if (target) {
      target.setSelectionRange(cursorPos, cursorPos);
      target.focus();
    }
  }, 0);
}

// --- Reasoning ---
function openReasoningMenu(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget as HTMLElement;
  const rect = btn.getBoundingClientRect();
  setTimeout(() => {
    reasoningMenu = { visible: true, x: rect.left, y: rect.top - 10 };
  }, 0);
}

// --- Expand ---
async function toggleExpand() {
  console.log("[UI] toggleExpand START. isExpanded:", isExpanded);
  try {
    const source = getActiveTextarea();
    const start = source?.selectionStart;
    const end = source?.selectionEnd;

    isExpanded = !isExpanded;
    await tick();

    const target = getActiveTextarea();
    if (target) {
      target.focus();
      if (typeof start === "number" && typeof end === "number") {
        try {
          target.setSelectionRange(start, end);
        } catch (err) {
          console.warn("[UI] Failed to restore selection range", err);
        }
      }
    }
  } catch (e) {
    console.error("[UI] Error in toggleExpand:", e);
  }
}

// --- Icons ---
const menuIcons = {
  dash: `<div style="opacity: 0.5;">${ICONS.dash}</div>`,
  brainSmall: `<div style="transform: scale(0.8); color: var(--ls-link-text-color, #106ba3);">${ICONS.brain}</div>`,
  brainMedium: `<div style="transform: scale(1.0); color: var(--ls-link-text-color, #106ba3);">${ICONS.brain}</div>`,
  brainLarge: `<div style="transform: scale(1.2); color: var(--ls-link-text-color, #106ba3);">${ICONS.brain}</div>`,
};
</script>

<div class="lda-chat-input-area">
  {#if activeContexts.length > 0 || selectedPrompts.length > 0}
    <div class="lda-context-bar">
      {#each selectedPrompts as promptName (promptName)}
        <div class="lda-context-tag" style="border-color: var(--ls-link-text-color);">
          <span class="lda-context-icon" style="color: var(--ls-link-text-color);">✨</span>
          <span class="lda-context-name">{promptName}</span>
          <button class="lda-context-remove" use:clickAction={() => removePrompt(promptName)}>
            ×
          </button>
        </div>
      {/each}

      {#each activeContexts as ctx (ctx.item.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="lda-context-tag {ctx.isActive ? '' : 'lda-context-tag-inactive'}"
          use:clickAction={() => onToggleContext(ctx.item.id)}
          title={ctx.isActive ? "Uncheck to disable" : "Check to enable"}
        >
          <span class="lda-context-icon">{ctx.isActive ? "☑️" : "⬜"}</span>
          <span class="lda-context-name">{ctx.item.name}</span>

          {#if !ctx.isAuto}
            <button class="lda-context-remove" use:clickAction={() => onRemoveContext(ctx.item.id)}>
              ×
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <div style="position: relative; width: 100%;">
    <PickerOverlay
      bind:this={inlinePickerRef}
      isPromptPickerOpen={isPromptPickerOpen && !isExpanded}
      isContextPickerOpen={isContextPickerOpen && !isExpanded}
      {availablePrompts}
      {promptFilter}
      {contextPickerMode}
      {contextPickerItems}
      {contextPickerFilter}
      positioning="inline"
      onSelectPrompt={selectPrompt}
      onSelectContext={selectContextItem}
      onClosePromptPicker={() => (isPromptPickerOpen = false)}
      onCloseContextPicker={() => (isContextPickerOpen = false)}
    />
    <textarea
      class="lda-chat-textarea"
      rows="1"
      placeholder="Ask anything..."
      bind:value={inputText}
      bind:this={textareaElement}
      onkeydown={handleKeydown}
      oninput={handleInput}
      use:autoresize={inputText}
      onmaxedout={(e) => {
        isMaxedOut = e.detail;
      }}
    ></textarea>

    {#if isMaxedOut}
      <button
        class="lda-maximize-btn"
        use:clickHandler={() => void toggleExpand()}
        title="Maximize Input"
      >
        {@html ICONS.maximizeInput}
      </button>
    {/if}
  </div>

  <div class="lda-chat-footer">
    <!-- Add Context Button -->
    <div class="relative">
      <button
        class="lda-btn-icon"
        title="Add Context"
        use:clickAction={() => (isContextMenuOpen = !isContextMenuOpen)}
      >
        {@html ICONS.contextAdd}
      </button>
      {#if isContextMenuOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="lda-context-menu-backdrop"
          use:clickAction={() => (isContextMenuOpen = false)}
        ></div>
        <div class="lda-context-menu-popover">
          <button
            class="lda-context-menu-item"
            use:clickAction={() => {
              onAddContext();
              isContextMenuOpen = false;
            }}
          >
            <span>📄</span> Current Page
          </button>
        </div>
      {/if}
    </div>

    <!-- Agent Selection -->
    {#if agents && agents.length > 0 && selectedAgent}
      <AgentSelector
        {agents}
        value={selectedAgent}
        onChange={(agent) => {
          if (agent) onAgentChange(agent.name);
        }}
        onOpen={onAgentListOpen}
      />
    {/if}

    <!-- Model Selection -->
    <ModelSelector
      bind:value={selectedModel}
      bind:providerId={selectedProviderId}
      groups={modelGroups}
      onChange={onModelChange}
    />

    {#if currentModelSupportsReasoning}
      <button
        class="lda-btn-icon ml-1"
        title={`Reasoning Effort: ${reasoningEffort}`}
        use:clickAction={openReasoningMenu}
        style="color: var(--ls-link-text-color, #106ba3); opacity: {reasoningEffort === 'none'
          ? '0.5'
          : reasoningEffort === 'low'
            ? '0.7'
            : reasoningEffort === 'medium'
              ? '0.85'
              : '1'}; transition: opacity 0.2s, transform 0.2s;"
      >
        {#if reasoningEffort === "none"}
          {@html ICONS.dash}
        {:else}
          <div
            style="transform: scale({reasoningEffort === 'low'
              ? 0.8
              : reasoningEffort === 'medium'
                ? 1.0
                : 1.2}); display: flex; align-items: center; justify-content: center;"
          >
            {@html ICONS.brain}
          </div>
        {/if}
      </button>
    {/if}

    <div class="lda-spacer"></div>

    <!-- Send / Stop Button -->
    {#if isLoading}
      <button
        class="lda-btn-primary lda-stop-btn"
        use:clickHandler={() => onStop?.()}
        title="Stop Generation"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="6" y="6" width="12" height="12" rx="2" ry="2" />
        </svg>
      </button>
    {:else}
      <button
        class="lda-btn-primary"
        use:clickHandler={onSendMessage}
        title="Send"
        disabled={!inputText.trim()}
        style={!inputText.trim() ? "opacity: 0.5; cursor: default;" : ""}
      >
        {@html ICONS.send}
      </button>
    {/if}
  </div>
</div>

<!-- Reasoning Menu -->
{#if reasoningMenu.visible}
  <ContextMenu
    x={reasoningMenu.x}
    y={reasoningMenu.y}
    options={[
      {
        label: "None",
        icon: menuIcons.dash,
        action: () => {
          reasoningEffort = "none";
        },
      },
      {
        label: "Low",
        icon: menuIcons.brainSmall,
        action: () => {
          reasoningEffort = "low";
        },
      },
      {
        label: "Medium",
        icon: menuIcons.brainMedium,
        action: () => {
          reasoningEffort = "medium";
        },
      },
      {
        label: "High",
        icon: menuIcons.brainLarge,
        action: () => {
          reasoningEffort = "high";
        },
      },
    ]}
    onClose={() => (reasoningMenu.visible = false)}
  />
{/if}

<!-- Expanded Input Modal -->
{#if isExpanded}
  <ChatModal
    isOpen={isExpanded}
    title="Edit Message"
    overflowVisible={true}
    onClose={() => (isExpanded = false)}
  >
    <div class="lda-expanded-input-container">
      <div
        style="position: relative; width: 100%; height: 100%; display: flex; flex-direction: column;"
      >
        <PickerOverlay
          bind:this={expandedPickerRef}
          isPromptPickerOpen={isPromptPickerOpen && isExpanded}
          isContextPickerOpen={isContextPickerOpen && isExpanded}
          {availablePrompts}
          {promptFilter}
          {contextPickerMode}
          {contextPickerItems}
          {contextPickerFilter}
          positioning="cursor"
          cursorPosition={pickerPos}
          onSelectPrompt={selectPrompt}
          onSelectContext={selectContextItem}
          onClosePromptPicker={() => (isPromptPickerOpen = false)}
          onCloseContextPicker={() => (isContextPickerOpen = false)}
        />
        <textarea
          class="lda-chat-textarea lda-expanded-textarea"
          placeholder="Ask anything..."
          bind:value={inputText}
          bind:this={expandedTextareaElement}
          onkeydown={handleKeydown}
          oninput={handleInput}
        ></textarea>
      </div>

      <ExpandedSearch bind:this={searchRef} {inputText} {expandedTextareaElement} />

      <div class="lda-expanded-footer">
        <button
          class="lda-btn-primary"
          use:clickAction={() => {
            isExpanded = false;
            onSendMessage();
          }}
          title="Send"
          disabled={!inputText.trim()}
          style={!inputText.trim() ? "opacity: 0.5; cursor: default;" : ""}
        >
          {@html ICONS.send}
        </button>
      </div>
    </div>
  </ChatModal>
{/if}

<style>
  .lda-context-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--ls-tertiary-background-color, #f5f5f5);
    border-bottom: 1px solid var(--ls-border-color);
    font-size: 0.8rem;
  }

  .lda-context-tag {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--ls-secondary-background-color, #fff);
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    border: 1px solid var(--ls-border-color);
    cursor: pointer;
    user-select: none;
    transition: opacity 0.2s;
  }

  .lda-context-tag-inactive {
    opacity: 0.6;
    background: var(--ls-tertiary-background-color, #eee);
  }

  .lda-context-remove {
    background: none;
    border: none;
    cursor: pointer;
    opacity: 0.6;
    padding: 0 0.1rem;
    font-size: 1rem;
    line-height: 1;
  }

  .lda-context-remove:hover {
    opacity: 1;
    color: var(--ls-error-text-color, red);
  }

  .lda-context-menu-popover {
    position: absolute;
    bottom: 100%;
    left: 0;
    background: var(--ls-primary-background-color);
    border: 1px solid var(--ls-border-color);
    border-radius: 4px;
    box-shadow: 0 4px 6px color-mix(in srgb, var(--ls-primary-text-color), transparent 90%);

    z-index: 50;
    min-width: 220px;
    padding: 0.25rem 0;
    margin-bottom: 0.25rem;
    white-space: nowrap;
  }

  .lda-context-menu-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 49;
    cursor: default;
  }

  .lda-context-menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 1rem;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--ls-primary-text-color);
  }

  .lda-context-menu-item:hover {
    background: var(--ls-secondary-background-color);
  }

  /* Maximize Button */
  .lda-maximize-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    background: var(--ls-secondary-background-color);
    border: 1px solid var(--ls-border-color);
    border-radius: 4px;
    padding: 4px;
    cursor: pointer;
    opacity: 0.3;
    transition:
      opacity 0.2s,
      background-color 0.2s;
    color: var(--ls-secondary-text-color);
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .lda-maximize-btn:hover {
    opacity: 1;
    background: var(--ls-tertiary-background-color);
    color: var(--ls-primary-text-color);
  }

  /* Expansion Modal Styles */
  .lda-expanded-input-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 1rem;
    padding: 1rem;
  }

  .lda-expanded-textarea {
    flex: 1;
    resize: none !important;
    min-height: 200px;
    font-family: inherit;
    font-size: 1rem;
    line-height: 1.5;
    border: 1px solid var(--ls-border-color);
    border-radius: 6px;
    padding: 1rem;
    overflow-y: auto;
  }

  .lda-expanded-footer {
    display: flex;
    justify-content: flex-end;
  }

  .lda-stop-btn {
    background-color: var(--ls-error-text-color, #ff4d4f);
    border-color: var(--ls-error-text-color, #ff4d4f);
    color: white;
  }
  .lda-stop-btn:hover {
    opacity: 0.9;
  }
</style>
