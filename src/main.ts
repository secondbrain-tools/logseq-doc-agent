import '@logseq/libs'
import { mount } from 'svelte'
import './app.css'
import './ui/styles/feedback-components.css'
import App from './App.svelte'
import { InjectRatingsUseCase } from './application/usecases/inject-ratings.usecase';
import { FrontendComponentInjector, FrontendStyleInjector } from './infra/frontend'
import { LogseqApiImpl } from './infra/logseq'


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
  logseq.Editor.registerBlockContextMenuItem('Get Block Content', async ({ uuid }: { uuid: string }) => {
    try {
    } catch (error) {
      console.error('Error getting block content:', error);
      await logseq.UI.showMsg('Error getting block content', 'error');
    }
  })

  // Register a toolbar button
  /*logseq.App.registerUIItem('toolbar', {
    key: 'hello-world',
    template: '<a title="logseq-doc-agent" style="font-size:15px;color:#1f9ee1;opacity:unset" data-on-click="showHello" class="button icon">.🤖</a>'
    //template: '<button data-on-click="showHello">🤖</button>',
  })*/

  logseq.App.registerUIItem('pagebar', {
    key: 'hello-world',
    template: '<a title="logseq-doc-agent" style="font-size:15px;color:#1f9ee1;opacity:unset" data-on-click="injectIntoPage" class="button icon">.🤖</a>'
    //template: '<button data-on-click="showHello">🤖</button>',
  })

  // Handle the toolbar button click
  logseq.provideModel({
    async injectIntoPage() {
      //await logseq.UI.showMsg('Injecting feedback components!', 'info')

      // Wait a bit for DOM to be ready, then inject components
      setTimeout(() => {
        try {

          new InjectRatingsUseCase(new FrontendComponentInjector(), new FrontendStyleInjector(), new LogseqApiImpl).execute();
          //logseq.UI.showMsg(`Injected feedback components!`, 'success')
        } catch (error) {
          console.error('Error injecting feedback components:', error)
          logseq.UI.showMsg('Error injecting feedback components', 'error')
        }
      }, 500)
    },


  })
}

// Initialize the plugin when Logseq is ready
logseq.ready(main).catch(console.error)
