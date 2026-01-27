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
        onReplaceRequest,
        currentContent,
    }: {
        item: MergeTreeItem;
        currentContent?: string;
        viewMode: "split" | "inline" | "edit" | "output" | "tree";
        isExpanded?: boolean;
        onContentChange: (uuid: string, newContent: string) => void;
        onToggle: (uuid: string) => void;
        onFocus?: (uuid: string) => void;
        onReplaceRequest?: (
            uuid: string,
            source: "original" | "new",
            subtree: boolean,
        ) => void;
    } = $props();

    let editContent = $state(
        currentContent ?? item.mergeData?.currentContent ?? item.content,
    );
    let headerRef: HTMLElement | undefined = $state();

    $effect(() => {
        if (currentContent !== undefined && currentContent !== editContent) {
            editContent = currentContent;
        }
    });

    function handleEditorInput() {
        onContentChange(item.uuid, editContent);
    }

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

    function originalClickAction(node: HTMLButtonElement) {
        const handler = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onReplaceRequest?.(item.uuid, "original", e.shiftKey);
        };
        node.addEventListener("click", handler);
        return {
            destroy() {
                node.removeEventListener("click", handler);
            },
        };
    }

    function incomingClickAction(node: HTMLButtonElement) {
        const handler = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onReplaceRequest?.(item.uuid, "new", e.shiftKey);
        };
        node.addEventListener("click", handler);
        return {
            destroy() {
                node.removeEventListener("click", handler);
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
                    <div class="smart-col smart-input input-with-tools">
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
                        <div class="mini-tools">
                            <button
                                class="tool-btn"
                                use:originalClickAction
                                title="Use Original (Shift+Click for subtree)"
                            >
                                ↺
                            </button>
                            <button
                                class="tool-btn"
                                use:incomingClickAction
                                title="Use Incoming (Shift+Click for subtree)"
                            >
                                ⇨
                            </button>
                        </div>
                    </div>
                    <div class="smart-col smart-output">
                        {#if isExpanded}
                            <textarea
                                class="result-editor"
                                bind:value={editContent}
                                placeholder="Final content..."
                                onfocus={() => onFocus?.(item.uuid)}
                                oninput={handleEditorInput}
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
                            oninput={handleEditorInput}
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
        /* width: 100%; removed to allow flex sibling */
        height: 100%;
        flex: 1;
        border: none;
        resize: vertical;
        padding: 8px;
        background: var(--ls-primary-background-color);
        color: var(--ls-primary-text-color);
        font-family: monospace;
        min-height: 100px;
        min-width: 0; /* Important for flex */
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

    .collapsed-placeholder:hover {
        background: var(--ls-tertiary-background-color);
    }

    .input-with-tools {
        flex-direction: row !important;
    }

    .mini-tools {
        display: flex;
        flex-direction: column;
        width: 28px;
        flex-shrink: 0;
        background: var(--ls-secondary-background-color);
        border-left: 1px solid var(--ls-border-color);
        z-index: 2; /* Ensure on top of scrollbars if any */
    }

    .tool-btn {
        width: 100%;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-bottom: 1px solid var(--ls-border-color);
        cursor: pointer;
        color: var(--ls-tertiary-text-color);
        transition: all 0.2s;
        font-size: 14px;
        padding: 0;
    }

    .tool-btn:last-child {
        border-bottom: none;
    }

    .tool-btn:hover {
        background: var(--ls-quaternary-background-color);
        color: var(--ls-primary-text-color);
    }

    .tool-btn:active {
        background: var(--ls-link-text-color);
        color: white;
    }
</style>
