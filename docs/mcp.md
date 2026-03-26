# Model Context Protocol (MCP) Servers

This project provides two MCP servers to enable AI agents to interact with Logseq at different levels of integration.

## 1. Electron MCP Server (Real App)

Allows AI agents to control a real Logseq Electron instance. This is useful for high-fidelity automation, graph manipulation, and testing real-world scenarios.

### Setup
The Electron MCP server uses an isolated environment in `.logseq/` to avoid polluting your main Logseq configuration.

1.  **Initialize the environment**:
    Before running the MCP server for the first time, you must initialize the isolated environment by selecting a graph directory (`tests/graph`).
    ```bash
    npm run start:legacy
    ```
    When Logseq opens, select or create a graph in the recommended directory: `tests/testgraph`.

2.  **Start the MCP Server**:
    ```bash
    npm run start:mcp:legacy
    ```

### Technical Details
- **Script**: `scripts/mcp-logseq.ts`
- **Isolated Home**: `.logseq/home`
- **Isolated Config**: `.logseq/xdg`
- **Logseq Binary**: Cached in `.logseq/app`
- **Protocol**: Standard Input/Output (stdio)

---

## 2. Simulator MCP Server (Web)

Allows AI agents to interact with the Logseq UI simulator (`tests/logseq-sim.html`). This is ideal for rapid UI development, component testing, and generating Playwright tests.

### Setup
1.  **Start the development server**:
    ```bash
    npm run dev
    ```

2.  **Run the MCP Command**:
    The AI client should be configured to run:
    ```bash
    npm run test:mcp
    ```

### Technical Details
- **Underlying Tool**: `@playwright/mcp`
- **Target URL**: `http://localhost:9000/tests/logseq-sim.html`
- **Use Case**: UI-only testing and test generation.

---

## AI Client Configuration

To use these servers with an AI client (like Claude Desktop or Antigravity), add them to your configuration:

### Example Configuration (JSON)
```json
{
  "mcpServers": {
    "logseq-electron": {
      "command": "npm",
      "args": ["run", "start:mcp:legacy"],
      "cwd": "/path/to/logseq-doc-agent"
    },
    "logseq-sim": {
      "command": "npm",
      "args": ["run", "test:mcp"],
      "cwd": "/path/to/logseq-doc-agent"
    }
  }
}
```

> [!IMPORTANT]
> Always ensure you have run the initialization step (`npm run start:legacy`) for the Electron MCP server, otherwise it will exit with an error.
