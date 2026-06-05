import fs from "node:fs/promises";
import path from "node:path";
import type { ChannelName } from "../../../scripts/logseq/ensure-logseq";
import { primeGraphSelection } from "../../../scripts/logseq/graph-bootstrap";
import { ensureExternalPluginDir } from "../../../scripts/logseq/preferences";
import {
  getRuntimePaths,
  isRuntimeGraphInitialized,
  writeRuntimeInfo,
} from "../../../scripts/logseq/runtime-profile";
import { seedGraphTemplateFromPages } from "../../../scripts/logseq/graph-template-seeder";

export default async function globalSetup() {
  const channel = (process.env.LOGSEQ_CHANNEL as ChannelName) || "legacy";
  const { runtimeDir, graphDir, homeDir, xdgDir, runtimeInfoPath } = getRuntimePaths(
    path.resolve("."),
    "e2e",
    channel,
  );
  const graphTemplateDir = path.resolve("tests/graph-template");

  console.log(`Preparing ${channel} e2e runtime at ${runtimeDir}...`);
  await fs.mkdir(graphDir, { recursive: true });

  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(xdgDir, { recursive: true });

  if (!isRuntimeGraphInitialized(homeDir, graphDir, channel)) {
    const initCommand =
      channel === "db" ? "npm run start:e2e:init:db" : "npm run start:e2e:init:legacy";
    throw new Error(
      `${channel.toUpperCase()} e2e graph is not initialized at ${graphDir}. Run: ${initCommand}`,
    );
  }

  const executablePath = process.env.LOGSEQ_EXECUTABLE;

  if (!executablePath) {
    console.warn("LOGSEQ_EXECUTABLE is not set. Skipping Electron runtime config generation.");
    return;
  }

  ensureExternalPluginDir(homeDir, path.resolve("."));

  await fs.rm(path.join(homeDir, ".logseq", "graphs"), { recursive: true, force: true });
  await primeGraphSelection({
    executablePath,
    graphDir,
    homeDir,
    xdgDir,
  });

  console.log(`Seeding ${channel} test graph from template pages via the Logseq API...`);
  await seedGraphTemplateFromPages({
    executablePath,
    graphDir,
    homeDir,
    xdgDir,
    templateDir: graphTemplateDir,
    openGraph: true,
  });

  writeRuntimeInfo(runtimeInfoPath, {
    executablePath,
    graphDir,
    homeDir,
    xdgDir,
    initializedAt: new Date().toISOString(),
  });
}
