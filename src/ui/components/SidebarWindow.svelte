<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    import type { ComponentType } from "svelte";

    // Props interface
    interface Props {
        title?: string;
        icon?: string | null;
        component: any;
        componentProps?: any;
        onClose?: () => void;
    }

    let {
        title = "Panel",
        icon = null,
        component: Component,
        componentProps = {},
        onClose = undefined,
    }: Props = $props();

    // State
    let isCollapsed = $state(false);

    const dispatch = createEventDispatcher();

    function toggleCollapse() {
        isCollapsed = !isCollapsed;
    }

    function closePanel() {
        if (onClose) onClose();
        dispatch("close");
    }

    // Default icons if not provided
    const defaultIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
</script>

<div
    class="flex sidebar-item content color-level rounded-md shadow-lg item-type-contents {isCollapsed
        ? 'collapsed'
        : ''}"
    style="border: 1px solid var(--ls-border-color); background: var(--ls-secondary-background-color);"
>
    <div class="flex flex-col w-full relative">
        <!-- Header: Window border with name and buttons -->
        <div
            draggable="true"
            class="flex flex-row justify-between pr-2 sidebar-item-header color-level rounded-t-md"
            style="background-color: var(--ls-secondary-background-color); border-bottom: 1px solid var(--ls-border-color); cursor: default; position: sticky; top: 0; z-index: 10;"
        >
            <!-- Left: Toggle & Title -->
            <button
                class="flex flex-row p-2 items-center w-full overflow-hidden"
                onclick={toggleCollapse}
                aria-expanded={!isCollapsed}
                type="button"
            >
                <span
                    class="opacity-50 hover:opacity-100 flex items-center pr-1"
                >
                    <span
                        class="rotating-arrow {isCollapsed
                            ? ''
                            : 'not-collapsed'}"
                    >
                        <svg
                            aria-hidden="true"
                            version="1.1"
                            viewBox="0 0 192 512"
                            fill="currentColor"
                            display="inline-block"
                            class="h-4 w-4"
                            style="margin-left: 2px;"
                        >
                            <path
                                d="M0 384.662V127.338c0-17.818 21.543-26.741 34.142-14.142l128.662 128.662c7.81 7.81 7.81 20.474 0 28.284L34.142 398.804C21.543 411.404 0 402.48 0 384.662z"
                                fill-rule="evenodd"
                            ></path>
                        </svg>
                    </span>
                </span>
                <div class="ml-1 font-medium overflow-hidden whitespace-nowrap">
                    <div class="flex items-center">
                        {#if icon}
                            <span class="mr-2">{@html icon}</span>
                        {/if}
                        {title}
                    </div>
                </div>
            </button>

            <!-- Right: Actions -->
            <div class="item-actions flex items-center">
                <!-- Menu (Non-functional placeholder for native look) -->
                <button
                    class="ui__button inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm gap-1 font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none h-10 py-2 px-3"
                    title="More"
                    type="button"
                >
                    <span class="ui__icon ti ls-icon-dots">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="icon icon-tabler icon-tabler-dots"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            stroke-width="2"
                            stroke="currentColor"
                            fill="none"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"
                            ></path>
                            <circle cx="5" cy="12" r="1"></circle>
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="19" cy="12" r="1"></circle>
                        </svg>
                    </span>
                </button>

                <!-- Close Button -->
                <button
                    class="ui__button inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm gap-1 font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none h-10 py-2 px-3"
                    title="Close"
                    type="button"
                    onclick={(e) => {
                        e.stopPropagation();
                        closePanel();
                    }}
                >
                    <span class="ui__icon ti ls-icon-x">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="icon icon-tabler icon-tabler-x"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            stroke-width="2"
                            stroke="currentColor"
                            fill="none"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"
                            ></path>
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </span>
                </button>
            </div>
        </div>

        <!-- Body: Content -->
        <div
            role="region"
            class="{isCollapsed ? 'hidden' : 'initial'} bg-white"
            style="background-color: var(--ls-bg-color); color: var(--ls-primary-text-color); padding: 10px;"
        >
            <div class="contents flex-col flex">
                <Component {...componentProps} />
            </div>
        </div>
    </div>
</div>

<style>
    /* Utilities used in template */
    .hidden {
        display: none;
    }
    .flex {
        display: flex;
    }
    .items-center {
        align-items: center;
    }
    .justify-between {
        justify-content: space-between;
    }
    .flex-col {
        flex-direction: column;
    }
    .gap-1 {
        gap: 0.25rem;
    }
    .p-2 {
        padding: 0.5rem;
    }
    .w-full {
        width: 100%;
    }
    .select-none {
        user-select: none;
    }
    .text-sm {
        font-size: 0.875rem;
    }

    /* Ensure styles are robust */
    .sidebar-item-header {
        font-family: var(--ls-font-family, sans-serif);
    }
</style>
