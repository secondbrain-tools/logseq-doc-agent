---
description: Start the MCP server for the Logseq Electron app
---

This workflow starts the `electron-playwright-mcp` server, allowing AI agents to interact with the Logseq Desktop application.

// turbo
1. Start the MCP server for the legacy Logseq app:
   ```bash
   npm run start:mcp:legacy
   ```

2. Once started, you can configure your MCP client (like Claude Desktop or Antigravity) to use this server.

### Configuration for Claude Desktop
Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "logseq-desktop": {
      "command": "node",
      "args": [
        "$(pwd)/node_modules/electron-playwright-mcp/dist/index.js",
        "$(path-to-logseq-executable)"
      ]
    }
  }
}
```

> [!NOTE]
> The `npm run start:mcp:legacy` command automatically resolves the Logseq executable path using the project's setup scripts.
