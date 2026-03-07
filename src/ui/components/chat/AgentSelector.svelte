<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { fade } from "svelte/transition";
    import type { AgentDefinition } from "../../../domain/agent/types";
    import ChatModal from "./ChatModal.svelte";

    interface Props {
        agents: AgentDefinition[];
        value: string; // Selected agent name
        disabled?: boolean;
        onChange?: (agent: AgentDefinition | null) => void;
        onOpen?: () => void;
    }

    let {
        agents = [],
        value = $bindable(),
        disabled = false,
        onChange,
        onOpen,
    }: Props = $props();

    // State
    let isOpen = $state(false);
    let isModalOpen = $state(false);
    let triggerRef = $state<HTMLElement>();
    let popoverRef = $state<HTMLElement>();
    let popoverStyle = $state(
        "visibility: hidden; position: absolute; top: 0; left: 0;",
    );

    // Cleanup for global listeners
    let cleanupListeners = () => {};

    // Derived
    // Derived
    let selectedAgent = $derived(agents.find((a) => a.name === value) || null);
    let displayName = $derived(selectedAgent?.name || "Select Agent");

    // Filter agents for popover (only enabled)
    let popoverAgents = $derived(agents.filter((a) => a.enabled));

    // Split agents for modal (Enabled vs Disabled)
    let enabledAgents = $derived(agents.filter((a) => a.enabled));
    let disabledAgents = $derived(agents.filter((a) => !a.enabled));

    function toggleOpen(e: MouseEvent) {
        if (!disabled) {
            e.stopPropagation();
            isOpen = !isOpen;
            if (isOpen) onOpen?.();
        }
    }

    function selectAgent(agent: AgentDefinition) {
        value = agent.name;
        if (onChange) onChange(agent);
        isOpen = false;
        isModalOpen = false;
    }

    function openModal(e: MouseEvent) {
        e.stopPropagation();
        isOpen = false;
        isModalOpen = true;
        onOpen?.();
    }

    // --- Positioning Logic ---
    function updatePosition() {
        if (!isOpen || !triggerRef) return;

        const rect = triggerRef.getBoundingClientRect();
        const gap = 4;
        const top = rect.top - gap;
        const left = rect.left;
        const width = Math.max(rect.width, 220); // Slightly wider for the header

        popoverStyle = `
            position: fixed;
            top: ${top}px;
            left: ${left}px;
            width: ${width}px;
            transform: translateY(-100%);
            z-index: 99999;
        `;
    }

    // --- Actions ---
    function genericClick(node: HTMLElement, fn: () => void) {
        const handler = (e: MouseEvent) => {
            e.stopPropagation();
            fn();
        };
        node.addEventListener("click", handler);
        const stop = (e: Event) => e.stopPropagation();
        node.addEventListener("mousedown", stop);

        return {
            destroy() {
                node.removeEventListener("click", handler);
                node.removeEventListener("mousedown", stop);
            },
        };
    }

    // --- Effects ---
    $effect(() => {
        const targetWin = window.parent || window;
        if (isOpen) {
            updatePosition();
            targetWin.addEventListener("scroll", updatePosition, true);
            targetWin.addEventListener("resize", updatePosition);
        }
        return () => {
            targetWin.removeEventListener("scroll", updatePosition, true);
            targetWin.removeEventListener("resize", updatePosition);
        };
    });

    onMount(() => {
        const targetDoc = window.parent?.document || window.document;

        const clickHandler = (e: Event) => {
            const target = e.target as HTMLElement;
            if (triggerRef && triggerRef.contains(target)) return;
            if (popoverRef && popoverRef.contains(target)) return;
            if (isOpen) isOpen = false;
        };

        const keyHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                isOpen = false;
            }
        };

        targetDoc.addEventListener("click", clickHandler);
        targetDoc.addEventListener("keydown", keyHandler);

        cleanupListeners = () => {
            targetDoc.removeEventListener("click", clickHandler);
            targetDoc.removeEventListener("keydown", keyHandler);
        };
    });

    onDestroy(() => {
        cleanupListeners();
    });
</script>

