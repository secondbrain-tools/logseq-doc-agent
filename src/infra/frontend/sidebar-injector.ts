import { mount, unmount } from 'svelte';
import type { SidebarInjector } from '../../application/ports';
import SidebarWindow from '../../ui/components/SidebarWindow.svelte';

/**
 * Concrete implementation of SidebarInjector for frontend
 */
export class FrontendSidebarInjector implements SidebarInjector {
    private instances = new Map<string, { app: any, container: HTMLElement, indicator: HTMLElement }>();

    private getSidebarContainer(): HTMLElement | null {
        // Try to find the inner content list directly
        // Logic: #right-sidebar-container -> .cp__right-sidebar-scrollable -> .sidebar-item-list
        const mainDocument = window.parent?.document || window.top?.document || document;
        console.log('[LDA Debug] looking for sidebar container in document:', mainDocument === document ? 'current' : 'parent');

        // In sim: #right-sidebar-container .cp__right-sidebar-scrollable .sidebar-item-list
        // In Logseq real: same usually.
        const container = mainDocument.querySelector('#right-sidebar-container .sidebar-item-list');
        console.log('[LDA Debug] found container?', !!container, container);
        return container as HTMLElement;
    }

    injectIntoSidebar(component: any, props: any, title: string, icon?: string): void {
        console.log('[LDA Debug] injectIntoSidebar called with title:', title);

        // Always attempt to open the sidebar to ensure it's visible.
        // This fixes the issue in simulation where container exists (hidden) but sidebar is visually closed.
        if (typeof (window as any).logseq?.App?.openRightSidebar === 'function') {
            console.log('[LDA Debug] calling logseq.App.openRightSidebar() to ensure visibility');
            (window as any).logseq.App.openRightSidebar();
        }

        let container = this.getSidebarContainer();

        // Cleanup existing instance if any
        if (this.instances.has(title)) {
            console.log('[LDA Debug] removing existing sidebar instance for title:', title);
            const old = this.instances.get(title)!;
            try {
                unmount(old.app);
                old.container.remove();
                old.indicator.remove();
            } catch (e) {
                console.warn('[LDA Debug] error removing old sidebar instance:', e);
            }
            this.instances.delete(title);
        }

        if (!container) {
            console.log('[LDA Debug] Container not found immediately after open request.');

            // Retry finding container after a short delay or check immediately if update is synchronous (Sim is effectively synch via event but React/Preact might take a tick)
            // Since Preact renders asynchronously, we might need to wait properly.
            // For now, let's just warn if still missing, or set a retry.
            // But typically we can't wait in a sync method.
            // We will assume the sidebar opens.
        }

        // Slight hack: if we just opened it, we might need a microtask for DOM to update.
        // Ideally this method should be async, but the interface is void.
        // We can use setTimeout to defer injection if container is missing initially.
        if (!container) {
            console.log('[LDA Debug] Container still missing, retrying in 100ms...');
            setTimeout(() => this.injectIntoSidebar(component, props, title, icon), 100);
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
        // Order desired: Drop -> Window -> ...
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
                    // Cleanup when closed
                    if (this.instances.get(title)?.app === sidebarWindowApp) {
                        this.instances.delete(title);
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
            indicator: dropIndicator
        });
    }
}
