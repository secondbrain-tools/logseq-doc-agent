<script lang="ts">
    import type { MergeTreeItem } from "../../../application/services/merge-tree.service";
    import ThreeWayDiff from "./ThreeWayDiff.svelte";

    let {
        item,
        onContentChange,
    }: {
        item: MergeTreeItem;
        onContentChange: (uuid: string, newContent: string) => void;
    } = $props();

    let isExpanded = $state(true);
    let editContent = $state(item.mergeData?.currentContent || item.content);

    // Sync external changes if needed?
    $effect(() => {
        // When editContent changes, notify up?
        // Or just let the ThreeWayDiff bind?
        // We pass the change back via callback
        onContentChange(item.uuid, editContent);
    });
</script>

<div class="tree-diff-item" style="margin-left: {item.level * 20}px">
    {#if item.mergeData}
        <div class="diff-block">
            <div
                class="diff-header"
                onclick={() => (isExpanded = !isExpanded)}
                role="button"
                tabindex="0"
            >
                <span class="toggle-icon">{isExpanded ? "▼" : "▶"}</span>
                <span class="block-id">Block {item.uuid.slice(0, 6)}...</span>
                {#if item.mergeData.newContent}
                    <span class="badge badge-merge">Merge Conflict</span>
                {/if}
            </div>

            {#if isExpanded}
                <div class="diff-content">
                    <ThreeWayDiff
                        originalContent={item.mergeData.originalContent}
                        newContent={item.mergeData.newContent}
                        bind:currentContent={editContent}
                    />
                </div>
            {/if}
        </div>
    {:else}
        <!-- Read Only Context Node -->
        <div class="context-block">
            <span class="bullet">•</span>
            <span class="context-text">{item.content || "(Empty)"}</span>
        </div>
    {/if}
</div>

<style>
    .tree-diff-item {
        margin-bottom: 12px;
        border-left: 2px solid var(--ls-guideline-color);
        padding-left: 8px;
    }

    .diff-block {
        border: 1px solid var(--ls-border-color);
        border-radius: 4px;
        background: var(--ls-primary-background-color);
    }

    .diff-header {
        padding: 8px;
        background: var(--ls-secondary-background-color);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.9em;
        user-select: none;
    }

    .diff-content {
        padding: 12px;
        height: 400px; /* Fixed height for diff view inside tree? Or auto? */
        /* ThreeWayDiff is flex:1, so we need height */
        display: flex;
        flex-direction: column;
    }

    .context-block {
        padding: 4px 8px;
        color: var(--ls-secondary-text-color);
        font-size: 0.9em;
        display: flex;
        align-items: flex-start;
        gap: 6px;
    }

    .badge-merge {
        background: var(--ls-link-text-color);
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.75em;
    }

    .toggle-icon {
        font-size: 0.8em;
        width: 12px;
    }
</style>
