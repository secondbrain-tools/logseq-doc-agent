// scripts/mcp-logseq.ts
import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import type { ChannelName } from "./logseq/ensure-logseq";
import { ensureExternalPluginDir } from "./logseq/preferences";
import { getRuntimePaths, isRuntimeGraphInitialized } from "./logseq/runtime-profile";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const graphTemplateDir = path.resolve(rootDir, "tests/graph-template");
const channel: ChannelName = (process.argv[2] as ChannelName) || "legacy";
const runtimePaths = getRuntimePaths(rootDir, "mcp", channel);
const logseqDir = runtimePaths.runtimeDir;
const homeDir = runtimePaths.homeDir;
const xdgDir = runtimePaths.xdgDir;
const graphDir = runtimePaths.graphDir;
const startupLogPath = path.join(logseqDir, "startup.log");
function logStartup(message: string, extra?: unknown) {
  const line = `[${new Date().toISOString()}] ${message}${extra === undefined ? "" : ` ${typeof extra === "string" ? extra : JSON.stringify(extra)}`}\n`;
  fs.mkdirSync(logseqDir, { recursive: true });
  fs.appendFileSync(startupLogPath, line);
  console.error(`[mcp-logseq] ${message}`, extra ?? "");
}

// Always start from a clean template
logStartup(`Copying graph-template → ${graphDir}...`);
fs.rmSync(graphDir, { recursive: true, force: true });
fs.mkdirSync(graphDir, { recursive: true });
fs.cpSync(graphTemplateDir, graphDir, { recursive: true });

fs.mkdirSync(homeDir, { recursive: true });
fs.mkdirSync(xdgDir, { recursive: true });
fs.mkdirSync(graphDir, { recursive: true });
fs.mkdirSync(path.join(graphDir, "journals"), { recursive: true });
fs.mkdirSync(path.join(graphDir, "logseq"), { recursive: true });
fs.writeFileSync(path.join(graphDir, "logseq", "config.edn"), "{}\n");

logStartup(`Setting up Logseq (${channel}) with isolated data in ${logseqDir}...`, { cwd: rootDir, nodeOptions: process.env.NODE_OPTIONS ?? null, argv: process.argv });

let setupOutput: string;
try {
  setupOutput = execSync(`npx tsx scripts/setup-logseq.ts ${channel}`, { 
    encoding: "utf-8",
    cwd: rootDir
  });
} catch (err: any) {
  logStartup("Error during Logseq setup:", err.stderr || err.message);
  process.exit(1);
}

const jsonMatches = setupOutput.match(/\{[^}]*\}/g);
if (!jsonMatches || jsonMatches.length === 0) {
  logStartup("Could not find any JSON block in setup output. Raw output:", setupOutput);
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
  logStartup("Could not parse executablePath from setup output.");
  process.exit(1);
}

// Ensure the executable path is absolute
const executablePath = path.isAbsolute(config.executablePath) 
  ? config.executablePath 
  : path.resolve(rootDir, config.executablePath);
const appDir = path.basename(executablePath) === "AppRun"
  ? path.dirname(executablePath)
  : null;

logStartup(`Resolved Logseq executable to: ${executablePath}`);

const launchWrapperPath = path.join(logseqDir, "launch-logseq.sh");
fs.writeFileSync(
  launchWrapperPath,
  `#!/usr/bin/env bash
set -euo pipefail
exec ${JSON.stringify(executablePath)} ${JSON.stringify(graphDir)} --no-sandbox --disable-gpu --disable-software-rasterizer "$@"
`,
  { mode: 0o755 }
);
const launchPath = launchWrapperPath;

if (!isRuntimeGraphInitialized(homeDir, graphDir)) {
  logStartup("MCP graph is not initialized for this profile.", {
    graphDir,
    initCommand: `npm run start:mcp:init:${channel}`,
    transitExpectedUnder: path.join(homeDir, ".logseq", "graphs"),
  });
  console.error(`\n[mcp-logseq] Graph initialization required.\nRun: npm run start:mcp:init:${channel}\nThen manually select this graph directory once in Logseq:\n${graphDir}\n`);
  process.exit(1);
}

ensureExternalPluginDir(homeDir, rootDir);

// Bootstrap disabled again: native file dialogs block MCP startup.

const mcpServerPath = path.resolve(rootDir, "node_modules/electron-playwright-mcp/dist/index.js");
logStartup("Launching electron-playwright-mcp server...", { mcpServerPath, launchPath, graphDir, homeDir, xdgDir, wrapperInjectsGraphDir: true, runtimeInfoPath: runtimePaths.runtimeInfoPath });

const mcpServer = spawn("node", [
  mcpServerPath,
  launchPath
], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(appDir ? { APPDIR: appDir } : {}),
    ELECTRON_APP_PATH: launchPath,
    HOME: homeDir,
    XDG_CONFIG_HOME: xdgDir,
  },
  cwd: rootDir
});

mcpServer.on("close", (code) => {
  logStartup(`MCP server exited with code ${code}`);
  process.exit(code ?? 0);
});

mcpServer.on("error", (err) => {
  logStartup("Failed to start MCP server:", String(err));
  process.exit(1);
});
