import '@logseq/libs'
import { mount } from 'svelte'
import './app.css'
import './ui/styles/feedback-components.css'
import App from './App.svelte'
import { InjectRatingsUseCase } from './application/usecases/inject-ratings.usecase';
import { FrontendComponentInjector, FrontendStyleInjector } from './infra/frontend'
import { LogseqApiImpl } from './infra/logseq'
import { LogseqPromptRepository } from './infra/logseq/prompt-repo';
import { ChatSidebarUseCase } from './application/usecases/chat-sidebar.usecase';
import { FrontendSidebarInjector } from './infra/frontend/sidebar-injector';
import { FrontendToolbarInjector } from './infra/frontend/toolbar-injector';


// Force usage of global logseq (Mock in sim, Real in App)
// This prevents the bundled SDK from trying to initialize its own connection which fails in sim
console.log('[src/main.ts] Initializing...');
const logseq = (window as any).logseq;
console.log('[src/main.ts] logseq object:', logseq);

// This is the main entry point for the Logseq plugin
const main = async () => {
  console.log('[src/main.ts] main() called');

  // Create the Svelte app
  const app = mount(App, {
    target: document.body,
    props: {
      message: 'Hello from Logseq Plugin!'
    }
  })

  // Initialize dependencies
  const sidebarInjector = new FrontendSidebarInjector();
  const toolbarInjector = new FrontendToolbarInjector();
  const chatUseCase = new ChatSidebarUseCase(sidebarInjector);

  // Register Toolbar Chat Button
  toolbarInjector.injectToolbarItem(
    'open-chat',
    'ti-message', // Icon class
    'AI Chat',
    () => {
      console.log('[src/main.ts] Open Chat clicked');
      chatUseCase.openChat();
    }
  );

  // Register a slash command to get block content
  logseq.Editor.registerSlashCommand('Get Block Content', async () => {
    try {
      // Get the current page
      const currentPage = await logseq.Editor.getCurrentPage();
      if (currentPage && currentPage.uuid) {
      } else {
        await logseq.UI.showMsg('No current page found', 'error');
      }
    } catch (error) {
      console.error('Error getting block content:', error);
      await logseq.UI.showMsg('Error getting block content', 'error');
    }
  })

  // Register a block context menu item
  logseq.Editor.registerBlockContextMenuItem('Inspect Feedback Prompts', async ({ uuid }: { uuid: string }) => {
    try {
      console.log('[Inspect Feedback Query] Triggered for block:', uuid);

      const api = new LogseqApiImpl();
      const repo = new LogseqPromptRepository(api);
      const prompts = await repo.getFeedbackPrompts();

      console.log('[Inspect Feedback Query] found prompts:', prompts);

      console.table(prompts);
      logseq.UI.showMsg(`Found ${prompts.length} feedback prompts. Check console for details.`, 'success');

    } catch (error) {
      console.error('Error getting block content:', error);
      await logseq.UI.showMsg('Error getting block content', 'error');
    }
  })

  // Register a pagebar button (Legacy/Debug)
  logseq.App.registerUIItem('pagebar', {
    key: 'hello-world',
    template: '<a title="logseq-doc-agent" style="font-size:15px;color:#1f9ee1;opacity:unset" data-on-click="injectIntoPage" class="button icon">.🤖</a>'
  })

  // Handle the pagebar button click
  logseq.provideModel({
    async injectIntoPage() {
      // Wait a bit for DOM to be ready, then inject components
      setTimeout(() => {
        try {
          new InjectRatingsUseCase(new FrontendComponentInjector(), new FrontendStyleInjector(), new LogseqApiImpl).execute();
        } catch (error) {
          console.error('Error injecting feedback components:', error)
          logseq.UI.showMsg('Error injecting feedback components', 'error')
        }
      }, 500)
    },
  })
}

// Initialize the plugin when Logseq is ready
import { setupSettings } from './settings';

logseq.ready(async () => {
  // Initialize settings
  setupSettings();

  await main();
}).catch(console.error)

