import fs from "node:fs/promises";
import path from "node:path";
import type { ChannelName } from "../../../scripts/logseq/ensure-logseq";
import { getRuntimePaths, isRuntimeGraphInitialized, writeRuntimeInfo } from "../../../scripts/logseq/runtime-profile";

export default async function globalSetup() {
  const channel = (process.env.LOGSEQ_CHANNEL as ChannelName) || "legacy";
  const { runtimeDir, graphDir, homeDir, xdgDir, runtimeInfoPath } = getRuntimePaths(path.resolve("."), "e2e", channel);
  const graphTemplateDir = path.resolve("tests/graph-template");

  // Step 1: clear and copy graph from template
  console.log(`Setting up test graph: clearing ${graphDir} and copying from ${graphTemplateDir}...`);
  await fs.rm(graphDir, { recursive: true, force: true });
  await fs.mkdir(graphDir, { recursive: true });
  await fs.cp(graphTemplateDir, graphDir, { recursive: true });

  // Ensure other runtime directories
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(xdgDir, { recursive: true });

  const executablePath = process.env.LOGSEQ_EXECUTABLE;

  if (!executablePath) {
    console.warn(
      "LOGSEQ_EXECUTABLE is not set. Skipping Electron runtime config generation."
    );
    return;
  }

  if (!isRuntimeGraphInitialized(homeDir, graphDir)) {
    throw new Error(
      `[e2e global setup] Graph initialization required. Run: npm run start:e2e:init:${channel}\nThen manually select this graph directory once in Logseq:\n${graphDir}`
    );
  }

  writeRuntimeInfo(runtimeInfoPath, {
    executablePath,
    graphDir,
    homeDir,
    xdgDir,
    initializedAt: new Date().toISOString(),
  });
}
