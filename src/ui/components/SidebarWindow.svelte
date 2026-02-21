<script lang="ts">
    import ContextMenu from "./chat/ContextMenu.svelte";
    import { ICONS } from "../icons";
    import { PopoutManager } from "./chat-popout-manager";

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

    let isCollapsed = $state(false);
    let isMaximized = $state(false);
    let isPoppedOut = $state(false);

    let popoutManager = new PopoutManager((poppedOut) => {
        isPoppedOut = poppedOut;
        if (poppedOut) {
            isMaximized = false;
        }
    });

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
            action: isPoppedOut
                ? () => popoutManager.restorePopout()
                : () =>
                      popoutManager.togglePopout(
                          Component,
                          componentProps,
                          isPoppedOut,
                      ),
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.popout}</svg>`,
        },
    ]);

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
        if (isMaximized || isPoppedOut) return;
        isCollapsed = !isCollapsed;
    }

    export function toggleMaximize() {
        if (isPoppedOut) return;
        isMaximized = !isMaximized;
        if (isMaximized) {
            isCollapsed = false;
            if (onMaximize) onMaximize();
        }
    }

    function closePanel() {
        popoutManager.close();
        if (onClose) onClose();
    }
</script>

{#snippet headerButton(
    title: string,
    icon: string,
    action: (e: MouseEvent) => void,
    disabled: boolean = false,
)}
    <button
        class="ui__button inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm gap-1 font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none h-7 px-2"
        {title}
        type="button"
        onclick={action}
        {disabled}
        style={disabled ? "opacity: 0.3; cursor: not-allowed;" : ""}
    >
        <span class="ui__icon ti">
            {@html icon}
        </span>
    </button>
{/snippet}

<div
    class="flex sidebar-item content color-level rounded-md shadow-lg item-type-contents lda-sidebar-container {isCollapsed
        ? 'collapsed'
        : ''} {isMaximized ? 'lda-sidebar-maximized' : ''}"
>
    <div class="flex flex-col w-full relative">
        <div
            draggable="true"
            class="flex flex-row justify-between pr-2 sidebar-item-header color-level rounded-t-md lda-sidebar-header"
        >
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

            <div class="item-actions flex items-center">
                {#if EffectiveHeaderActions}
                    <EffectiveHeaderActions {...effectiveHeaderActionsProps} />
                {/if}

                {#if effectiveMenuOptions && effectiveMenuOptions.length > 0}
                    {@render headerButton(
                        "Options",
                        `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-dots" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path><circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle></svg>`,
                        openMenu,
                    )}
                {/if}

                {@render headerButton(
                    isMaximized ? "Restore" : "Maximize",
                    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${isMaximized ? ICONS.restore : ICONS.maximize}</svg>`,
                    toggleMaximize,
                    isPoppedOut,
                )}

                {@render headerButton(
                    "Close",
                    `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-x" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">${ICONS.close}</svg>`,
                    (e) => {
                        e.stopPropagation();
                        closePanel();
                    },
                )}
            </div>
        </div>

        <div
            role="region"
            class="sidebar-item-content {isCollapsed
                ? 'hidden'
                : 'initial'} bg-white lda-sidebar-content"
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
                                {@html ICONS.popout}
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
                            onclick={() => popoutManager.restorePopout()}
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
