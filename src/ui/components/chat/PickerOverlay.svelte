<script lang="ts">
    import PromptPicker from "./PromptPicker.svelte";
    import ContextPicker from "./ContextPicker.svelte";
    import type { ChatPrompt } from "../../../domain/chat/prompt";
    import type { ContextItem } from "../../../infra/logseq/context-utils";

    interface Props {
        isPromptPickerOpen: boolean;
        isContextPickerOpen: boolean;
        availablePrompts: ChatPrompt[];
        promptFilter: string;
        contextPickerMode: "page" | "block";
        contextPickerItems: ContextItem[];
        contextPickerFilter: string;
        /**
         * "inline"  — positions the picker above the textarea (bottom: 100%).
         * "cursor"  — positions it at an explicit coordinate inside a
         *             relatively-positioned container (expanded modal mode).
         */
        positioning: "inline" | "cursor";
        cursorPosition?: { top: number; left: number };
        onSelectPrompt: (name: string) => void;
        onSelectContext: (item: ContextItem) => void;
        onClosePromptPicker: () => void;
        onCloseContextPicker: () => void;
    }

    let {
        isPromptPickerOpen,
        isContextPickerOpen,
        availablePrompts,
        promptFilter,
        contextPickerMode,
        contextPickerItems,
        contextPickerFilter,
        positioning,
        cursorPosition,
        onSelectPrompt,
        onSelectContext,
        onClosePromptPicker,
        onCloseContextPicker,
    }: Props = $props();

    let promptPickerRef: any = $state();
    let contextPickerRef: any = $state();

    const INLINE_STYLE =
        "position: absolute; bottom: 100%; left: 0; width: 100%; z-index: 100; margin-bottom: 4px;";

    function cursorStyle(pos: { top: number; left: number } | undefined) {
        if (!pos) return "";
        return `position: absolute; top: ${pos.top}px; left: ${pos.left}px; max-width: calc(100% - ${pos.left}px); z-index: 100;`;
    }

    /** Delegates keyboard events to whichever picker is open. Returns true if handled. */
    export function handleKeyDown(e: KeyboardEvent): boolean {
        if (isPromptPickerOpen && promptPickerRef) {
            if (promptPickerRef.handleKeyDown(e)) return true;
        }
        if (isContextPickerOpen && contextPickerRef) {
            if (contextPickerRef.handleKeyDown(e)) return true;
        }
        return false;
    }
</script>

{#if isPromptPickerOpen}
    <div
        style={positioning === "inline"
            ? INLINE_STYLE
            : cursorStyle(cursorPosition)}
    >
        <PromptPicker
            bind:this={promptPickerRef}
            prompts={availablePrompts}
            filterText={promptFilter}
            onSelect={onSelectPrompt}
            onClose={onClosePromptPicker}
        />
    </div>
{/if}

{#if isContextPickerOpen}
    <div
        style={positioning === "inline"
            ? INLINE_STYLE
            : cursorStyle(cursorPosition)}
    >
        <ContextPicker
            bind:this={contextPickerRef}
            mode={contextPickerMode}
            items={contextPickerItems}
            filterText={contextPickerFilter}
            onSelect={onSelectContext}
            onClose={onCloseContextPicker}
        />
    </div>
{/if}
