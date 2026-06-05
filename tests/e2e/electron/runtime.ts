import fs from "node:fs";
import path from "node:path";

export function loadRuntimeConfig() {
  const channel = process.env.LOGSEQ_CHANNEL || "legacy";
  const runtimePath = path.resolve("logseq-environments", "e2e", channel, "runtime.json");

  if (!fs.existsSync(runtimePath)) {
    throw new Error(
      `Runtime config not found at ${runtimePath}. ` +
        "Ensure Playwright global setup ran successfully for the selected Logseq channel.",
    );
  }

  return JSON.parse(fs.readFileSync(runtimePath, "utf8"));
}

export function getLogseqLaunchEnv(runtime: {
  executablePath: string;
  homeDir: string;
  xdgDir: string;
}) {
  const appDir =
    path.basename(runtime.executablePath) === "AppRun"
      ? path.dirname(runtime.executablePath)
      : undefined;

  return {
    ...process.env,
    ...(appDir ? { APPDIR: appDir } : {}),
    HOME: runtime.homeDir,
    XDG_CONFIG_HOME: runtime.xdgDir,
  };
}
