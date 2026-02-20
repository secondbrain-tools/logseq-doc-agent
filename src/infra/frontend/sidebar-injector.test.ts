import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FrontendSidebarInjector } from './sidebar-injector';
import { mount, unmount } from 'svelte';

// Mock Svelte mount/unmount
vi.mock('svelte', () => ({
    mount: vi.fn(() => ({ toggleMaximize: vi.fn() })),
    unmount: vi.fn(),
}));

describe('FrontendSidebarInjector', () => {
    let injector: FrontendSidebarInjector;
    let sidebarContainer: HTMLElement;

    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = '';

        // Setup basic sidebar structure
        const mainContainer = document.createElement('div');
        mainContainer.id = 'right-sidebar-container';
        sidebarContainer = document.createElement('div');
        sidebarContainer.className = 'sidebar-item-list';
        mainContainer.appendChild(sidebarContainer);
        document.body.appendChild(mainContainer);

        // Mock Logseq App API
        vi.stubGlobal('logseq', {
            App: {
                openRightSidebar: vi.fn(),
            },
        });

        // Mock window.parent/top to point to current window for simplicity
        vi.stubGlobal('parent', window);
        vi.stubGlobal('top', window);

        injector = new FrontendSidebarInjector();
    });

    afterEach(() => {
        if (injector) injector.dispose();
        vi.restoreAllMocks();
    });

    it('should inject component into sidebar', () => {
        const component = {};
        const props = { foo: 'bar' };
        const title = 'Test Sidebar';

        injector.injectIntoSidebar(component, props, title);

        // @ts-ignore
        expect(window.logseq.App.openRightSidebar).toHaveBeenCalled();
        expect(mount).toHaveBeenCalled();

        // Check if container was added to sidebar
        // The injector adds a wrapper div
        expect(sidebarContainer.children.length).toBeGreaterThan(0);
    });

    it('should remove component when disposed', () => {
        const component = {};
        const title = 'Test Sidebar';

        injector.injectIntoSidebar(component, {}, title);
        expect(mount).toHaveBeenCalled();

        injector.dispose();
        expect(unmount).toHaveBeenCalled();
    });
});
