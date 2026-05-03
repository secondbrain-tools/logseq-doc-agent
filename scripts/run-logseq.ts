// scripts/run-logseq.ts
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { ensureLogseq, type ChannelName } from "./logseq/ensure-logseq";
import {
  getLogseqEnvironmentsRoot,
  getRuntimePaths,
  isRuntimeGraphInitialized,
  writeRuntimeInfo,
  type RuntimeMode,
} from "./logseq/runtime-profile";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const channel: ChannelName = (process.argv[2] as ChannelName) || "legacy";
const mode: "dev" | RuntimeMode = process.argv.includes("--mcp")
  ? "mcp"
  : process.argv.includes("--e2e")
    ? "e2e"
    : "dev";

const runtimePaths = mode === "dev"
  ? null
  : getRuntimePaths(rootDir, mode, channel);

const environmentsRoot = getLogseqEnvironmentsRoot(rootDir);
const logseqDir = runtimePaths?.runtimeDir ?? path.join(environmentsRoot, "dev");
const homeDir = runtimePaths?.homeDir ?? path.join(logseqDir, "home");
const xdgDir = runtimePaths?.xdgDir ?? path.join(logseqDir, "xdg");
const graphDir = runtimePaths?.graphDir ?? path.resolve(rootDir, "tests/devgraph");

fs.mkdirSync(homeDir, { recursive: true });
fs.mkdirSync(xdgDir, { recursive: true });
fs.mkdirSync(graphDir, { recursive: true });


async function main() {
  console.log(`[run-logseq] Setting up Logseq (${channel}) with isolated data in ${logseqDir}...`);

  const result = await ensureLogseq({
    channel,
    configPath: path.resolve(rootDir, "logseq-versions.jsonc"),
    cacheDir: path.resolve(environmentsRoot, "app")
  });

  const executablePath = result.executablePath;
  const appDir = path.basename(executablePath) === "AppRun"
    ? path.dirname(executablePath)
    : null;
  console.log(`[run-logseq] Resolved Logseq executable to: ${executablePath}`);

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

  if (mode !== "dev") {
    console.log(`[run-logseq] Manual initialization mode (${mode}). Please select the graph directory if prompted: ${graphDir}`);
  }
  console.log(`[run-logseq] Launching Logseq...`);

  const logseqProcess = spawn(launchPath, [graphDir], {
    stdio: "inherit",
    env: {
      ...process.env,
      ...(appDir ? { APPDIR: appDir } : {}),
      HOME: homeDir,
      XDG_CONFIG_HOME: xdgDir,
    },
    cwd: rootDir
  });

  logseqProcess.on("close", (code) => {
    if (runtimePaths && isRuntimeGraphInitialized(homeDir, graphDir)) {
      writeRuntimeInfo(runtimePaths.runtimeInfoPath, {
        executablePath,
        graphDir,
        homeDir,
        xdgDir,
        initializedAt: new Date().toISOString(),
      });
      console.log(`[run-logseq] ${mode} graph initialization detected and saved.`);
    } else if (runtimePaths) {
      console.warn(`[run-logseq] ${mode} graph initialization was not detected. Re-run this command and select the graph directory: ${graphDir}`);
    }
    console.log(`[run-logseq] Logseq exited with code ${code}`);
    process.exit(code ?? 0);
  });

  logseqProcess.on("error", (err) => {
    console.error("[run-logseq] Failed to start Logseq:", err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("[run-logseq] Error:", err);
  process.exit(1);
});
