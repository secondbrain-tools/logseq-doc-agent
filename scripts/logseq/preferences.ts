import fs from "node:fs";
import path from "node:path";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLikelyPluginDir(value: string): boolean {
  if (!value) return false;
  if (path.isAbsolute(value)) return true;
  return /^[A-Za-z]:[\\/]/.test(value);
}

export function ensureExternalPluginDir(homeDir: string, pluginDir: string) {
  const logseqConfigDir = path.join(homeDir, ".logseq");
  const prefsPath = path.join(logseqConfigDir, "preferences.json");

  fs.mkdirSync(logseqConfigDir, { recursive: true });

  let prefs: Record<string, unknown> = {};
  if (fs.existsSync(prefsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
      if (isRecord(parsed)) {
        prefs = parsed;
      }
    } catch {
      // Fall back to recreating a valid preferences file.
    }
  }

  const externals = Array.isArray(prefs.externals)
    ? prefs.externals
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(isLikelyPluginDir)
    : [];

  if (!externals.includes(pluginDir)) {
    externals.push(pluginDir);
  }

  prefs.externals = externals;
  fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
}
