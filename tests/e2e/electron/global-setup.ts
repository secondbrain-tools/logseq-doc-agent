import fs from "node:fs/promises";
import path from "node:path";
import type { ChannelName } from "../../../scripts/logseq/ensure-logseq";
import { primeGraphSelection } from "../../../scripts/logseq/graph-bootstrap";
import { ensureExternalPluginDir } from "../../../scripts/logseq/preferences";
import { getRuntimePaths, isRuntimeGraphInitialized, writeRuntimeInfo } from "../../../scripts/logseq/runtime-profile";
import { seedGraphTemplateFromPages } from "../../../scripts/logseq/graph-template-seeder";

export default async function globalSetup() {
  const channel = (process.env.LOGSEQ_CHANNEL as ChannelName) || "legacy";
  const { runtimeDir, graphDir, homeDir, xdgDir, runtimeInfoPath } = getRuntimePaths(path.resolve("."), "e2e", channel);
  const graphTemplateDir = path.resolve("tests/graph-template");

  // Step 1: prepare the runtime graph directory
  if (channel === "db") {
    console.log(`Using initialized DB test graph at ${graphDir} without clearing it...`);
  } else {
    console.log(`Setting up test graph: clearing ${graphDir} and copying from ${graphTemplateDir}...`);
    await fs.rm(graphDir, { recursive: true, force: true });
    await fs.mkdir(graphDir, { recursive: true });
    await fs.cp(graphTemplateDir, graphDir, { recursive: true });
  }

  // Ensure other runtime directories
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(xdgDir, { recursive: true });

  if (channel === "db" && !isRuntimeGraphInitialized(homeDir, graphDir, channel)) {
    throw new Error(
      `DB e2e graph is not initialized at ${graphDir}. Run: npm run start:e2e:init:db`
    );
  }

  const executablePath = process.env.LOGSEQ_EXECUTABLE;

  if (!executablePath) {
    console.warn(
      "LOGSEQ_EXECUTABLE is not set. Skipping Electron runtime config generation."
    );
    return;
  }

  // Clear any stale graph cache, then re-prime the graph selection so the runtime
  // starts from the freshly prepared graph instead of an old home cache.
  await fs.rm(path.join(homeDir, ".logseq", "graphs"), { recursive: true, force: true });
  ensureExternalPluginDir(homeDir, path.resolve("."));
  await primeGraphSelection({
    executablePath,
    graphDir,
    homeDir,
    xdgDir,
  });

  if (channel === "db") {
    console.log(`Seeding DB test graph from template pages via the Logseq API...`);
    await seedGraphTemplateFromPages({
      executablePath,
      graphDir,
      homeDir,
      xdgDir,
      templateDir: graphTemplateDir,
    });
  }

  writeRuntimeInfo(runtimeInfoPath, {
    executablePath,
    graphDir,
    homeDir,
    xdgDir,
    initializedAt: new Date().toISOString(),
  });
}
