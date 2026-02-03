import { mount, unmount } from 'svelte';
import type { SidebarInjector } from '../../application/ports';
import SidebarWindow from '../../ui/components/SidebarWindow.svelte';

/**
 * Concrete implementation of SidebarInjector for frontend
 */
export class FrontendSidebarInjector implements SidebarInjector {
    private observer: MutationObserver | null = null;
    private sidebarObserver: MutationObserver | null = null; // Store this to disconnect properly

    constructor() {
        this.setupObserver();
    }

    public dispose() {
        console.log('[LDA Debug] FrontendSidebarInjector dispose called.');

        // Disconnect observers
        if (this.observer) this.observer.disconnect();
        if (this.sidebarObserver) this.sidebarObserver.disconnect();

        // Cleanup all instances
        this.instances.forEach((data, title) => {
            console.log(`[LDA Debug] Cleaning up sidebar instance: ${title}`);
            try {
                unmount(data.app);
                data.container.remove();
                data.indicator.remove();
            } catch (e) {
                console.warn(`[LDA Debug] Error cleaning up ${title}:`, e);
            }
        });

        this.instances.clear();
    }

    private setupObserver() {
        // We watch the document body for the sidebar appearance, or the sidebar container itself/its children
        // Since the sidebar container might be recreated, we should watch a stable parent or poll/re-observe.
        // For simplicity and robustness, we can watch document.body for subtree changes to find the sidebar if missing,
        // and watch the sidebar container for child list changes if present.

        if (typeof window === 'undefined') return;

        const mainDocument = window.parent?.document || window.top?.document || document;

        let currentSidebarContainer: HTMLElement | null = null;

        const checkAndRestore = () => {
            const sidebar = this.getSidebarContainer();

            // 1. If sidebar container appeared or changed
            if (sidebar && sidebar !== currentSidebarContainer) {
                console.log('[LDA Debug] Sidebar container found/changed. Setting up watcher.');
                currentSidebarContainer = sidebar;

                // Watch this specific container for cleared content
                if (this.sidebarObserver) this.sidebarObserver.disconnect();
                this.sidebarObserver = new MutationObserver(() => {
                    this.restoreMissingInstances();
                });
                this.sidebarObserver.observe(sidebar, { childList: true });
            }

            // 2. Perform restoration check
            this.restoreMissingInstances();
        };

        // Main observer to detect major DOM changes (navigation, re-layout)
        this.observer = new MutationObserver((mutations) => {
            // optimized: only check if relevant nodes touched? 
            // For now, just check throttled or directly.
            checkAndRestore();
        });

        this.observer.observe(mainDocument.body, { childList: true, subtree: true });

        // Initial check
        checkAndRestore();
    }

    private restoreMissingInstances() {
        // Iterate over expected instances
        this.instances.forEach((data, title) => {
            // Check if attached
            if (!data.container.isConnected) {
                console.log(`[LDA Debug] Instance '${title}' found detached. Attempting restoration...`);

                // It is detached. Logic:
                // 1. Cleanup the old detached Svelte app (prevent leaks)
                try {
                    unmount(data.app);
                } catch (e) { /* ignore */ }

                // 2. Try to find sidebar again
                const container = this.getSidebarContainer();
                if (container) {
                    console.log(`[LDA Debug] Re-injecting '${title}' into fresh sidebar container.`);
                    // 3. Re-inject using stored config
                    // We need to call injectIntoSidebar again basically, but we need the checks there to not loop infinitely if something is wrong.
                    // We can reuse the internal logic.
                    this.injectIntoSidebar(data.component, data.props, title, data.icon);
                } else {
                    console.log(`[LDA Debug] Sidebar container missing. Cannot restore '${title}' yet.`);
                    // It will stay in 'instances' as "detached". 
                    // Next time observer triggers (sidebar appears), we will retry.
                }
            }
        });
    }

    // Extended map to store config for restoration
    private instances = new Map<string, {
        app: any,
        container: HTMLElement,
        indicator: HTMLElement,
        component: any,
        props: any,
        icon?: string
    }>();

