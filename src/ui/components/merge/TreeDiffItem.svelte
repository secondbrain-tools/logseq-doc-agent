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
    <!-- Unified rendering for both Merge and Context blocks -->
    <div class="diff-block">
        <!-- No Header - Toggle is now inside the Diff Component -->

        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="diff-content {viewMode}"
            bind:this={headerRef}
            onclick={(e) => {
                if (!window.getSelection()?.toString()) {
                    scrollToView();
                }
            }}
        >
            {#if viewMode === "edit" && item.mergeData}
                <!-- Smart Edit Layout (Only for Merge Blocks) -->
                <div class="smart-row">
                    <div class="smart-col smart-input">
                        <!-- Show Inline Diff of Original vs New -->
                        <div class="diff-wrapper">
                            <InlineDiff
                                originalContent={item.mergeData.originalContent}
                                modifiedContent={item.mergeData.newContent}
                                canToggle={true}
                                {isExpanded}
                                onToggle={() => handleInteraction()}
                            />
                        </div>
                    </div>
                    <div class="smart-col smart-output">
                        <!-- Output editor should probably not be collapsed? 
                             Or maybe the whole row collapses?
                             If collapsed, maybe just show the diff preview?
                             User said: "when toggled the first column with the first text line should be still visible."
                             If we are in 'edit', we have two columns. 
                             If collapsed, we can hide the editor and just show the collapsed diff? 
                         -->
                        {#if isExpanded}
                            <textarea
                                class="result-editor"
                                bind:value={editContent}
                                placeholder="Final content..."
                                onfocus={() => onFocus?.(item.uuid)}
                            ></textarea>
                        {:else}
                            <!-- Placeholder or empty when collapsed? 
                                  If the row stays, we need to match height.
                                  Let's just hide the editor content or show a summary?
                                  Simple approach: Hide editor when collapsed.
                              -->
                            <div
                                class="collapsed-placeholder"
                                onclick={() => handleInteraction()}
                            >
                                ...
                            </div>
                        {/if}
                    </div>
                </div>
            {:else if viewMode === "output" && item.mergeData}
                <!-- Output Only Mode -->
                <div class="smart-col smart-output">
                    {#if isExpanded}
                        <textarea
                            class="result-editor"
                            bind:value={editContent}
                            placeholder="Final content..."
                            onfocus={() => onFocus?.(item.uuid)}
                        ></textarea>
                    {:else}
                        <div
                            class="collapsed-placeholder"
                            onclick={() => handleInteraction()}
                        >
                            ...
                        </div>
                    {/if}
                </div>
            {:else if viewMode === "split"}
                <!-- Side by Side -->
                <SideBySideDiff
                    originalContent={item.mergeData
                        ? item.mergeData.originalContent
                        : item.content}
                    modifiedContent={item.mergeData
                        ? item.mergeData.newContent
                        : item.content}
                    showHeaders={false}
                    canToggle={true}
                    {isExpanded}
                    onToggle={() => handleInteraction()}
                />
            {:else}
                <!-- Inline (Default for others) -->
                <InlineDiff
                    originalContent={item.mergeData
                        ? item.mergeData.originalContent
                        : item.content}
                    modifiedContent={item.mergeData
                        ? item.mergeData.newContent
                        : item.content}
                    canToggle={true}
                    {isExpanded}
                    onToggle={() => handleInteraction()}
                />
            {/if}
        </div>
    </div>
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

    .collapsed-placeholder {
        padding: 8px;
        color: var(--ls-tertiary-text-color);
        font-size: 0.9em;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--ls-secondary-background-color);
        height: 100%;
        min-height: 30px;
    }
    .collapsed-placeholder:hover {
        background: var(--ls-tertiary-background-color);
    }
</style>
