import fs from "node:fs";
import path from "node:path";

export type RuntimeMode = "mcp" | "e2e";

export function getRuntimePaths(rootDir: string, mode: RuntimeMode) {
  const runtimeDir = path.join(rootDir, ".logseq", mode);
  const homeDir = path.join(runtimeDir, "home");
  const xdgDir = path.join(runtimeDir, "xdg");
  const graphDir = path.join(runtimeDir, "graph");
  const runtimeInfoPath = path.join(runtimeDir, "runtime.json");
  return { runtimeDir, homeDir, xdgDir, graphDir, runtimeInfoPath };
}

export function getGraphTransitPath(homeDir: string, graphDir: string) {
  const escapedPath = graphDir.replace(/^\//, "").replace(/\//g, "++");
  return path.join(homeDir, ".logseq", "graphs", `logseq_local_++${escapedPath}.transit`);
}

export function isRuntimeGraphInitialized(homeDir: string, graphDir: string) {
  const transitPath = getGraphTransitPath(homeDir, graphDir);
  return fs.existsSync(transitPath);
}

export function writeRuntimeInfo(runtimeInfoPath: string, info: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(runtimeInfoPath), { recursive: true });
  fs.writeFileSync(runtimeInfoPath, JSON.stringify(info, null, 2));
}