<div class="lda-agent-selector">
    <button
        bind:this={triggerRef}
        class="lda-agent-trigger"
        onclick={toggleOpen}
        {disabled}
        title="Select Agent"
    >
        <span class="lda-agent-name truncate">{displayName}</span>
        <svg
            class="lda-chevron"
            class:open={isOpen}
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
    </button>

    {#if isOpen}
        <div
            bind:this={popoverRef}
            class="lda-agent-dropdown-portal"
            style={popoverStyle}
        >
            <!-- Header with Enlarge/Expand -->
            <div class="lda-popover-header">
                <span class="lda-popover-title">Agents</span>
                <button
                    class="lda-icon-btn"
                    onclick={openModal}
                    title="View all agents with details"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        ><polyline points="15 3 21 3 21 9"></polyline><polyline
                            points="9 21 3 21 3 15"
                        ></polyline><line x1="21" y1="3" x2="14" y2="10"
                        ></line><line x1="3" y1="21" x2="10" y2="14"
                        ></line></svg
                    >
                </button>
            </div>

            <div class="lda-popover-list">
                {#each popoverAgents as agent}
                    <button
                        class="lda-agent-item compact"
                        class:selected={agent.name === value}
                        class:is-default={agent.isDefault}
                        use:genericClick={() => selectAgent(agent)}
                        title={agent.name}
                    >
                        <div class="lda-agent-item-content">
                            <span class="lda-agent-item-name">{agent.name}</span
                            >
                            {#if agent.isDefault}
                                <span class="lda-agent-badge">default</span>
                            {/if}
                        </div>
                        {#if agent.name === value}
                            <svg
                                class="lda-check"
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="3"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        {/if}
                    </button>
                {/each}
                {#if popoverAgents.length === 0}
                    <div class="lda-no-agents">No active agents</div>
                {/if}
            </div>
        </div>
    {/if}
</div>

<!-- Full Screen Modal -->
<ChatModal
    title="Select AI Agent"
    isOpen={isModalOpen}
    onClose={() => (isModalOpen = false)}
>
    <!-- Snippet for Modal Content -->
    <div class="lda-agent-list-large">
        <!-- Enabled Agents Section -->
        {#if enabledAgents.length > 0}
            <div class="lda-agent-section-title">Active Agents</div>
            {#each enabledAgents as agent}
                <button
                    class="lda-agent-card"
                    class:selected={agent.name === value}
                    onclick={() => selectAgent(agent)}
                >
                    <div class="lda-agent-card-header">
                        <div class="lda-agent-name-group">
                            <span class="lda-agent-card-name">{agent.name}</span
                            >
                            {#if agent.isDefault}
                                <span class="lda-agent-badge">default</span>
                            {/if}
                        </div>
                        {#if agent.name === value}
                            <div class="lda-agent-selected-indicator">
                                Selected
                            </div>
                        {/if}
                    </div>
                    {#if agent.description}
                        <p class="lda-agent-card-desc">{agent.description}</p>
                    {/if}
                    <div class="lda-agent-card-meta">
                        <span class="lda-tools-info">
                            Tools: {agent.tools.join(", ")}
                        </span>
                    </div>
                </button>
            {/each}
        {/if}

        <!-- Disabled Agents Section -->
        {#if disabledAgents.length > 0}
            {#if enabledAgents.length > 0}
                <div class="lda-divider"></div>
            {/if}

            <div class="lda-agent-section-title disabled">Disabled</div>
            {#each disabledAgents as agent}
                <div class="lda-agent-card disabled" title="Agent is disabled">
                    <div class="lda-agent-card-header">
                        <div class="lda-agent-name-group">
                            <span class="lda-agent-card-name">{agent.name}</span
                            >
                            {#if agent.isDefault}
                                <span class="lda-agent-badge">default</span>
                            {/if}
                        </div>
                        <span class="lda-agent-status-badge">Disabled</span>
                    </div>
                    {#if agent.description}
                        <p class="lda-agent-card-desc">{agent.description}</p>
                    {/if}
                    <div class="lda-agent-card-meta">
                        <span class="lda-tools-info">
                            Tools: {agent.tools.join(", ")}
                        </span>
                    </div>
                </div>
            {/each}
        {/if}
        {#if agents.length === 0}
            <div class="lda-no-agents-large">
                No agents found. Check your Logseq graph for agent
                configurations.
            </div>
        {/if}
    </div>
</ChatModal>

<style>
    .lda-agent-selector {
        position: relative;
        display: inline-block;
    }

    .lda-agent-trigger {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: var(--ls-secondary-background-color, #f5f5f5);
        border: 1px solid var(--ls-border-color, #ddd);
        border-radius: 6px;
        font-size: 0.75rem;
        cursor: pointer;
        color: var(--ls-primary-text-color, #333);
        max-width: 140px;
        transition: background 0.15s;
    }

    .lda-agent-trigger:hover:not(:disabled) {
        background: var(--ls-tertiary-background-color, #eee);
    }

    .lda-agent-trigger:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .lda-agent-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100px;
    }

    .lda-chevron {
        flex-shrink: 0;
        transition: transform 0.2s;
    }

    .lda-chevron.open {
        transform: rotate(180deg);
    }

    /* Popover Styles */
    .lda-agent-dropdown-portal {
        background: var(--ls-primary-background-color, white);
        border: 1px solid var(--ls-border-color, #ddd);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        max-height: 300px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .lda-popover-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid var(--ls-border-color, #eee);
        background: var(--ls-secondary-background-color, #f9f9f9);
    }

    .lda-popover-title {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--ls-secondary-text-color, #666);
        text-transform: uppercase;
    }

    .lda-icon-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        color: var(--ls-secondary-text-color, #666);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .lda-icon-btn:hover {
        background: var(--ls-tertiary-background-color, #eee);
        color: var(--ls-primary-text-color, #333);
    }

    .lda-popover-list {
        overflow-y: auto;
        padding: 4px;
    }

    /* Compact Item Styles */
    .lda-agent-item {
        display: flex;
        flex-direction: column; /* Keep alignment consistent */
        align-items: flex-start;
        width: 100%;
        padding: 8px 12px;
        text-align: left;
        background: none;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        color: var(--ls-primary-text-color, #333);
        position: relative;
        gap: 2px;
    }

    .lda-agent-item.compact {
        flex-direction: row; /* Horizontal for compact */
        align-items: center;
        padding: 6px 12px;
    }

    .lda-agent-item:hover {
        background: var(--ls-secondary-background-color, #f5f5f5);
    }

    .lda-agent-item.selected {
        background: var(--ls-selection-background-color, #e3f2fd);
    }

    .lda-agent-item-content {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
    }

    .lda-agent-item-name {
        font-weight: 500;
        font-size: 0.85rem;
    }

    .lda-agent-badge {
        font-size: 0.65rem;
        padding: 1px 4px;
        border-radius: 3px;
        background: var(--ls-link-text-color, #106ba3);
        color: white;
    }

    .lda-check {
        color: var(--ls-link-text-color, #106ba3);
    }

    .lda-no-agents {
        padding: 12px;
        text-align: center;
        color: var(--ls-secondary-text-color, #666);
        font-size: 0.8rem;
    }

    /* Large List (Modal) Styles */
    .lda-agent-list-large {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px;
        overflow-y: auto;
        max-height: 100%;
    }

    .lda-agent-card {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 12px;
        background: var(--ls-secondary-background-color, white);
        border: 1px solid var(--ls-border-color, #ddd);
        border-radius: 8px;
        text-align: left;
        cursor: pointer;
        transition:
            border-color 0.15s,
            box-shadow 0.15s;
    }

    .lda-agent-card:hover {
        border-color: var(--ls-link-text-color, #106ba3);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }

    .lda-agent-card.selected {
        border-color: var(--ls-link-text-color, #106ba3);
        background: var(--ls-selection-background-color, #f0f8ff);
    }

    .lda-agent-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .lda-agent-name-group {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .lda-agent-card-name {
        font-size: 1rem;
        font-weight: 600;
        color: var(--ls-primary-text-color, #333);
    }

    .lda-agent-selected-indicator {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--ls-link-text-color, #106ba3);
    }

    .lda-agent-card-desc {
        font-size: 0.85rem;
        color: var(--ls-secondary-text-color, #666);
        margin: 0;
        line-height: 1.4;
    }

    .lda-agent-card-meta {
        font-size: 0.75rem;
        color: var(--ls-tertiary-text-color, #888);
        margin-top: 4px;
    }

    .lda-no-agents-large {
        text-align: center;
        padding: 40px;
        color: var(--ls-secondary-text-color);
    }

    /* Section Styles */
    .lda-agent-section-title {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--ls-secondary-text-color, #666);
        margin: 8px 0 4px 0;
        padding-left: 4px;
    }

    .lda-agent-section-title.disabled {
        color: var(--ls-tertiary-text-color, #888);
    }

    .lda-divider {
        height: 1px;
        background: var(--ls-border-color, #eee);
        margin: 16px 0;
    }

    .lda-agent-card.disabled {
        opacity: 0.6;
        cursor: not-allowed;
        background: var(--ls-secondary-background-color, #f9f9f9);
    }

    .lda-agent-card.disabled:hover {
        border-color: var(--ls-border-color, #ddd);
        box-shadow: none;
    }

    .lda-agent-status-badge {
        font-size: 0.65rem;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--ls-tertiary-background-color, #eee);
        color: var(--ls-secondary-text-color, #666);
    }
</style>
