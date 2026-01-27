<script lang="ts">
    import type { MergeTreeItem } from "../../../application/services/merge-tree.service";
    import SideBySideDiff from "./SideBySideDiff.svelte";
    import InlineDiff from "./InlineDiff.svelte";

    let {
        item,
        viewMode = "edit",
        isExpanded = true,
        onContentChange,
        onToggle,
        onFocus,
    }: {
        item: MergeTreeItem;
        viewMode: "split" | "inline" | "edit" | "output" | "tree";
        isExpanded?: boolean;
        onContentChange: (uuid: string, newContent: string) => void;
        onToggle: (uuid: string) => void;
        onFocus?: (uuid: string) => void;
    } = $props();

    let editContent = $state(item.mergeData?.currentContent || item.content);
    let headerRef: HTMLElement | undefined = $state();

    function scrollToView() {
        if (headerRef) {
            // Use a small timeout to let any expansion animation/render start if needed.
            setTimeout(() => {
                headerRef?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "nearest",
                });
            }, 50);
        }
    }

    function handleInteraction() {
        onToggle(item.uuid);
        scrollToView();
    }

    // Robust click handler
    function genericClick(node: HTMLElement, fn: () => void) {
        const handler = (e: MouseEvent) => {
            // Check if we are selecting text? If selection exists, don't trigger.
            if (window.getSelection()?.toString()) return;

            e.stopPropagation();
            fn();
        };
        const stop = (e: MouseEvent) => e.stopPropagation();

        node.addEventListener("click", handler);
        node.addEventListener("mousedown", stop);
        node.addEventListener("pointerdown", stop);

        return {
            destroy() {
                node.removeEventListener("click", handler);
                node.removeEventListener("mousedown", stop);
                node.removeEventListener("pointerdown", stop);
            },
        };
    }
</script>

<div
    class="tree-diff-item"
    style="margin-left: {item.level * 20}px"
    data-block-uuid={item.uuid}
>
    {#if item.mergeData}
        <div class="diff-block">
            <div
                class="diff-header"
                use:genericClick={() => {
                    handleInteraction();
                }}
                onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleInteraction();
                    }
                }}
                role="button"
                tabindex="0"
                bind:this={headerRef}
            >
                <span class="toggle-icon">{isExpanded ? "▼" : "▶"}</span>
                <span class="block-id">Block {item.uuid.slice(0, 6)}...</span>
                {#if item.mergeData.newContent}
                    <span class="badge badge-merge">Merge Conflict</span>
                {/if}
            </div>

            {#if isExpanded}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="diff-content {viewMode}"
                    onclick={(e) => {
                        // Allow text selection / interaction with inputs, but scroll if bg clicked?
                        // Actually, user wants "click into the text should scroll".
                        // So checking selection is handled in genericClick logic or here.
                        if (!window.getSelection()?.toString()) {
                            scrollToView();
                        }
                    }}
                >
                    {#if viewMode === "edit"}
                        <!-- Side-by-Side: Input (Diff) | Output (Editor) -->
                        <div class="smart-row">
                            <div class="smart-col smart-input">
                                <!-- Show Inline Diff of Original vs New -->
                                <div class="diff-wrapper">
                                    <InlineDiff
                                        originalContent={item.mergeData
                                            .originalContent}
                                        modifiedContent={item.mergeData
                                            .newContent}
                                    />
                                </div>
                            </div>
                            <div class="smart-col smart-output">
                                <textarea
                                    class="result-editor"
                                    bind:value={editContent}
                                    placeholder="Final content..."
                                    onfocus={() => onFocus?.(item.uuid)}
                                ></textarea>
                            </div>
                        </div>
                    {:else if viewMode === "output"}
                        <div class="smart-col smart-output">
                            <textarea
                                class="result-editor"
                                bind:value={editContent}
                                placeholder="Final content..."
                                onfocus={() => onFocus?.(item.uuid)}
                            ></textarea>
                        </div>
                    {:else if viewMode === "split"}
                        <SideBySideDiff
                            originalContent={item.mergeData.originalContent}
                            modifiedContent={item.mergeData.newContent}
                            showHeaders={false}
                        />
                    {:else if viewMode === "inline"}
                        <InlineDiff
                            originalContent={item.mergeData.originalContent}
                            modifiedContent={item.mergeData.newContent}
                        />
                    {/if}
                </div>
            {/if}
        </div>
    {:else}
        <!-- Read Only Context Node -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="context-block"
            onclick={() => scrollToView()}
            bind:this={headerRef}
        >
            <span class="bullet">•</span>
            <span class="context-text">{item.content || "(Empty)"}</span>
        </div>
    {/if}
</div>

<style>
    .tree-diff-item {
        margin-bottom: 0; /* Remove bottom margin to tightly pack rows */
        border-left: 2px solid var(--ls-guideline-color);
        border-bottom: 1px solid var(--ls-border-color); /* Row separator */
        padding-left: 0; /* Indentation handled by margin-left */
    }

    .diff-block {
        background: var(--ls-primary-background-color);
        /* Remove borders as we use row separator */
    }

    .diff-header {
        padding: 4px 8px; /* Compact header */
        background: var(--ls-secondary-background-color);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85em;
        user-select: none;
        color: var(--ls-secondary-text-color);
    }

    .diff-content {
        padding: 0; /* No padding around diffs for seamless look */
    }

    /* Smart Edit Layout */
    .smart-row {
        display: flex;
        width: 100%;
        min-height: 100px; /* Min height */
    }

    .smart-col {
        flex: 1;
        border-right: 1px solid var(--ls-border-color);
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .smart-col:last-child {
        border-right: none;
    }

    .diff-wrapper {
        padding: 8px;
        flex: 1;
        overflow-x: auto;
    }

    textarea.result-editor {
        width: 100%;
        height: 100%;
        flex: 1;
        border: none;
        resize: vertical;
        padding: 8px;
        background: var(--ls-primary-background-color);
        color: var(--ls-primary-text-color);
        font-family: monospace;
        min-height: 100px;
    }

    .context-block {
        padding: 8px;
        color: var(--ls-secondary-text-color);
        font-size: 0.9em;
        display: flex;
        align-items: flex-start;
        gap: 6px;
        border-bottom: 1px dashed var(--ls-border-color);
    }

    .badge-merge {
        background: var(--ls-link-text-color);
        color: white;
        padding: 1px 4px;
        border-radius: 4px;
        font-size: 0.7em;
    }

    .toggle-icon {
        font-size: 0.8em;
        width: 12px;
    }
</style>
