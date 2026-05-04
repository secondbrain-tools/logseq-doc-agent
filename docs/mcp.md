# Model Context Protocol (MCP) Servers

This project provides two MCP servers to enable AI agents to interact with Logseq at different levels of integration.

## 1. Electron MCP Server (Real App)

Allows AI agents to control a real Logseq Electron instance. This is useful for high-fidelity automation, graph manipulation, and testing real-world scenarios.

### Setup
The Electron MCP server uses an isolated environment in `logseq-environments/mcp/` to avoid polluting your main Logseq configuration.

1.  **Initialize the MCP profile once**:
    ```bash
    npm run start:mcp:init:legacy
    ```
    When Logseq opens, manually select this graph directory:
    ```text
    logseq-environments/mcp/legacy/graph
    ```
    Then close Logseq again.

2.  **Start the MCP Server**:
    ```bash
    npm run start:mcp:legacy
    ```

For the DB channel, use:
```bash
npm run start:mcp:init:db
npm run start:mcp:db
```
The default `db` channel is configured in [logseq-versions.jsonc](/home/st6ka8/Code/logseq-doc-agent/logseq-versions.jsonc) to use a local binary directory at `logseq-environments/app/db/beta`. Put the OS-specific beta build there, for example `Logseq-linux-x86_64-*.AppImage`.
The DB runtime graph is seeded via the Logseq API into the built-in demo graph location:
```text
logseq-environments/mcp/db/home/logseq/graphs/Demo
```

3.  **Reconnect your MCP client if needed**:
    Some harnesses cache the server definition but require a manual reconnect after restart.

### Failure mode
If the MCP profile was not initialized, `start:mcp:legacy` fails fast with an instruction to run `npm run start:mcp:init:legacy`.

### Technical Details
- **Init Script**: `scripts/run-logseq.ts legacy --mcp`
- **Server Script**: `scripts/mcp-logseq.ts`
- **Isolated Runtime Dir**: `logseq-environments/mcp/<channel>/`
- **Isolated Home**: `logseq-environments/mcp/<channel>/home`
- **Isolated Config**: `logseq-environments/mcp/<channel>/xdg`
- **Graph Dir**: `logseq-environments/mcp/<channel>/graph`
- **DB Graph Dir**: `logseq-environments/mcp/db/home/logseq/graphs/Demo`
- **Logseq Binary**: Cached in `logseq-environments/app`
- **Protocol**: Standard Input/Output (stdio)
- **Behavior**: Manual one-time graph bootstrap, then strict preflight validation
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

## 3. Electron E2E Runtime (Manual Bootstrap)

The Electron Playwright tests use a separate isolated environment in `logseq-environments/e2e/`.

### Setup
1.  **Initialize the E2E profile once**:
    ```bash
    npm run start:e2e:init:legacy
    ```
    When Logseq opens, manually select this graph directory:
    ```text
    logseq-environments/e2e/legacy/graph
    ```
    Then close Logseq again.

2.  **Run E2E tests**:
    ```bash
    npm run test:e2e:legacy
    ```

### Failure mode
If the E2E profile was not initialized, the test runner fails immediately with instructions to run `npm run start:e2e:init:legacy`.

For the DB channel, initialize and run:
```bash
npm run start:e2e:init:db
npm run test:e2e:db
```
For DB, the seeded graph lives at:
```text
logseq-environments/e2e/db/home/logseq/graphs/Demo
```

### Why this approach
- avoids flaky native folder-dialog automation
- keeps MCP and E2E deterministic
- prevents accidental fallback to the demo/memory graph

---

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
    "logseq-electron-db": {
      "command": "npm",
      "args": ["run", "start:mcp:db"],
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
> Always ensure you have run the initialization step (`npm run start:mcp:init:legacy`) for the Electron MCP server, otherwise it will exit with an error.
