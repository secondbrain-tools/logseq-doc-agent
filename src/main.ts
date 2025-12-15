import '@logseq/libs'
import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

// This is the main entry point for the Logseq plugin
const main = async () => {
  console.log('Hello World Logseq Plugin loaded!')

  // Create the Svelte app
  const app = mount(App, {
    target: document.body,
    props: {
      message: 'Hello from Logseq Plugin!'
    }
  })

  // Register a slash command
  logseq.Editor.registerSlashCommand('Hello World', async () => {
    await logseq.UI.showMsg('Hello World from Logseq Plugin!', 'success')
  })

  // Register a block context menu item
  logseq.Editor.registerBlockContextMenuItem('Say Hello', async ({ uuid }) => {
    const block = await logseq.Editor.getBlock(uuid)
    if (block) {
      await logseq.UI.showMsg(`Hello from block: ${block.content}`, 'info')
    }
  })

  // Register a toolbar button
  logseq.App.registerUIItem('toolbar', {
    key: 'hello-world',
    template: '<a class="button" data-on-click="showHello">Hello</a>',
  })

  // Handle the toolbar button click
  logseq.provideModel({
    async showHello() {
      await logseq.UI.showMsg('Hello from toolbar button!', 'success')
    }
  })
}

// Initialize the plugin when Logseq is ready
logseq.ready(main).catch(console.error)
