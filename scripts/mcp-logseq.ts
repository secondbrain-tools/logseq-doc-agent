// scripts/mcp-logseq.ts
import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
// import { primeGraphSelection } from "./logseq/graph-bootstrap"; // temporarily disabled

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Setup isolated directories in .logseq
const logseqDir = path.join(rootDir, ".logseq", "mcp");
const homeDir = path.join(logseqDir, "home");
const xdgDir = path.join(logseqDir, "xdg");
const graphTemplateDir = path.resolve(rootDir, "tests/graph-template");
const graphDir = path.resolve(rootDir, ".logseq/mcp/graph");

// Always start from a clean template
console.error(`[mcp-logseq] Copying graph-template → ${graphDir}...`);
fs.rmSync(graphDir, { recursive: true, force: true });
fs.mkdirSync(graphDir, { recursive: true });
fs.cpSync(graphTemplateDir, graphDir, { recursive: true });

fs.mkdirSync(homeDir, { recursive: true });
fs.mkdirSync(xdgDir, { recursive: true });
fs.mkdirSync(graphDir, { recursive: true });

const channel = process.argv[2] || "legacy";

console.error(`[mcp-logseq] Setting up Logseq (${channel}) with isolated data in ${logseqDir}...`);

let setupOutput: string;
try {
  setupOutput = execSync(`npx tsx scripts/setup-logseq.ts ${channel}`, { 
    encoding: "utf-8",
    cwd: rootDir
  });
} catch (err: any) {
  console.error("[mcp-logseq] Error during Logseq setup:", err.stderr || err.message);
  process.exit(1);
}

const jsonMatches = setupOutput.match(/\{[^}]*\}/g);
if (!jsonMatches || jsonMatches.length === 0) {
  console.error("[mcp-logseq] Could not find any JSON block in setup output. Raw output:");
  console.error(setupOutput);
  process.exit(1);
}

let config: any;
for (const jsonStr of jsonMatches) {
  try {
    config = JSON.parse(jsonStr);
    if (config && config.executablePath) break;
  } catch {}
}

if (!config || !config.executablePath) {
  console.error("[mcp-logseq] Could not parse executablePath from setup output.");
  process.exit(1);
}

// Ensure the executable path is absolute
const executablePath = path.isAbsolute(config.executablePath) 
  ? config.executablePath 
  : path.resolve(rootDir, config.executablePath);

console.error(`[mcp-logseq] Resolved Logseq executable to: ${executablePath}`);

const launchWrapperPath = path.join(logseqDir, "launch-logseq.sh");
fs.writeFileSync(
  launchWrapperPath,
  `#!/usr/bin/env bash
set -euo pipefail
APPIMAGE_EXTRACT_AND_RUN=1 exec ${JSON.stringify(executablePath)} --no-sandbox --disable-gpu --disable-software-rasterizer "$@"
`,
  { mode: 0o755 }
);
const launchPath = launchWrapperPath;

// Check if graph is initialized in isolated home
const logseqConfigGraphsDir = path.join(homeDir, ".logseq", "graphs");
fs.mkdirSync(logseqConfigGraphsDir, { recursive: true });

const hasGraphs = fs.readdirSync(logseqConfigGraphsDir).length > 0;

if (!hasGraphs) {
  console.error(`[mcp-logseq] No graphs found. Automatically initializing graph configuration for: ${graphDir}`);
  // Create a dummy transit file to tell Logseq this graph exists.
  // The filename format is: logseq_local_++<escaped-path>.transit
  const escapedPath = graphDir.replace(/\//g, "++");
  const configFileName = `logseq_local_++${escapedPath}.transit`;
  const configFilePath = path.join(logseqConfigGraphsDir, configFileName);
  
  // A minimal valid-ish transit file content for a local graph
  // We'll just write an empty-ish Datascript DB structure
  const minimalTransit = '["~#datascript/DB",["^ ","~:schema",["^ "],"~:datoms",["~#list",[]]]]';
  fs.writeFileSync(configFilePath, minimalTransit);

  // Also seed preferences to include the current plugin
  const logseqConfigDir = path.join(homeDir, ".logseq");
  const prefsPath = path.join(logseqConfigDir, "preferences.json");
  if (!fs.existsSync(prefsPath)) {
    fs.writeFileSync(prefsPath, JSON.stringify({
      externals: [rootDir]
    }, null, 2));
  }
}

// Bootstrap disabled temporarily: do not pre-launch Logseq to prime graph selection.

console.error(`[mcp-logseq] Launching electron-playwright-mcp server...`);

const mcpServerPath = path.resolve(rootDir, "node_modules/electron-playwright-mcp/dist/index.js");

const mcpServer = spawn("node", [
  mcpServerPath,
  launchPath,
  graphDir // Pass graphDir as an argument to Electron if supported
], {
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_APP_PATH: launchPath,
    HOME: homeDir,
    XDG_CONFIG_HOME: xdgDir,
  },
  cwd: rootDir
});

mcpServer.on("close", (code) => {
  console.error(`[mcp-logseq] MCP server exited with code ${code}`);
  process.exit(code ?? 0);
});

mcpServer.on("error", (err) => {
  console.error("[mcp-logseq] Failed to start MCP server:", err);
  process.exit(1);
});
