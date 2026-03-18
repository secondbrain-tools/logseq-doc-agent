#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import extract from "extract-zip";

export type ChannelName = "legacy" | "db";
type SupportedPlatform = "linux" | "darwin";
type SupportedArch = "x64" | "arm64";
type PlatformKey = `${SupportedPlatform}-${SupportedArch}`;
type Strategy = "appimage" | "zip";

interface ChannelConfig {
  tag: string;
  repo?: string;
  strategyOverrides?: Partial<Record<PlatformKey, Strategy>>;
  assetNameOverrides?: Partial<Record<PlatformKey, string>>;
  binaryRelativePathOverrides?: Partial<Record<PlatformKey, string>>;
}

type SetupConfig = Record<ChannelName, ChannelConfig>;

interface ParsedArgs {
  channel: ChannelName;
  configPath: string;
  cacheDir: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [channelArg, ...rest] = argv;

  if (channelArg !== "legacy" && channelArg !== "db") {
    throw new Error(
      `First argument must be "legacy" or "db". Got: ${channelArg ?? "<missing>"}`
    );
  }

  let configPath = "./logseq-versions.json";
  let cacheDir = "./.cache/logseq";

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    const next = rest[i + 1];

    if (arg === "--config") {
      if (!next) throw new Error("--config requires a value");
      configPath = next;
      i += 1;
      continue;
    }

    if (arg === "--cache-dir") {
      if (!next) throw new Error("--cache-dir requires a value");
      cacheDir = next;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    channel: channelArg,
    configPath: path.resolve(configPath),
    cacheDir: path.resolve(cacheDir),
  };
}

function detectTarget(): {
  platform: SupportedPlatform;
  arch: SupportedArch;
  key: PlatformKey;
} {
  const platform = os.platform();
  const arch = os.arch();

  if (platform !== "linux" && platform !== "darwin") {
    throw new Error(
      `Unsupported platform: ${platform}. This script currently supports linux and darwin.`
    );
  }

  if (arch !== "x64" && arch !== "arm64") {
    throw new Error(
      `Unsupported architecture: ${arch}. This script currently supports x64 and arm64.`
    );
  }

  return {
    platform,
    arch,
    key: `${platform}-${arch}` as PlatformKey,
  };
}

async function loadConfig(configPath: string): Promise<SetupConfig> {
  const raw = await fsp.readFile(configPath, "utf8");
  return JSON.parse(raw) as SetupConfig;
}

function defaultStrategy(platform: SupportedPlatform): Strategy {
  return platform === "linux" ? "appimage" : "zip";
}

function defaultAssetName(input: {
  platform: SupportedPlatform;
  arch: SupportedArch;
  tag: string;
  strategy: Strategy;
}): string {
  const { platform, arch, tag, strategy } = input;

  if (platform === "linux" && strategy === "appimage") {
    return `Logseq-linux-${arch}-${tag}.AppImage`;
  }

  if (platform === "linux" && strategy === "zip") {
    return `Logseq-linux-${arch}-${tag}.zip`;
  }

  if (platform === "darwin" && strategy === "zip") {
    return `Logseq-darwin-${arch}-${tag}.zip`;
  }

  throw new Error(
    `No default asset pattern for ${platform}/${arch}/${strategy}. Use assetNameOverrides.`
  );
}

function defaultBinaryRelativePath(input: {
  platform: SupportedPlatform;
  strategy: Strategy;
  assetName: string;
}): string {
  const { platform, strategy, assetName } = input;

  if (platform === "linux" && strategy === "appimage") {
    return assetName;
  }

  if (platform === "darwin" && strategy === "zip") {
    return "Logseq.app/Contents/MacOS/Logseq";
  }

  throw new Error(
    `No default binary path for ${platform}/${strategy}. Use binaryRelativePathOverrides.`
  );
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url, { redirect: "follow" });

  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText} for ${url}`);
  }

  await fsp.mkdir(path.dirname(destination), { recursive: true });

  const nodeStream = Readable.fromWeb(response.body as globalThis.ReadableStream);
  await pipeline(nodeStream, fs.createWriteStream(destination));
}

async function ensureExecutable(input: {
  installDir: string;
  platform: SupportedPlatform;
  channel: ChannelName;
  cfg: ChannelConfig;
  key: PlatformKey;
}): Promise<{
  executablePath: string;
  assetName: string;
  strategy: Strategy;
  installDir: string;
}> {
  const { installDir, platform, channel, cfg, key } = input;

  const strategy = cfg.strategyOverrides?.[key] ?? defaultStrategy(platform);
  const assetName =
    cfg.assetNameOverrides?.[key] ??
    defaultAssetName({
      platform,
      arch: key.endsWith("arm64") ? "arm64" : "x64",
      tag: cfg.tag,
      strategy,
    });

  const binaryRelativePath =
    cfg.binaryRelativePathOverrides?.[key] ??
    defaultBinaryRelativePath({
      platform,
      strategy,
      assetName,
    });

  const executablePath = path.join(installDir, binaryRelativePath);

  if (await fileExists(executablePath)) {
    return { executablePath, assetName, strategy, installDir };
  }

  await fsp.mkdir(installDir, { recursive: true });

  const repo = cfg.repo ?? "logseq/logseq";
  const assetUrl = `https://github.com/${repo}/releases/download/${encodeURIComponent(
    cfg.tag
  )}/${encodeURIComponent(assetName)}`;

  const downloadedAssetPath = path.join(installDir, assetName);

  if (!(await fileExists(downloadedAssetPath))) {
    console.error(`[setup-logseq] downloading ${channel}:${cfg.tag} -> ${assetName}`);
    await downloadFile(assetUrl, downloadedAssetPath);
  } else {
    console.error(`[setup-logseq] using cached asset ${downloadedAssetPath}`);
  }

  if (strategy === "zip") {
    console.error(`[setup-logseq] extracting ${assetName}`);
    await extract(downloadedAssetPath, { dir: installDir });
  } else if (strategy === "appimage") {
    await fsp.chmod(downloadedAssetPath, 0o755);
  }

  if (!(await fileExists(executablePath))) {
    throw new Error(
      `Expected executable not found after install: ${executablePath}\n` +
        `Set binaryRelativePathOverrides.${key} if this release layout differs.`
    );
  }

  if (platform === "darwin") {
    await fsp.chmod(executablePath, 0o755).catch(() => {});
  }

  return { executablePath, assetName, strategy, installDir };
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const target = detectTarget();
  const config = await loadConfig(args.configPath);
  const channelCfg = config[args.channel];

  if (!channelCfg) {
    throw new Error(`Missing config for channel "${args.channel}" in ${args.configPath}`);
  }

  const installDir = path.join(args.cacheDir, args.channel, channelCfg.tag, target.key);

  const result = await ensureExecutable({
    installDir,
    platform: target.platform,
    channel: args.channel,
    cfg: channelCfg,
    key: target.key,
  });

  process.stdout.write(
    JSON.stringify(
      {
        channel: args.channel,
        tag: channelCfg.tag,
        platform: target.platform,
        arch: target.arch,
        installDir: result.installDir,
        executablePath: result.executablePath,
        strategy: result.strategy,
        assetName: result.assetName,
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((error) => {
  console.error(`[setup-logseq] ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});