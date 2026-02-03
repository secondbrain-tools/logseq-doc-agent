import { mount } from 'svelte';
import App from '../App.svelte';
import { Services } from '../services';
import { setupSettings } from './settings-manager';
import { LogseqSettingsAdapter } from '../infra/logseq/settings-adapter';
import '@logseq/libs';

// Standard imports to include in the bundle (dist/index.css)
import '../app.css';
import '../ui/styles/feedback-components.css';
import '../ui/styles/merge-components.css';
import '../ui/styles/modal.css';
import '../ui/styles/chat.css';
import '../ui/styles/diff.css';

import { InitDataService } from '../application/services/init-data.service';

export const setupPlugin = async () => {
    console.log('[src/plugin/index.ts] setupPlugin() called');

    // Inject CSS via Link tag
    const doc = parent.document; // Inject into parent document (Logseq UI)
    if (doc) {
        const linkId = 'logseq-doc-agent-css-bundle';

        // Remove existing
        doc.getElementById(linkId)?.remove();

        // Construct path to index.css
        // import.meta.url points to this script (e.g. .../dist/index.js)
        const cssUrl = new URL('./index.css', import.meta.url).href;

        // Local Bundle
        const link = doc.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = cssUrl;

        doc.head.appendChild(link);

        logseq.beforeunload(async () => {
            doc.getElementById(linkId)?.remove();

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


    // Create the Svelte app (Iframe UI)
    mount(App, {
        target: document.body,
        props: {
            message: 'Hello from Logseq Plugin!'
        }
    });

    // Register Toolbar Chat Button
    services.toolbarInjector.injectToolbarItem(
        'open-chat',
        'ti-message', // Icon class
        'AI Chat',
        () => {
            console.log('[src/plugin/index.ts] Open Chat clicked');
            services.chatUseCase.openChat();
        }
    );

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

    // Handle the pagebar button click
    logseq.provideModel({
        async injectIntoPage() {
            // Wait a bit for DOM to be ready, then inject components
            setTimeout(() => {
                try {
                    services.injectRatingsUseCase.execute();
                    services.injectMergesUseCase.execute();
                } catch (error) {
                    console.error('Error injecting feedback components:', error);
                    logseq.UI.showMsg('Error injecting feedback components', 'error');
                }
            }, 500);
        },
    });
};
