<script lang="ts">
  import { onMount } from 'svelte'
  
  let { message = 'Hello World!' } = $props()
  
  let greeting = $state('Loading...')
  
  onMount(async () => {
    // Get current graph info when component mounts
    try {
      const graph = await logseq.App.getCurrentGraph()
      greeting = message + (graph ? ` in graph: ${graph.name}` : '!')
    } catch (error) {
      greeting = message + '!'
    }
  })
  
  async function sayHello() {
    await logseq.UI.showMsg('Hello from Svelte component!', 'success')
  }
  
  async function createHelloBlock() {
    const currentPage = await logseq.Editor.getCurrentPage()
    if (currentPage && currentPage.uuid) {
      const block = await logseq.Editor.appendBlockInPage(
        currentPage.uuid,
        'Hello World from Logseq Plugin! 🎉'
      )
      if (block) {
        await logseq.UI.showMsg('Hello World block created!', 'success')
      }
    } else {
      await logseq.UI.showMsg('No current page found', 'error')
    }
  }
</script>

<div class="hello-container">
  <h2>{greeting}</h2>
  <p>This is a hello world Logseq plugin built with Svelte!</p>
  
  <div class="button-group">
    <button onclick={sayHello}>
      Say Hello
    </button>
    <button onclick={createHelloBlock}>
      Create Hello Block
    </button>
  </div>
  
  <div class="info">
    <h3>Features:</h3>
    <ul>
      <li>Slash command: <code>/Hello World</code></li>
      <li>Right-click on blocks and select "Say Hello"</li>
      <li>Toolbar button with "Hello" text</li>
      <li>Interactive UI with buttons</li>
    </ul>
  </div>
</div>

<style>
  .hello-container {
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 500px;
    margin: 0 auto;
  }
  
  h2 {
    color: #2563eb;
    margin-bottom: 16px;
  }
  
  .button-group {
    display: flex;
    gap: 12px;
    margin: 20px 0;
  }
  
  button {
    background-color: #2563eb;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s;
  }
  
  button:hover {
    background-color: #1d4ed8;
  }
  
  .info {
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px;
    margin-top: 20px;
  }
  
  .info h3 {
    margin-top: 0;
    color: #334155;
  }
  
  .info ul {
    margin: 8px 0;
    padding-left: 20px;
  }
  
  .info li {
    margin: 4px 0;
    color: #64748b;
  }
  
  code {
    background-color: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 13px;
  }
</style>
