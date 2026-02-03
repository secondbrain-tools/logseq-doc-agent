<script lang="ts">
    import { createEventDispatcher, onMount, mount, unmount } from "svelte";
    import ContextMenu from "./chat/ContextMenu.svelte";

    import type { ComponentType } from "svelte";

    // Props interface
    interface Props {
        title?: string;
        icon?: string | null;
        component: any;
        componentProps?: any;
        onClose?: () => void;
        headerActions?: any;
        headerActionsProps?: any;
        menuOptions?: any[];
        onMaximize?: () => void;
    }

    let {
        title = "Panel",
        icon = null,
        component: Component,
        componentProps = {},
        onClose = undefined,
        headerActions = undefined,
        headerActionsProps = undefined,
        menuOptions = undefined,
        onMaximize = undefined,
    }: Props = $props();

    // State
    let isCollapsed = $state(false);
    let isMaximized = $state(false);
    let isPoppedOut = $state(false);
    let popoutWindow: Window | null = null;
    let popoutApp: any = null;

    const dispatch = createEventDispatcher();

    // Extract header actions from componentProps if passed there (for SidebarInjector compatibility)
    let EffectiveHeaderActions = $derived(
        headerActions || componentProps?.headerActions,
    );
    let effectiveHeaderActionsProps = $derived(
        headerActionsProps || componentProps?.headerActionsProps || {},
    );
    let effectiveMenuOptionsRaw = $derived(
        menuOptions || componentProps?.menuOptions || [],
    );

    let effectiveMenuOptions = $derived([
        ...effectiveMenuOptionsRaw,
        {
            label: isPoppedOut ? "Restore to Sidebar" : "Pop out window",
            action: isPoppedOut ? restorePopout : togglePopout,
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path><path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"></path><path d="M11 13l9 -9"></path><path d="M15 4h5v5"></path></svg>`,
        },
    ]);

    // Context Menu State
    let contextMenu = $state({
        visible: false,
        x: 0,
        y: 0,
    });

    function openMenu(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.currentTarget as HTMLElement;
        const rect = btn.getBoundingClientRect();
        contextMenu = {
            visible: true,
            x: rect.right,
            y: rect.bottom + 5,
        };
    }

    function toggleCollapse() {
        if (isMaximized || isPoppedOut) return; // Disable collapse when maximized or popped out
        isCollapsed = !isCollapsed;
    }

    export function toggleMaximize() {
        if (isPoppedOut) return;
        isMaximized = !isMaximized;
        if (isMaximized) {
            isCollapsed = false; // Force expand when maximizing
            if (onMaximize) onMaximize();
        }
    }

    function closePanel() {
        if (popoutWindow) {
            popoutWindow.close();
        }
        if (onClose) onClose();
        dispatch("close");
    }

    function togglePopout() {
        if (isPoppedOut) {
            // Focus existing window
            popoutWindow?.focus();
            return;
        }

        // Open new window
        const width = 400;
        const height = 600;
        const left = window.screenX + window.outerWidth / 2 - width / 2;
        const top = window.screenY + window.outerHeight / 2 - height / 2;

        popoutWindow = window.open(
            "",
            "lda-popout-" + Date.now(),
            `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
        );

        if (!popoutWindow) {
            console.error("Failed to open popout window");
            return;
        }

        // Copy styles
        const styles = Array.from(
            document.querySelectorAll('style, link[rel="stylesheet"]'),
        );
        styles.forEach((style) => {
            popoutWindow!.document.head.appendChild(style.cloneNode(true));
        });

        // Add base styles for the body to match theme
        const bodyStyle = popoutWindow.document.createElement("style");
        bodyStyle.textContent = `
            body {
                background-color: var(--ls-primary-background-color, #fff);
                color: var(--ls-primary-text-color, #333);
                margin: 0;
                padding: 0;
                height: 100vh;
                display: flex;
                flex-direction: column;
            }
            #app {
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            /* Force ChatContainer to fill height */
            #app .lda-chat-container {
                height: 100% !important;
                flex: 1 !important;
                display: flex !important;
                flex-direction: column !important;
                max-height: none !important;
            }
            /* Force messages list to fill remaining space */
            #app .lda-chat-messages {
                flex: 1 1 0% !important;
                height: auto !important;
                max-height: none !important;
                overflow-y: auto !important;
            }
        `;
        popoutWindow.document.head.appendChild(bodyStyle);

        // Create container
        const container = popoutWindow.document.createElement("div");
        container.id = "app";
        popoutWindow.document.body.appendChild(container);

        // Mount component
        popoutApp = mount(Component, {
            target: container,
            props: componentProps,
        });

        isPoppedOut = true;
        isMaximized = false; // Reset max state

        // Handle close
        popoutWindow.onbeforeunload = () => {
            if (popoutApp) {
                unmount(popoutApp);
                popoutApp = null;
            }
            isPoppedOut = false;
            popoutWindow = null;
        };
    }

    function restorePopout() {
        if (popoutWindow) {
            popoutWindow.close(); // This triggers onbeforeunload
        }
    }

    // Default icons if not provided
    const defaultIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
</script>

<div
    class="flex sidebar-item content color-level rounded-md shadow-lg item-type-contents {isCollapsed
        ? 'collapsed'
        : ''} {isMaximized ? 'lda-sidebar-maximized' : ''}"
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
                class="flex flex-row p-2 items-center flex-1 overflow-hidden"
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
                {#if EffectiveHeaderActions}
                    <EffectiveHeaderActions {...effectiveHeaderActionsProps} />
                {/if}

                <!-- Menu -->
                {#if effectiveMenuOptions && effectiveMenuOptions.length > 0}
                    <button
                        class="ui__button inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm gap-1 font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none h-10 py-2 px-3"
                        title="Options"
                        type="button"
                        onclick={openMenu}
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
                                <path
                                    stroke="none"
                                    d="M0 0h24v24H0z"
                                    fill="none"
                                ></path>
                                <circle cx="5" cy="12" r="1"></circle>
                                <circle cx="12" cy="12" r="1"></circle>
                                <circle cx="19" cy="12" r="1"></circle>
                            </svg>
                        </span>
                    </button>
                {/if}

                <!-- Maximize/Restore Button -->
                <button
                    class="ui__button inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm gap-1 font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none h-10 py-2 px-3"
                    title={isMaximized ? "Restore" : "Maximize"}
                    type="button"
                    onclick={toggleMaximize}
                    disabled={isPoppedOut}
                    style={isPoppedOut
                        ? "opacity: 0.3; cursor: not-allowed;"
                        : ""}
                >
                    <span class="ui__icon ti">
                        {#if isMaximized}
                            <!-- Restore Icon: Two overlapping squares -->
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <rect
                                    x="3"
                                    y="11"
                                    width="10"
                                    height="10"
                                    rx="2"
                                    ry="2"
                                ></rect>
                                <path
                                    d="M7 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4"
                                ></path>
                            </svg>
                        {:else}
                            <!-- Maximize Icon: Single square with arrows (optional) or just consistent square -->
                            <!-- Let's use a clear maximize box -->
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path
                                    stroke="none"
                                    d="M0 0h24v24H0z"
                                    fill="none"
                                ></path>
                                <path d="M4 8v-2a2 2 0 0 1 2 -2h2"></path>
                                <path d="M4 16v2a2 2 0 0 0 2 2h2"></path>
                                <path d="M16 4h2a2 2 0 0 1 2 2v2"></path>
                                <path d="M16 20h2a2 2 0 0 0 2 -2v-2"></path>
                            </svg>
                        {/if}
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
            class="sidebar-item-content {isCollapsed
                ? 'hidden'
                : 'initial'} bg-white"
            style="background-color: var(--ls-bg-color); color: var(--ls-primary-text-color); padding: 10px;"
        >
            <div class="contents flex-col flex">
                {#if isPoppedOut}
                    <div
                        class="flex flex-col items-center justify-center p-8 text-center"
                        style="height: 200px; color: var(--ls-primary-text-color);"
                    >
                        <div class="mb-4 opacity-50">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="48"
                                height="48"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path
                                    d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"
                                ></path>
                                <path d="M11 13l9 -9"></path>
                                <path d="M15 4h5v5"></path>
                            </svg>
                        </div>
                        <h3 class="text-lg font-medium mb-2">
                            Chat Popped Out
                        </h3>
                        <p class="text-sm opacity-70 mb-4">
                            The chat window is currently open in a separate
                            window.
                        </p>
                        <button
                            class="ui__button whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                            onclick={restorePopout}
                        >
                            Restore to Sidebar
                        </button>
                    </div>
                {:else}
                    <Component {...componentProps} />
                {/if}
            </div>
        </div>
    </div>
</div>

{#if contextMenu.visible}
    <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        options={effectiveMenuOptions}
        align="right"
        onClose={() => {
            contextMenu.visible = false;
        }}
    />
{/if}

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

    /* Maximize Styles */
    :global(.lda-sidebar-maximized) {
        position: fixed !important;
        top: 40px !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: calc(100vh - 20px) !important;
        z-index: 9999 !important;
        margin: 0 !important;
        max-width: none !important;
        max-height: none !important;
        border-radius: 8px !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
    }

    :global(.lda-sidebar-maximized) .sidebar-item-content {
        height: 95% !important;
        max-height: none !important;
        display: flex !important;
        flex-direction: column !important;
    }

    /* Force inner content to fill height */
    :global(.lda-sidebar-maximized) .sidebar-item-content > .contents {
        height: 90% !important;
        flex: 1 !important;
        display: flex !important;
        flex-direction: column !important;
    }

    /* Force ChatContainer/ChatInterface to fill height */
    /* Target direct children of .contents to ensure they expand */
    :global(.lda-sidebar-maximized)
        .sidebar-item-content
        > .contents
        > :global(div) {
        height: 90% !important;
        flex: 1 !important;
        display: flex !important;
        flex-direction: column !important;
    }

    /* Ensure message list expands */
    :global(.lda-sidebar-maximized) :global(.lda-chat-messages) {
        flex: 1 1 0% !important;
        height: auto !important;
        max-height: none !important;
        overflow-y: auto !important;
    }
</style>
