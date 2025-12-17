import '@logseq/libs'
import { mount } from 'svelte'
import './app.css'
import './ui/styles/feedback-components.css'
import App from './App.svelte'
import { injectFeedbackComponents, removeFeedbackComponents } from './infra/domUtils'
import { InjectRatingsUseCase } from './application/usecases/inject-ratings.usecase';
import { FrontendComponentInjector } from './infra/frontend'
import cssContent from './ui/styles/feedback-components.css?raw';
import { LogseqStyleInjector } from './infra/logseq'

// This is the main entry point for the Logseq plugin
const main = async () => {
  
  // Create the Svelte app
  const app = mount(App, {
    target: document.body,
    props: {
      message: 'Hello from Logseq Plugin!'
    }
  })

  // Register a slash command
/*  logseq.Editor.registerSlashCommand('Hello World', async () => {
    await logseq.UI.showMsg('Hello World from Logseq Plugin!', 'success')
  })*/

  // Register a block context menu item
  /*logseq.Editor.registerBlockContextMenuItem('Say Hello', async ({ uuid }) => {
    const block = await logseq.Editor.getBlock(uuid)
    if (block) {
      await logseq.UI.showMsg(`Hello from block: ${block.content}`, 'info')
    }
  })

  // Register a toolbar button
  logseq.App.registerUIItem('toolbar', {
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
      
      // Remove any existing feedback components first
      removeFeedbackComponents()
      
      // Wait a bit for DOM to be ready, then inject components
      setTimeout(() => {
        try {
          
          
          
          
          new InjectRatingsUseCase(new FrontendComponentInjector(),  new LogseqStyleInjector()).execute();
          //logseq.UI.showMsg(`Injected feedback components!`, 'success')
        } catch (error) {
          console.error('Error injecting feedback components:', error)
          logseq.UI.showMsg('Error injecting feedback components', 'error')
        }
      }, 500)
    }
  })
}

// Initialize the plugin when Logseq is ready
logseq.ready(main).catch(console.error)