    private getSidebarContainer(): HTMLElement | null {
        // Try to find the inner content list directly
        // Logic: #right-sidebar-container -> .cp__right-sidebar-scrollable -> .sidebar-item-list
        const mainDocument = window.parent?.document || window.top?.document || document;
        // console.log('[LDA Debug] looking for sidebar container...');

        // In sim: #right-sidebar-container .cp__right-sidebar-scrollable .sidebar-item-list
        // In Logseq real: same usually.
        const container = mainDocument.querySelector('#right-sidebar-container .sidebar-item-list');
        return container as HTMLElement;
    }

    injectIntoSidebar(component: any, props: any, title: string, icon?: string): void {
        console.log('[LDA Debug] injectIntoSidebar called with title:', title);

        // Always attempt to open the sidebar to ensure it's visible.
        if (typeof (window as any).logseq?.App?.openRightSidebar === 'function') {
            (window as any).logseq.App.openRightSidebar();
        }

        let container = this.getSidebarContainer();

        // Check if we have an active, connected instance already
        if (this.instances.has(title)) {
            const existing = this.instances.get(title)!;
            if (existing.container.isConnected) {
                console.log('[LDA Debug] Instance already connected. Updating? (Skipping for now)');
                return;
            } else {
                // Determine if it was just a "dangling" reference from a wiped DOM
                console.log('[LDA Debug] Found detached instance in map. Cleaning up before re-inject.');
                try {
                    unmount(existing.app);
                    existing.container.remove();
                    existing.indicator.remove();
                } catch (e) { /* ignore */ }
                this.instances.delete(title);
            }
        }

        if (!container) {
            console.log('[LDA Debug] Container not found immediately.');
            // Rely on Observer to retry if it appears later
            // But we should store intentions? 
            // Actually, if we return here, 'instances' map is empty for this title.
            // So 'restoreMissingInstances' won't do anything.
            // We needs a "Pending" state or simply retry once.

            console.log('[LDA Debug] Retrying in 100ms...');
            setTimeout(() => {
                if (!this.instances.has(title)) { // Only retry if still not handled
                    this.injectIntoSidebar(component, props, title, icon);
                }
            }, 100);
            return;
        }

        console.log('[LDA Debug] Container found. Creating elements...');
        // 1. Create a container for the window
        const windowContainer = document.createElement('div');
        // Drop indicator (optional)
        const dropIndicator = document.createElement('div');
        dropIndicator.className = 'sidebar-drop-indicator';
        dropIndicator.style.height = '10px';

        // Wrapper should not interfere with visual layout
        windowContainer.style.display = 'contents';

        // Add to DOM (Prepend to show at top)
        container.insertBefore(windowContainer, container.firstChild);
        container.insertBefore(dropIndicator, container.firstChild);
        console.log('[LDA Debug] DOM elements inserted (Drop Indicator + Window).');

        // 2. Mount SidebarWindow
        console.log('[LDA Debug] Mounting SidebarWindow component...');
        const sidebarWindowApp = mount(SidebarWindow, {
            target: windowContainer,
            props: {
                title,
                icon,
                component,
                componentProps: props,
                onClose: () => {
                    console.log('[LDA Debug] SidebarWindow onClose triggered.');

                    // Notify component if it has an onClose handler
                    if (props && typeof props.onClose === 'function') {
                        try {
                            props.onClose();
                        } catch (err) {
                            console.error('[LDA Debug] Error calling component onClose:', err);
                        }
                    }

                    // Cleanup when closed
                    // Only remove if it matches current app (race condition check)
                    const current = this.instances.get(title);
                    if (current && current.app === sidebarWindowApp) {
                        this.instances.delete(title);
                        // We must explicitly stop observing or cleaning up if this was the last one? 
                        // The observer runs globally, so it's fine. 
                        // Removing from 'instances' means 'restoreMissingInstances' will ignore it.
                    }
                    unmount(sidebarWindowApp);
                    windowContainer.remove();
                    dropIndicator.remove();
                }
            }
        });
        console.log('[LDA Debug] SidebarWindow mounted.');

        this.instances.set(title, {
            app: sidebarWindowApp,
            container: windowContainer,
            indicator: dropIndicator,
            component,
            props,
            icon
        });
        console.log('[LDA Debug] Instance registered/updated.');
    }
}
