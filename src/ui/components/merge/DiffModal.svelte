<script lang="ts">
    import Modal from "../common/Modal.svelte";
    import { createEventDispatcher, untrack } from "svelte";
    import type { MergeEntity } from "../../../domain/merge/entity";
    import type { MergeTreeItem } from "../../../application/services/merge-tree.service";
    import InlineDiff from "./InlineDiff.svelte";
    import PreviewPane from "./PreviewPane.svelte";
    import TreeDiffItem from "./TreeDiffItem.svelte";
    import { SvelteSet } from "svelte/reactivity";

    let {
        isOpen,
        mergeData,
        mergeTree,
    }: {
        isOpen: boolean;
        mergeData?: MergeEntity;
        mergeTree?: MergeTreeItem[];
    } = $props();

    const dispatch = createEventDispatcher();

    // Content state for single-block edit
    let editContent = $state("");

    // Content state for tree edit (UUID -> Content)
    let treeEdits = $state<Record<string, string>>({});

    // Normalized tree for rendering
    let activeTree: MergeTreeItem[] = $state([]);

    // Expanded Blocks State (Sync across panes)
    let expandedIds = $state(new SvelteSet<string>());

    // Track if modal was previously open to trigger init only on open
    let wasOpen = false;

    function getInitialPreviewState() {
        if (typeof window !== "undefined" && (window as any).logseq) {
            const settings = (window as any).logseq.settings;
            if (settings && settings["merge.showPreview"] !== undefined) {
                return settings["merge.showPreview"];
            }
        }
        return true;
    }

    // Preview toggle (show/hide right pane + center tools)
    let showPreview = $state(getInitialPreviewState());

    // Initialize content when data arrives (effect)
    $effect(() => {
        if (isOpen) {
            // Always update if we have a tree
            if (mergeTree && mergeTree.length > 0) {
                // If the tree changed or we just opened, update activeTree
                // Simple check: if activeTree is empty or different ref
                if (activeTree !== mergeTree) {
                    activeTree = mergeTree;

                    // Initialize edits map & toggle state
                    const edits: Record<string, string> = {};
                    for (const item of activeTree) {
                        // Expand only blocks with conflicts by default
                        if (item.mergeData) {
                            expandedIds.add(item.uuid);
                        }

                        if (item.mergeData) {
                            edits[item.uuid] =
                                item.mergeData.currentContent ||
                                item.content ||
                                "";
                        } else {
                            edits[item.uuid] = item.content;
                        }
                    }
                    treeEdits = edits;
                }
            } else if (mergeData) {
                // Single block fallback
                // Only if tree is empty
                if (activeTree.length === 0) {
                    editContent = mergeData.currentContent || "";
                }
            }
        } else {
            // Reset on close? Or keep for cache?
            // Let's keep it simple and not clear, so it doesn't flash empty on close anim
        }
    });

    function handleAccept() {
        if (activeTree.length > 0) {
            dispatch("accept", { treeEdits });
        } else {
            dispatch("accept", { content: editContent });
        }
    }

    function handleRevert() {
        dispatch("revert");
    }

    function handleClose() {
        dispatch("close");
    }

    function handleTreeChange(uuid: string, newContent: string) {
        // Create new object reference to ensure Svelte 5 reactivity triggers properly
        treeEdits = { ...treeEdits, [uuid]: newContent };
    }

    function handleToggle(uuid: string, recursive: boolean = false) {
        console.log(
            "[DiffModal] handleToggle called for:",
            uuid,
            "recursive:",
            recursive,
        );

        const isExpanding = !expandedIds.has(uuid);

        if (isExpanding) {
            expandedIds.add(uuid);
        } else {
            expandedIds.delete(uuid);
        }

        if (recursive) {
            const startIndex = activeTree.findIndex((i) => i.uuid === uuid);
            if (startIndex !== -1) {
                const startItem = activeTree[startIndex];
                for (let i = startIndex + 1; i < activeTree.length; i++) {
                    const current = activeTree[i];
                    if (current.level > startItem.level) {
                        if (isExpanding) {
                            expandedIds.add(current.uuid);
                        } else {
                            expandedIds.delete(current.uuid);
                        }
                    } else {
                        break;
                    }
                }
            }
        }

        // Force update just in case
        expandedIds = new SvelteSet(expandedIds);
    }

    function genericClick(node: HTMLElement, fn: () => void) {
        const handler = (e: MouseEvent) => {
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

    function handleTogglePreview() {
        showPreview = !showPreview;
        if (typeof window !== "undefined" && (window as any).logseq) {
            (window as any).logseq.updateSettings({
                "merge.showPreview": showPreview,
            });
        }
    }

    function handleReplaceRequest(
        uuid: string,
        source: "original" | "new",
        subtree: boolean,
    ) {
        console.log(
            `[DiffModal] Replace Request: uuid=${uuid}, source=${source}, subtree=${subtree}`,
        );

        const startIndex = activeTree.findIndex((i) => i.uuid === uuid);
        if (startIndex === -1) return;

        const startItem = activeTree[startIndex];

        const getContent = (item: MergeTreeItem) => {
            if (source === "original") {
                return item.mergeData?.base || item.content || "";
            } else {
                return item.content || "";
            }
        };

        // 1. Update the clicked item
        treeEdits[uuid] = getContent(startItem);

        // 2. If subtree, continue
        if (subtree) {
            for (let i = startIndex + 1; i < activeTree.length; i++) {
                const current = activeTree[i];
                if (current.level > startItem.level) {
                    treeEdits[current.uuid] = getContent(current);
                } else {
                    break;
                }
            }
        }
    }
</script>

<Modal
    {isOpen}
    title="Merge Diff"
    width={showPreview ? "90vw" : "min(800px, 90vw)"}
    initialMaximized={false}
    on:close={handleClose}
>
    <div class="lda-diff-container">
        <!-- Diff Viewer -->
        <div class="lda-diff-editor-wrapper">
            {#if isOpen}
                {#if activeTree.length > 0}
                    <!-- Tree Edit Mode -->
                    <div
                        class="tree-diff-container"
                        class:centered={!showPreview}
                    >
                        <!-- Global Headers -->
                        <div class="tree-header-row">
                            <div class="col-input">Changes</div>
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                class="col-preview-toggle"
                                class:active={showPreview}
                                use:genericClick={handleTogglePreview}
                            >
                                <span class="toggle-icon"
                                    >{showPreview ? "👁" : "👁‍🗨"}</span
                                >
                                <span>Preview</span>
                            </div>
                        </div>

                        {#each activeTree as item (item.uuid)}
                            <TreeDiffItem
                                {item}
                                {showPreview}
                                currentContent={treeEdits[item.uuid]}
                                isExpanded={expandedIds.has(item.uuid)}
                                onToggle={handleToggle}
                                onContentChange={handleTreeChange}
                                onReplaceRequest={handleReplaceRequest}
                            />
                        {/each}
                    </div>
                {:else if mergeData}
                    <!-- Single Block Edit -->
                    <div
                        class="single-edit-layout"
                        class:centered={!showPreview}
                    >
                        <div class="single-edit-col">
                            <InlineDiff
                                originalContent={mergeData.base || ""}
                                modifiedContent={mergeData.currentContent || ""}
                                mode="words"
                                onContentChange={(newContent) => {
                                    editContent = newContent;
                                }}
                            />
                        </div>
                        {#if showPreview}
                            <div class="single-edit-col">
                                <PreviewPane
                                    content={editContent}
                                    originalContent={mergeData.base || ""}
                                />
                            </div>
                        {/if}
                    </div>
                {/if}
            {/if}
        </div>

        <!-- Action buttons -->
        <div class="lda-diff-actions">
            <button
                class="lda-btn lda-btn-secondary"
                use:genericClick={handleClose}
                type="button">Cancel</button
            >
            <button
                class="lda-btn lda-btn-primary"
                use:genericClick={handleAccept}
                type="button">Save Result</button
            >
        </div>
    </div>
</Modal>

<style>
    .lda-diff-container {
        display: flex;
        flex-direction: column;
        max-height: 100%; /* Allow shrinking, but don't overflow parent */
        overflow: hidden;
    }

    .lda-diff-editor-wrapper {
        flex: 1;
        overflow: hidden;
        position: relative;
        min-height: 0;
    }

    .tree-diff-container {
        display: flex;
        flex-direction: column;
        gap: 0;
        height: 100%;
        overflow-y: auto;
        border-top: 1px solid var(--ls-border-color);
    }

    /* When preview is off, center the content with a max-width */
    .tree-diff-container.centered {
        max-width: 800px;
        margin: 0 auto;
        border-right: 1px solid var(--ls-border-color);
        border-left: 1px solid var(--ls-border-color);
    }

    .tree-header-row {
        display: flex;
        gap: 1rem;
        padding: 8px 16px;
        background: var(--ls-tertiary-background-color);
        border-bottom: 1px solid var(--ls-border-color);
        font-weight: 600;
        font-size: 0.9em;
        color: var(--ls-secondary-text-color);
        position: sticky;
        top: 0;
        z-index: 10;
        min-height: 36px;
    }

    .col-input {
        flex: 1;
        text-align: center;
        text-transform: uppercase;
        font-size: 0.85em;
        letter-spacing: 0.5px;
    }

    /* Preview toggle in header */
    .col-preview-toggle {
        flex: 1;
        text-align: center;
        text-transform: uppercase;
        font-size: 0.85em;
        letter-spacing: 0.5px;
        cursor: pointer;
        user-select: none;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border-radius: 4px;
        padding: 2px 8px;
        transition: all 0.2s;
        opacity: 0.5;
    }

    .col-preview-toggle.active {
        opacity: 1;
    }

    .col-preview-toggle:hover {
        background: var(--ls-quaternary-background-color);
        opacity: 1;
    }

    .toggle-icon {
        font-size: 1em;
    }

    /* Single Block Edit Layout */
    .single-edit-layout {
        display: flex;
        height: 100%;
        width: 100%;
    }

    .single-edit-layout.centered {
        max-width: 800px;
        margin: 0 auto;
    }

    .single-edit-col {
        flex: 1;
        min-width: 0;
        overflow: auto;
        border-right: 1px solid var(--ls-border-color);
    }

    .single-edit-col:last-child {
        border-right: none;
    }

    /* Action buttons */
    .lda-diff-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding-top: 10px;
        border-top: 1px solid var(--ls-border-color);
        flex-shrink: 0;
    }

    .lda-btn {
        padding: 6px 12px;
        border-radius: 4px;
        border: 1px solid transparent;
        cursor: pointer;
        font-weight: 500;
    }

    .lda-btn-primary {
        background-color: var(--ls-link-text-color);
        color: white;
    }

    .lda-btn-secondary {
        background-color: transparent;
        border: 1px solid var(--ls-border-color);
        color: var(--ls-primary-text-color);
    }
</style>
