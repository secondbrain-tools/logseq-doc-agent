<script lang="ts">
    import SideBySideDiff from "./SideBySideDiff.svelte";

    let {
        originalContent = "",
        newContent = "", // AI Proposal
        currentContent = $bindable(""), // Live / Result
    }: {
        originalContent?: string;
        newContent?: string;
        currentContent?: string;
    } = $props();
</script>

<div class="three-way-container">
    <div class="comparison-row">
        <!-- Re-use SideBySide to show the diff between Original and AI Proposal -->
        <SideBySideDiff {originalContent} modifiedContent={newContent} />
    </div>

    <div class="result-row">
        <div class="result-header">
            <span>Final Result (Editable)</span>
            <span class="hint">This content will be saved to the block.</span>
        </div>
        <textarea
            class="result-editor"
            bind:value={currentContent}
            placeholder="Edit the final content here..."
        ></textarea>
    </div>
</div>

<style>
    .three-way-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: 16px;
    }

    .comparison-row {
        flex: 1; /* Takes up 50% or available space */
        min-height: 0;
        border: 1px solid var(--ls-border-color);
        border-radius: 4px;
        overflow: hidden;
    }

    .result-row {
        flex: 1; /* Takes up remaining space */
        display: flex;
        flex-direction: column;
        min-height: 200px;
        border: 1px solid var(--ls-border-color);
        border-radius: 4px;
        background: var(--ls-primary-background-color);
    }

    .result-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: var(--ls-secondary-background-color);
        border-bottom: 1px solid var(--ls-border-color);
        font-weight: 600;
        color: var(--ls-primary-text-color);
        font-size: 13px;
    }

    .hint {
        font-weight: normal;
        color: var(--ls-tertiary-text-color);
        font-size: 11px;
    }

    .result-editor {
        flex: 1;
        width: 100%;
        border: none;
        resize: none;
        padding: 12px;
        font-family: "Monaco", "Menlo", "Ubuntu Mono", "Consolas", monospace;
        font-size: 13px;
        line-height: 1.5;
        color: var(--ls-primary-text-color);
        background: var(--ls-primary-background-color);
        outline: none;
        box-sizing: border-box;
        overflow-y: auto; /* Enable scrolling */
        height: 100%; /* Ensure it fills parent */
    }

    .result-editor:focus {
        background: var(--ls-secondary-background-color); /* Subtle highlight */
    }
</style>
