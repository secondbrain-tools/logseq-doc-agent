import fs from "node:fs";
import path from "node:path";
import type { ChannelName } from "./ensure-logseq";

export type RuntimeMode = "mcp" | "e2e";
export const LOGSEQ_ENVIRONMENTS_DIRNAME = "logseq-environments";

export function getLogseqEnvironmentsRoot(rootDir: string) {
  return path.join(rootDir, LOGSEQ_ENVIRONMENTS_DIRNAME);
}

export function getRuntimePaths(rootDir: string, mode: RuntimeMode, channel: ChannelName) {
  const runtimeDir = path.join(getLogseqEnvironmentsRoot(rootDir), mode, channel);
  const homeDir = path.join(runtimeDir, "home");
  const xdgDir = path.join(runtimeDir, "xdg");
  const graphDir = channel === "db"
    ? path.join(homeDir, "logseq", "graphs", "Demo")
    : path.join(runtimeDir, "graph");
  const runtimeInfoPath = path.join(runtimeDir, "runtime.json");
  return { runtimeDir, homeDir, xdgDir, graphDir, runtimeInfoPath };
}

export function getGraphTransitPath(homeDir: string, graphDir: string) {
  const escapedPath = graphDir.replace(/^\//, "").replace(/\//g, "++");
  return path.join(homeDir, ".logseq", "graphs", `logseq_local_++${escapedPath}.transit`);
}

export function isRuntimeGraphInitialized(
  homeDir: string,
  graphDir: string,
  channel?: ChannelName
) {
  if (channel === "db") {
    return fs.existsSync(path.join(graphDir, "db.sqlite"));
  }

  const transitPath = getGraphTransitPath(homeDir, graphDir);
  return fs.existsSync(transitPath);
}

export function writeRuntimeInfo(runtimeInfoPath: string, info: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(runtimeInfoPath), { recursive: true });
  fs.writeFileSync(runtimeInfoPath, JSON.stringify(info, null, 2));
}
