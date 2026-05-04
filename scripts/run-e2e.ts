// scripts/run-e2e.ts
import { spawn } from "node:child_process";
import path from "node:path";
import { ensureLogseq, type ChannelName } from "./logseq/ensure-logseq";
import { getLogseqEnvironmentsRoot } from "./logseq/runtime-profile";

const rootDir = process.cwd();

async function main() {
  const args = process.argv.slice(2);
  let channel: ChannelName = "legacy";
  const environmentsRoot = getLogseqEnvironmentsRoot(rootDir);

  // Check if first argument is a channel
  if (args[0] === "legacy" || args[0] === "db") {
    channel = args.shift() as ChannelName;
  }

  console.log(`[run-e2e] Setting up Logseq (${channel})...`);

  // Resolve the executable path
  const result = await ensureLogseq({
    channel,
    configPath: path.resolve(rootDir, "logseq-versions.jsonc"),
    cacheDir: path.resolve(environmentsRoot, "app")
  });

  const executablePath = result.executablePath;
  console.log(`[run-e2e] Resolved Logseq executable to: ${executablePath}`);
  
  // Set environment variable for Playwright's global setup
  process.env.LOGSEQ_EXECUTABLE = executablePath;
  process.env.LOGSEQ_CHANNEL = channel;

  // Remaining arguments are passed to Playwright
  console.log(`[run-e2e] Launching Playwright with arguments: ${args.join(" ")}`);
  
  const playwright = spawn("npx", ["playwright", "test", ...args], {
    stdio: "inherit",
    env: process.env,
    cwd: rootDir
  });

  playwright.on("close", (code) => {
    process.exit(code ?? 0);
  });

  playwright.on("error", (err) => {
    console.error("[run-e2e] Failed to start Playwright:", err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("[run-e2e] Error:", err);
  process.exit(1);
});