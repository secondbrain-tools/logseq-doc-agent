import { mount } from 'svelte';
// App.svelte import removed
import { Services } from '../services';
import { setupSettings } from './settings-manager';
import { LogseqSettingsAdapter } from '../infra/logseq/settings-adapter';
import '@logseq/libs';

// Standard imports to include in the bundle (dist/index.css)
// We use ?inline to get the processed CSS string for injection
import appCss from '../app.css?inline';
import feedbackCss from '../ui/styles/feedback-components.css?inline';
import mergeCss from '../ui/styles/merge-components.css?inline';
import modalCss from '../ui/styles/modal.css?inline';
import chatCss from '../ui/styles/chat.css?inline';
import diffCss from '../ui/styles/diff.css?inline';

import { InitDataService } from '../application/services/init-data.service';

export const setupPlugin = async () => {
    console.log('[src/plugin/index.ts] setupPlugin() called');

    // Inject CSS via Style tag (robust for both dev and prod)
    const doc = parent.document; // Inject into parent document (Logseq UI)
    if (doc) {
        const styleId = 'logseq-doc-agent-css-bundle';

        // Remove existing
        doc.getElementById(styleId)?.remove();

        // Combine all CSS
        const cssContent = `
            ${appCss}
            ${feedbackCss}
            ${mergeCss}
            ${modalCss}
            ${chatCss}
            ${diffCss}
        `;

        console.log('[DEBUG-CSS] appCss length:', appCss?.length, 'content slice:', appCss?.slice(0, 50));
        console.log('[DEBUG-CSS] feedbackCss length:', feedbackCss?.length);
        console.log('[DEBUG-CSS] mergeCss length:', mergeCss?.length, 'content slice:', mergeCss?.slice(0, 50));
        console.log('[DEBUG-CSS] Total CSS length:', cssContent.length);

        // Create style element
        const style = doc.createElement('style');
        style.id = styleId;
        style.textContent = cssContent;

        doc.head.appendChild(style);

        logseq.beforeunload(async () => {
            doc.getElementById(styleId)?.remove();

            // Clean up sidebar instances to prevent dangling elements
            Services.instance.sidebarInjector.dispose();

            // Clean up injected ratings and merge icons
            Services.instance.injectRatingsUseCase.dispose();
            Services.instance.injectMergesUseCase.dispose();
        });
    }

    // Initialize/Get Services
    const services = Services.instance;

    // Instantiate InitDataService locally
    const settingsAdapter = new LogseqSettingsAdapter();
    const initDataService = new InitDataService(services.logseqApi, settingsAdapter);

    // Setup user settings
    await setupSettings();

    // Initialize Plugin Data (Pages/Defaults)
    await initDataService.initialize();

    // Ensure built-in agents (Default, Ask) exist
    await services.initializeAgents();

    // Re-run initialization if storageRoot changes
    logseq.onSettingsChanged(async (newSettings, oldSettings) => {
        const newRoot = newSettings['storageRoot'];
        const oldRoot = oldSettings['storageRoot'];
        if (newRoot !== oldRoot) {
            console.log(`[Plugin] Storage root changed from ${oldRoot} to ${newRoot}`);
            await initDataService.migrateStorageRoot(oldRoot, newRoot);
        }
    });


    // Register Toolbar Chat Button
    services.toolbarInjector.injectToolbarItem(
        'open-chat',
        'ti-message', // Icon class
        'AI Chat',
        () => {
            services.chatUseCase.openChat({ focus: true });
        }
    );

    // Register Merge Toolbar Pagebar Item (placeholder for dynamic content)
    services.injectMergesUseCase.registerPagebarItem();

    // Register Command Palette & Hotkey for Opening Chat
    logseq.App.registerCommandPalette({
        key: 'open-chat-palette',
        label: 'Open Chat',
        keybinding: {
            binding: 'g c',
            mode: 'non-editing'
        }
    }, () => {
        console.log("goto chat");
        services.chatUseCase.openChat({ focus: true });
    });

    logseq.App.registerCommandPalette({
        key: 'toggle-chat-expand',
        label: 'Toggle Chat Expand',
        keybinding: {
            binding: 'alt+c',
            mode: 'global'
        }
    }, () => {
        console.log("toggle chat expand");
        services.chatUseCase.toggleExpand();
    });

    // Register a slash command to get block content
    logseq.Editor.registerSlashCommand('Get Block Content', async () => {
        try {
            const currentPage = await logseq.Editor.getCurrentPage();
            if (currentPage && currentPage.uuid) {
                console.log('Current page:', currentPage);
            } else {
                await logseq.UI.showMsg('No current page found', 'error');
            }
        } catch (error) {
            console.error('Error getting block content:', error);
            await logseq.UI.showMsg('Error getting block content', 'error');
        }
    });

    // Register a block context menu item
    logseq.Editor.registerBlockContextMenuItem('Inspect Feedback Prompts', async ({ uuid }: { uuid: string }) => {
        try {
            console.log('[Inspect Feedback Query] Triggered for block:', uuid);

            const prompts = await services.promptRepo.getFeedbackPrompts();

            console.log('[Inspect Feedback Query] found prompts:', prompts);
            console.table(prompts);
            logseq.UI.showMsg(`Found ${prompts.length} feedback prompts. Check console for details.`, 'success');

        } catch (error) {
            console.error('Error inspecting prompts:', error);
            await logseq.UI.showMsg('Error inspecting prompts', 'error');
        }
    });

    // Register a pagebar button (Legacy/Debug)
    logseq.App.registerUIItem('pagebar', {
        key: 'hello-world',
        template: '<a title="logseq-doc-agent" style="font-size:15px;color:#1f9ee1;opacity:unset" data-on-click="injectIntoPage" class="button icon">.🤖</a>'
    });

    // Helper for debouncing
    const debounce = (func: Function, wait: number) => {
        let timeout: any;
        return (...args: any[]) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    };

    // Unified injection function
    const injectComponents = async () => {
        // Small delay to ensure DOM is ready (especially for route changes)
        setTimeout(() => {
            try {
                services.injectRatingsUseCase.execute();
                services.injectMergesUseCase.execute();
            } catch (error) {
                console.error('Error injecting feedback components:', error);
            }
        }, 100);
    };

    // 1. Route Changed Listener
    logseq.App.onRouteChanged(() => {
        console.log('[src/plugin/index.ts] Route changed, triggering injection...');
        injectComponents();
    });

    // 2. DB Changed Listener (Debounced)
    // This handles block updates, creation, deletion, moves etc.
    const debouncedOnDbChanged = debounce(() => {
        console.log('[src/plugin/index.ts] DB changed, triggering injection...');
        injectComponents();
    }, 500);

    logseq.DB.onChanged((e) => {
        // Optional: Filter events if needed, but for now we just debounce everything
        debouncedOnDbChanged();
    });

    // Handle the pagebar button click
    logseq.provideModel({
        async injectIntoPage() {
            console.log('[src/plugin/index.ts] Manual injection triggered');
            injectComponents();
        },
    });

    // Initial injection on startup (after DOM is ready)
    console.log('[src/plugin/index.ts] Scheduling initial injection...');
    setTimeout(() => {
        console.log('[src/plugin/index.ts] Running initial injection');
        injectComponents();
    }, 500);
};
