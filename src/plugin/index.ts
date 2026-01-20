
import { mount } from 'svelte';
import App from '../App.svelte';
import { Services, doc } from '../services';
import { setupSettings } from './settings-manager';
import logseqCSS from '../app.css?inline';
import feedbackCSS from '../ui/styles/feedback-components.css?inline';

export const setupPlugin = async () => {
    console.log('[src/plugin/index.ts] setupPlugin() called');

    const services = Services.instance;

    // Initialize Settings
    setupSettings();

    // Create the Svelte app
    const app = mount(App, {
        target: document.body,
        props: {
            message: 'Hello from Logseq Plugin!'
        }
    });

    // Inject CSS into Logseq main window
    setTimeout(() => {
        try {
            if (doc.head) {
                // Remove existing if any (for HMR/reload safety)
                doc.getElementById('logseq-doc-agent-css')?.remove();

                const key = 'logseq-doc-agent-css';
                const cssContent = `${logseqCSS}\n${feedbackCSS}`;
                const styleHtml = `<style id="${key}">${cssContent}</style>`;

                doc.head.insertAdjacentHTML('beforeend', styleHtml);
                console.log('[src/plugin/index.ts] Injected Inline CSS');
            }
        } catch (e) {
            console.error('[src/plugin/index.ts] Failed to inject CSS', e);
        }
    }, 100);

    // Register cleanup
    logseq.beforeunload(async () => {
        doc.getElementById('logseq-doc-agent-css')?.remove();
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
                // Logic was empty in main.ts, keeping it empty or just logging
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
                } catch (error) {
                    console.error('Error injecting feedback components:', error);
                    logseq.UI.showMsg('Error injecting feedback components', 'error');
                }
            }, 500);
        },
    });
};
