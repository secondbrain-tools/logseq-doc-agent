import { mount, unmount } from 'svelte';
import type { SidebarInjector } from '../../application/ports';
import SidebarWindow from '../../ui/components/SidebarWindow.svelte';

interface SidebarInstance {
    title: string;
    component: any;
    props: any;
    icon?: string;
    status: 'active' | 'detached' | 'pending';
    app?: any;
    container?: HTMLElement;
    indicator?: HTMLElement;
    onMaximize?: () => void;
}

/**
 * Concrete implementation of SidebarInjector for frontend
 */
export class FrontendSidebarInjector implements SidebarInjector {
    private observer: MutationObserver | null = null;
    private sidebarObserver: MutationObserver | null = null;
    private instances: Map<string, SidebarInstance> = new Map();

    constructor() {
        this.setupObserver();
    }

    public dispose() {
        this.disconnectObservers();
        this.instances.forEach((instance) => this.cleanupInstance(instance));
        this.instances.clear();
    }

    private disconnectObservers() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.sidebarObserver) {
            this.sidebarObserver.disconnect();
            this.sidebarObserver = null;
        }
    }

    private cleanupInstance(instance: SidebarInstance) {
        if (instance.app) {
            try {
                unmount(instance.app);
            } catch (e) {
                // Ignore unmount errors
            }
            instance.app = undefined;
        }

        instance.container?.remove();
        instance.indicator?.remove();
        instance.container = undefined;
        instance.indicator = undefined;
        instance.status = 'detached';
    }

    private setupObserver() {
        if (typeof window === 'undefined') return;

        const mainDocument = window.parent?.document || window.top?.document || document;
        let currentSidebarContainer: HTMLElement | null = null;

        const handleSidebarChange = () => {
            const sidebar = this.getSidebarContainer();

            // Structure changed?
            if (sidebar && sidebar !== currentSidebarContainer) {
                currentSidebarContainer = sidebar;

                // Watch the new container for child changes (clearing/re-rendering)
                if (this.sidebarObserver) this.sidebarObserver.disconnect();
                this.sidebarObserver = new MutationObserver(() => this.restoreMissingInstances());
                this.sidebarObserver.observe(sidebar, { childList: true });
            }

            // Always attempt restoration check on structural changes
            this.restoreMissingInstances();
        };

        // Watch document body for major layout changes (sidebar appearing)
        this.observer = new MutationObserver(handleSidebarChange);
        this.observer.observe(mainDocument.body, { childList: true, subtree: true });

        // Initial check
        handleSidebarChange();
    }

    private restoreMissingInstances() {
        const container = this.getSidebarContainer();

        this.instances.forEach((instance) => {
            if (instance.status === 'active' && instance.container && !instance.container.isConnected) {
                // It was active but got detached from DOM
                this.cleanupInstance(instance);
                instance.status = 'detached';
            }

            if (instance.status === 'detached' || instance.status === 'pending') {
                if (container) {
                    this.mountInstance(instance, container);
                }
            }
        });
    }

    private getSidebarContainer(): HTMLElement | null {
        // Logic: #right-sidebar-container -> .cp__right-sidebar-scrollable -> .sidebar-item-list
        const mainDocument = window.parent?.document || window.top?.document || document;
        return mainDocument.querySelector('#right-sidebar-container .sidebar-item-list') as HTMLElement;
    }

    injectIntoSidebar(component: any, props: any, title: string, icon?: string, options?: { onMaximize?: () => void }): void {
        // 1. Ensure sidebar is open
        if (typeof (window as any).logseq?.App?.openRightSidebar === 'function') {
            (window as any).logseq.App.openRightSidebar();
        }

        // 2. Prepare instance data
        let instance = this.instances.get(title);
        if (instance) {
            // Update existing instance
            if (instance.status === 'active') {
                this.cleanupInstance(instance); // Re-mount to update props/component safely
            }
            instance.component = component;
            instance.props = props;
            instance.icon = icon;
            instance.onMaximize = options?.onMaximize;
            instance.status = 'pending'; // Mark for mounting
        } else {
            instance = {
                title,
                component,
                props,
                icon,
                onMaximize: options?.onMaximize,
                status: 'pending'
            };
            this.instances.set(title, instance);
        }

        // 3. Attempt immediate mount
        const container = this.getSidebarContainer();
        if (container) {
            this.mountInstance(instance, container);
        } else {
            // Retry briefly for animation delays, otherwise leave as 'pending' for observer
            setTimeout(() => {
                if (instance && instance.status === 'pending') {
                    const retryContainer = this.getSidebarContainer();
                    if (retryContainer) {
                        this.mountInstance(instance, retryContainer);
                    }
                }
            }, 100);
        }
    }

    private mountInstance(instance: SidebarInstance, container: HTMLElement) {
        // Defensive: ensure cleanup if somehow partially initialized
        this.cleanupInstance(instance);

        // 1. Create containers
        const windowContainer = document.createElement('div');
        windowContainer.style.display = 'contents';

        const dropIndicator = document.createElement('div');
        dropIndicator.className = 'sidebar-drop-indicator';
        dropIndicator.style.height = '10px';

        // Prepend to top
        container.insertBefore(windowContainer, container.firstChild);
        container.insertBefore(dropIndicator, container.firstChild);

        // 2. Mount Svelte component
        const app = mount(SidebarWindow, {
            target: windowContainer,
            props: {
                title: instance.title,
                icon: instance.icon,
                component: instance.component,
                componentProps: instance.props,
                onMaximize: instance.onMaximize,
                onClose: () => this.handleClose(instance.title, instance.props)
            }
        });

        // 3. Update state
        instance.app = app;
        instance.container = windowContainer;
        instance.indicator = dropIndicator;
        instance.status = 'active';
    }

    private handleClose(title: string, props: any) {
        // User manually closed the sidebar window
        if (props && typeof props.onClose === 'function') {
            try {
                props.onClose();
            } catch (err) {
                console.error('Error in component onClose:', err);
            }
        }

        const instance = this.instances.get(title);
        if (instance) {
            this.cleanupInstance(instance);
            this.instances.delete(title);
        }
    }

    toggleWindowMaximize(title: string): void {
        const instance = this.instances.get(title);
        if (instance?.app && typeof instance.app.toggleMaximize === 'function') {
            instance.app.toggleMaximize();
        }
    }
}
