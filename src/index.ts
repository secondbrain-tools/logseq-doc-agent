import '@logseq/libs'
import { mount } from 'svelte'
import App from './App.svelte'

const main = async () => {
  console.log('logseq-doc-agent plugin loaded')

  // Create a simple hello world UI
  const app = mount(App, {
    target: document.body,
  })

  // Register a simple command
  logseq.Editor.registerSlashCommand('Hello World', async () => {
    await logseq.UI.showMsg('Hello World from Logseq Plugin!', 'success')
  })

  // Register a block context menu item
  logseq.Editor.registerBlockContextMenuItem('Hello World', async ({ uuid }) => {
    const block = await logseq.Editor.getBlock(uuid)
    if (block) {
      await logseq.UI.showMsg(`Hello World from block: ${block.content}`, 'info')
    }
  })
}

logseq.ready(main).catch(console.error)