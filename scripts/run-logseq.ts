// scripts/run-logseq.ts
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { ensureLogseq } from "./logseq/ensure-logseq";

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

const channel = (process.argv[2] as any) || "legacy";

async function main() {
  console.log(`[run-logseq] Setting up Logseq (${channel}) with isolated data in ${logseqDir}...`);

  const result = await ensureLogseq({
    channel,
    configPath: path.resolve(rootDir, "logseq-versions.json"),
    cacheDir: path.resolve(rootDir, ".logseq/app")
  });

  const executablePath = result.executablePath;
  console.log(`[run-logseq] Resolved Logseq executable to: ${executablePath}`);
  console.log(`[run-logseq] Launching Logseq...`);

  const logseqProcess = spawn(executablePath, [graphDir], {
    stdio: "inherit",
    env: {
      ...process.env,
      HOME: homeDir,
      XDG_CONFIG_HOME: xdgDir,
    },
    cwd: rootDir
  });

  logseqProcess.on("close", (code) => {
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
