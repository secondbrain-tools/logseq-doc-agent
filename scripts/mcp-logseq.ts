// scripts/mcp-logseq.ts
import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Setup isolated directories in .logseq
const logseqDir = path.join(rootDir, ".logseq");
const homeDir = path.join(logseqDir, "home");
const xdgDir = path.join(logseqDir, "xdg");
const graphDir = path.resolve(rootDir, "tests/testgraph");

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

// Check if graph is initialized in isolated home
const logseqConfigGraphsDir = path.join(homeDir, ".logseq", "graphs");
const hasGraphs = fs.existsSync(logseqConfigGraphsDir) && fs.readdirSync(logseqConfigGraphsDir).length > 0;

if (!hasGraphs) {
  console.error(`\n[mcp-logseq] ERROR: No graphs found in isolated environment.`);
  console.error(`[mcp-logseq] Please run "npm run start:${channel}" first and select or create a graph in:`);
  console.error(`            ${graphDir}`);
  console.error(`[mcp-logseq] This will initialize the Logseq configuration required for the MCP server.\n`);
  process.exit(1);
}

console.error(`[mcp-logseq] Launching electron-playwright-mcp server...`);

const mcpServerPath = path.resolve(rootDir, "node_modules/electron-playwright-mcp/dist/index.js");

const mcpServer = spawn("node", [
  mcpServerPath,
  executablePath,
  graphDir // Pass graphDir as an argument to Electron if supported
], {
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_APP_PATH: executablePath,
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
