# Hello World Logseq Plugin

A simple "Hello World" plugin for Logseq built with Svelte, TypeScript, and Vite. This plugin demonstrates the basic structure and functionality of a Logseq plugin.

## Features

- **Slash Command**: Type `/Hello World` in any block to trigger a hello message
- **Context Menu**: Right-click on any block and select "Say Hello" to get a contextual greeting
- **Toolbar Button**: A "Hello" button in the toolbar for quick access
- **Interactive UI**: A Svelte-based interface with buttons to interact with Logseq

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the plugin:
   ```bash
   npm run build
   ```
4. Load the plugin in Logseq:
   - Open Logseq
   - Go to Settings → Plugins
   - Click "Load unpacked plugin"
   - Select the `dist` folder from this project

## Development

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

### Project Structure

```
src/
├── main.ts          # Main plugin entry point
├── App.svelte       # Main UI component
├── index.ts         # Alternative entry point
└── assets/          # Static assets
```

## Usage

Once installed, you can:

1. Use the slash command `/Hello World` in any block
2. Right-click on blocks and select "Say Hello" from the context menu
3. Click the "Hello" button in the toolbar
4. Interact with the UI components that appear when the plugin is loaded

## Plugin API Usage

This plugin demonstrates several Logseq API features:

- `logseq.ready()` - Initialize the plugin
- `logseq.Editor.registerSlashCommand()` - Register slash commands
- `logseq.Editor.registerBlockContextMenuItem()` - Add context menu items
- `logseq.App.registerUIItem()` - Add UI elements to the toolbar
- `logseq.UI.showMsg()` - Display messages to the user
- `logseq.Editor.insertBlock()` - Create new blocks

## Customization

To customize this plugin for your own needs:

1. Update the `logseq` section in `package.json` with your plugin details
2. Modify the UI components in `src/App.svelte`
3. Add new functionality in `src/main.ts`
4. Update the icon in `public/icon.png`

## Resources

- [Logseq Plugin Development Guide](https://logseq.github.io/plugins/)
- [Logseq Plugin API Reference](https://logseq.github.io/plugins/api/)
- [Svelte Documentation](https://svelte.dev/docs)
- [Vite Documentation](https://vite.dev/guide/)

## License

MIT License - feel free to use this as a template for your own Logseq plugins!
