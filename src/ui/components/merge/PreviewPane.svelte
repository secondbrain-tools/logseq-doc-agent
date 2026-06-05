<script lang="ts">
import * as Diff from "diff";

let {
  content = "",
  originalContent = "",
  isExpanded = true,
  canToggle = false,
  onToggle = (recursive: boolean) => {},
}: {
  content?: string;
  originalContent?: string;
  isExpanded?: boolean;
  canToggle?: boolean;
  onToggle?: (recursive: boolean) => void;
} = $props();

type PreviewSegment = {
  text: string;
  type: "common" | "added";
};

type PreviewLine = {
  lineNumber: number;
  segments: PreviewSegment[];
};

let previewLines = $derived.by<PreviewLine[]>(() => {
  const oldText = originalContent || "";
  const newText = content || "";

  if (!oldText && !newText) return [];

  const changes = Diff.diffWords(oldText, newText);
  const allSegments: PreviewSegment[] = [];

  for (const change of changes) {
    if (change.removed) continue;
    allSegments.push({
      text: change.value,
      type: change.added ? "added" : "common",
    });
  }

  const lines: PreviewLine[] = [];
  let currentLine: PreviewSegment[] = [];
  let lineNum = 1;

  for (const segment of allSegments) {
    const parts = segment.text.split("\n");
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        lines.push({ lineNumber: lineNum, segments: currentLine });
        lineNum++;
        currentLine = [];
      }
      if (parts[i].length > 0 || i === 0) {
        currentLine.push({ text: parts[i], type: segment.type });
      }
    }
  }

  if (currentLine.length > 0) {
    lines.push({ lineNumber: lineNum, segments: currentLine });
  }

  if (lines.length === 0) {
    lines.push({
      lineNumber: 1,
      segments: [{ text: "", type: "common" }],
    });
  }

  return lines;
});

function manualClick(node: HTMLElement, fn: (recursive: boolean) => void) {
  const handler = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn(e.shiftKey);
  };
  node.addEventListener("click", handler);
  return {
    destroy() {
      node.removeEventListener("click", handler);
    },
  };
}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="preview-pane" draggable="false" ondragstart={(e) => e.preventDefault()}>
  <div class="preview-body">
    {#each isExpanded ? previewLines : previewLines.slice(0, 1) as line, i}
      <div class="preview-line">
        <div class="gutter">
          {#if i === 0 && canToggle}
            <button class="toggle-btn" use:manualClick={onToggle} title="Toggle expand">
              {isExpanded ? "▼" : "▶"}
            </button>
          {/if}
          <span class="line-num">{line.lineNumber}</span>
        </div>
        <div class="line-content">
          <span class="text">
            {#each line.segments as segment}
              {#if segment.type === "added"}
                <span class="seg-added">{segment.text}</span>
              {:else}
                <span>{segment.text}</span>
              {/if}
            {/each}
            {#if line.segments.length === 0 || (line.segments.length === 1 && line.segments[0].text === "")}
              &nbsp;
            {/if}
          </span>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .preview-pane {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--ls-primary-background-color);
    font-family: "Monaco", "Menlo", "Ubuntu Mono", "Consolas", monospace;
    font-size: 13px;
    overflow: hidden;
    user-select: text;
  }

  .preview-body {
    overflow-y: auto;
    flex: 1;
    padding-bottom: 20px;
  }

  .preview-line {
    display: flex;
    min-height: 20px;
    line-height: 20px;
  }

  .gutter {
    display: flex;
    width: 40px;
    background: var(--ls-secondary-background-color);
    border-right: 1px solid var(--ls-border-color);
    color: var(--ls-tertiary-text-color);
    user-select: none;
    flex-shrink: 0;
    position: relative;
  }

  .toggle-btn {
    position: absolute;
    left: 2px;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--ls-secondary-text-color);
    font-size: 10px;
    width: 16px;
    z-index: 10;
    background: none;
    border: none;
    padding: 0;
  }
  .toggle-btn:hover {
    color: var(--ls-primary-text-color);
    font-weight: bold;
  }

  .line-num {
    flex: 1;
    text-align: right;
    padding-right: 4px;
    font-size: 11px;
  }

  .line-content {
    flex: 1;
    padding: 0 8px;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--ls-primary-text-color);
    display: flex;
    align-items: center;
  }

  .text {
    flex: 1;
  }

  /* Subtle change highlights */
  .seg-added {
    background-color: rgba(0, 200, 0, 0.08);
    border-bottom: 1px solid rgba(0, 180, 0, 0.2);
    border-radius: 1px;
    transition: background-color 0.5s ease;
  }

  /* Text selection */
  .preview-pane ::selection {
    background-color: rgba(0, 120, 215, 0.3);
    color: inherit;
  }
  .preview-pane ::-moz-selection {
    background-color: rgba(0, 120, 215, 0.3);
    color: inherit;
  }
</style>
