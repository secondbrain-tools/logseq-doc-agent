#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import extract from "extract-zip";
import { LOGSEQ_ENVIRONMENTS_DIRNAME } from "./runtime-profile";

export type ChannelName = "legacy" | "db";
type SupportedPlatform = "linux" | "darwin";
type SupportedArch = "x64" | "arm64";
type PlatformKey = `${SupportedPlatform}-${SupportedArch}`;
type Strategy = "appimage" | "zip";

interface SharedChannelConfig {
  repo?: string;
  strategyOverrides?: Partial<Record<PlatformKey, Strategy>>;
  assetNameOverrides?: Partial<Record<PlatformKey, string>>;
  binaryRelativePathOverrides?: Partial<Record<PlatformKey, string>>;
  workflowArtifactNameIncludesOverrides?: Partial<Record<PlatformKey, string>>;
}

interface ReleaseChannelConfig extends SharedChannelConfig {
  source?: "release";
  tag: string;
}

interface WorkflowChannelConfig extends SharedChannelConfig {
  source: "workflow";
  workflow: string;
}

interface LocalChannelConfig extends SharedChannelConfig {
  source: "local";
  directory: string;
}

type ChannelConfig = ReleaseChannelConfig | WorkflowChannelConfig | LocalChannelConfig;
type SetupConfig = Record<ChannelName, ChannelConfig>;

interface WorkflowRunSummary {
  id: number;
  head_sha: string;
  created_at: string;
  html_url: string;
}

interface WorkflowArtifactSummary {
  id: number;
  name: string;
  archive_download_url: string;
  expired: boolean;
}

interface ParsedArgs {
  channel: ChannelName;
  configPath: string;
  cacheDir: string;
}

const DEFAULT_CONFIG_PATH = "./logseq-versions.jsonc";

function parseArgs(argv: string[]): ParsedArgs {
  const [channelArg, ...rest] = argv;

  if (channelArg !== "legacy" && channelArg !== "db") {
    throw new Error(
      `First argument must be "legacy" or "db". Got: ${channelArg ?? "<missing>"}`
    );
  }

  let configPath = DEFAULT_CONFIG_PATH;
  let cacheDir = `./${LOGSEQ_ENVIRONMENTS_DIRNAME}/app`;

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
  return JSON.parse(stripJsonComments(raw)) as SetupConfig;
}

function stripJsonComments(input: string): string {
  let result = "";
  let inString = false;
  let stringDelimiter = "";
  let escaping = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        result += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      result += char;
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === stringDelimiter) {
        inString = false;
        stringDelimiter = "";
      }
      continue;
    }

    if ((char === '"' || char === "'")) {
      inString = true;
      stringDelimiter = char;
      result += char;
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    result += char;
  }

  return result;
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

async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function runAppImageExtract(appImagePath: string, targetDir: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(appImagePath, ["--appimage-extract"], {
      cwd: targetDir,
      stdio: "inherit",
      env: {
        ...process.env,
      },
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`AppImage extraction failed for ${appImagePath} with exit code ${code ?? "unknown"}`));
    });
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "logseq-doc-agent",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText} for ${url}`);
  }

  return (await response.json()) as T;
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(fullPath));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

function getPlatformAliases(platform: SupportedPlatform) {
  return platform === "linux" ? ["linux"] : ["darwin", "mac", "macos", "osx"];
}

function getArchAliases(arch: SupportedArch) {
  return arch === "x64" ? ["x64", "amd64", "x86_64"] : ["arm64", "aarch64"];
}

function scoreNameForTarget(name: string, platform: SupportedPlatform, arch: SupportedArch) {
  const normalized = name.toLowerCase();
  let score = 0;

  for (const alias of getPlatformAliases(platform)) {
    if (normalized.includes(alias)) {
      score += 10;
      break;
    }
  }

  for (const alias of getArchAliases(arch)) {
    if (normalized.includes(alias)) {
      score += 5;
      break;
    }
  }

  return score;
}

async function findMatchingFiles(dir: string, predicate: (filePath: string) => boolean): Promise<string[]> {
  if (!(await fileExists(dir))) {
    return [];
  }
  const files = await listFilesRecursive(dir);
  return files.filter(predicate);
}

async function findExecutableCandidate(input: {
  rootDir: string;
  platform: SupportedPlatform;
  arch: SupportedArch;
  key: PlatformKey;
  strategy: Strategy;
  cfg: SharedChannelConfig;
}): Promise<string | null> {
  const { rootDir, platform, arch, key, strategy, cfg } = input;

  const explicitRelativePath = cfg.binaryRelativePathOverrides?.[key];
  if (explicitRelativePath) {
    const explicitPath = path.join(rootDir, explicitRelativePath);
    if (await fileExists(explicitPath)) {
      return explicitPath;
    }
  }

  if (platform === "linux") {
    const appImages = await findMatchingFiles(
      rootDir,
      (filePath) => filePath.endsWith(".AppImage")
    );
    if (appImages.length > 0) {
      appImages.sort((a, b) => scoreNameForTarget(path.basename(b), platform, arch) - scoreNameForTarget(path.basename(a), platform, arch));
      return appImages[0];
    }
  }

  if (platform === "darwin") {
    const macExecutables = await findMatchingFiles(
      rootDir,
      (filePath) => filePath.endsWith(path.join("Logseq.app", "Contents", "MacOS", "Logseq"))
    );
    if (macExecutables.length > 0) {
      return macExecutables[0];
    }
  }

  if (strategy === "zip") {
    const fallbackRelativePath = defaultBinaryRelativePath({
      platform,
      strategy,
      assetName: "artifact.zip",
    });
    const fallbackPath = path.join(rootDir, fallbackRelativePath);
    if (await fileExists(fallbackPath)) {
      return fallbackPath;
    }
  }

  return null;
}

async function extractZipArchivesUntilExecutable(input: {
  rootDir: string;
  platform: SupportedPlatform;
  arch: SupportedArch;
  key: PlatformKey;
  strategy: Strategy;
  cfg: SharedChannelConfig;
}): Promise<string | null> {
  const { rootDir, platform, arch, key, strategy, cfg } = input;

  const explicitAssetName = cfg.assetNameOverrides?.[key];
  const zipCandidates = await findMatchingFiles(rootDir, (filePath) => {
    if (!filePath.endsWith(".zip")) return false;
    if (path.basename(filePath).startsWith("_workflow-artifact")) return false;
    if (explicitAssetName) return path.basename(filePath) === explicitAssetName;
    return true;
  });

  zipCandidates.sort((a, b) => scoreNameForTarget(path.basename(b), platform, arch) - scoreNameForTarget(path.basename(a), platform, arch));

  for (const zipCandidate of zipCandidates) {
    const extractDir = path.join(rootDir, "__inner__", path.basename(zipCandidate, ".zip"));
    await fsp.mkdir(extractDir, { recursive: true });
    await extract(zipCandidate, { dir: extractDir });

    const executablePath = await findExecutableCandidate({
      rootDir: extractDir,
      platform,
      arch,
      key,
      strategy,
      cfg,
    });

    if (executablePath) {
      return executablePath;
    }
  }

  return null;
}

async function materializeAppImageExecutable(input: {
  appImagePath: string;
  cacheDir: string;
  channel: ChannelName;
  key: PlatformKey;
}): Promise<string> {
  const { appImagePath, cacheDir, channel, key } = input;
  const digest = await sha256File(appImagePath);
  const baseName = path.basename(appImagePath, ".AppImage");
  const extractionRoot = path.join(cacheDir, channel, "appimage", key, `${baseName}-${digest.slice(0, 16)}`);
  const metadataPath = path.join(extractionRoot, ".appimage-source.json");
  const appRunPath = path.join(extractionRoot, "squashfs-root", "AppRun");

  if (await fileExists(appRunPath) && await fileExists(metadataPath)) {
    return appRunPath;
  }

  await fsp.rm(extractionRoot, { recursive: true, force: true });
  await fsp.mkdir(extractionRoot, { recursive: true });

  console.error(`[setup-logseq] extracting AppImage ${path.basename(appImagePath)} -> ${extractionRoot}`);
  await runAppImageExtract(appImagePath, extractionRoot);

  if (!(await fileExists(appRunPath))) {
    throw new Error(`Expected AppRun not found after extracting ${appImagePath} into ${extractionRoot}`);
  }

  await fsp.chmod(appRunPath, 0o755).catch(() => {});
  await fsp.writeFile(
    metadataPath,
    JSON.stringify(
      {
        appImagePath,
        sha256: digest,
        extractedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  return appRunPath;
}

async function fetchLatestWorkflowRun(repo: string, workflow: string): Promise<WorkflowRunSummary> {
  const runs = await fetchJson<{ workflow_runs: WorkflowRunSummary[] }>(
    `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?status=success&per_page=20`
  );

  const run = runs.workflow_runs.find((candidate) => Boolean(candidate.id));
  if (!run) {
    throw new Error(`No successful workflow run found for ${repo}/${workflow}`);
  }

  return run;
}

async function fetchWorkflowArtifacts(repo: string, runId: number): Promise<WorkflowArtifactSummary[]> {
  const response = await fetchJson<{ artifacts: WorkflowArtifactSummary[] }>(
    `https://api.github.com/repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`
  );
  return response.artifacts.filter((artifact) => !artifact.expired);
}

function chooseWorkflowArtifact(input: {
  artifacts: WorkflowArtifactSummary[];
  platform: SupportedPlatform;
  arch: SupportedArch;
  key: PlatformKey;
  cfg: SharedChannelConfig;
}): WorkflowArtifactSummary {
  const { artifacts, platform, arch, key, cfg } = input;

  const explicitNeedle = cfg.workflowArtifactNameIncludesOverrides?.[key];
  if (explicitNeedle) {
    const explicitMatch = artifacts.find((artifact) => artifact.name.includes(explicitNeedle));
    if (explicitMatch) {
      return explicitMatch;
    }
  }

  const ranked = [...artifacts].sort((a, b) => scoreNameForTarget(b.name, platform, arch) - scoreNameForTarget(a.name, platform, arch));
  const best = ranked[0];
  if (!best) {
    throw new Error("Workflow run produced no downloadable artifacts.");
  }

  return best;
}

async function ensureExecutable(input: {
  installDir: string;
  cacheDir: string;
  platform: SupportedPlatform;
  arch: SupportedArch;
  channel: ChannelName;
  cfg: SharedChannelConfig & { tag: string };
  key: PlatformKey;
}): Promise<{
  executablePath: string;
  assetName: string;
  strategy: Strategy;
  installDir: string;
}> {
  const { installDir, cacheDir, platform, arch, channel, cfg, key } = input;

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
    const resolvedExecutablePath =
      strategy === "appimage"
        ? await materializeAppImageExecutable({
            appImagePath: executablePath,
            cacheDir,
            channel,
            key,
          })
        : executablePath;
    return { executablePath: resolvedExecutablePath, assetName, strategy, installDir };
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

  const resolvedExecutablePath =
    strategy === "appimage"
      ? await materializeAppImageExecutable({
          appImagePath: executablePath,
          cacheDir,
          channel,
          key,
        })
      : executablePath;

  return { executablePath: resolvedExecutablePath, assetName, strategy, installDir };
}

async function ensureWorkflowExecutable(input: {
  cacheDir: string;
  platform: SupportedPlatform;
  arch: SupportedArch;
  channel: ChannelName;
  cfg: WorkflowChannelConfig;
  key: PlatformKey;
}): Promise<{
  executablePath: string;
  strategy: Strategy;
  installDir: string;
  workflow: string;
  runId: number;
  headSha: string;
  artifactName: string;
  runUrl: string;
}> {
  const { cacheDir, platform, arch, channel, cfg, key } = input;
  const repo = cfg.repo ?? "logseq/logseq";
  const run = await fetchLatestWorkflowRun(repo, cfg.workflow);
  const installDir = path.join(cacheDir, channel, "workflow", cfg.workflow, String(run.id), key);
  const metadataPath = path.join(installDir, ".workflow-run.json");
  const strategy = cfg.strategyOverrides?.[key] ?? defaultStrategy(platform);

  const cachedExecutablePath = await findExecutableCandidate({
    rootDir: installDir,
    platform,
    arch,
    key,
    strategy,
    cfg,
  });

  if (cachedExecutablePath && await fileExists(metadataPath)) {
    const resolvedExecutablePath =
      strategy === "appimage" && cachedExecutablePath.endsWith(".AppImage")
        ? await materializeAppImageExecutable({
            appImagePath: cachedExecutablePath,
            cacheDir,
            channel,
            key,
          })
        : cachedExecutablePath;
    return {
      executablePath: resolvedExecutablePath,
      strategy,
      installDir,
      workflow: cfg.workflow,
      runId: run.id,
      headSha: run.head_sha,
      artifactName: "cached",
      runUrl: run.html_url,
    };
  }

  await fsp.rm(installDir, { recursive: true, force: true });
  await fsp.mkdir(installDir, { recursive: true });

  const artifacts = await fetchWorkflowArtifacts(repo, run.id);
  const artifact = chooseWorkflowArtifact({
    artifacts,
    platform,
    arch,
    key,
    cfg,
  });

  const workflowArchivePath = path.join(installDir, "_workflow-artifact.zip");
  console.error(`[setup-logseq] downloading workflow artifact ${cfg.workflow}#${run.id} -> ${artifact.name}`);
  await downloadFile(artifact.archive_download_url, workflowArchivePath);

  const stageDir = path.join(installDir, "__outer__");
  await fsp.mkdir(stageDir, { recursive: true });
  await extract(workflowArchivePath, { dir: stageDir });

  let executablePath = await findExecutableCandidate({
    rootDir: stageDir,
    platform,
    arch,
    key,
    strategy,
    cfg,
  });

  if (!executablePath) {
    executablePath = await extractZipArchivesUntilExecutable({
      rootDir: stageDir,
      platform,
      arch,
      key,
      strategy,
      cfg,
    });
  }

  if (!executablePath) {
    throw new Error(
      `Could not resolve executable from workflow artifact "${artifact.name}" for ${platform}/${arch}. ` +
      `Set workflowArtifactNameIncludesOverrides.${key}, assetNameOverrides.${key}, or binaryRelativePathOverrides.${key} if needed.`
    );
  }

  if (platform === "linux" || executablePath.endsWith(path.join("MacOS", "Logseq"))) {
    await fsp.chmod(executablePath, 0o755).catch(() => {});
  }

  if (strategy === "appimage" && executablePath.endsWith(".AppImage")) {
    executablePath = await materializeAppImageExecutable({
      appImagePath: executablePath,
      cacheDir,
      channel,
      key,
    });
  }

  await fsp.writeFile(
    metadataPath,
    JSON.stringify(
      {
        repo,
        workflow: cfg.workflow,
        runId: run.id,
        headSha: run.head_sha,
        artifactName: artifact.name,
        runUrl: run.html_url,
        resolvedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  return {
    executablePath,
    strategy,
    installDir,
    workflow: cfg.workflow,
    runId: run.id,
    headSha: run.head_sha,
    artifactName: artifact.name,
    runUrl: run.html_url,
  };
}

async function ensureLocalExecutable(input: {
  cacheDir: string;
  configDir: string;
  platform: SupportedPlatform;
  arch: SupportedArch;
  channel: ChannelName;
  cfg: LocalChannelConfig;
  key: PlatformKey;
}): Promise<{
  executablePath: string;
  strategy: Strategy;
  installDir: string;
  sourceDirectory: string;
}> {
  const { cacheDir, configDir, platform, arch, channel, cfg, key } = input;
  const sourceDirectory = path.resolve(configDir, cfg.directory);
  const strategy = cfg.strategyOverrides?.[key] ?? defaultStrategy(platform);
  const installDir = path.join(cacheDir, channel, "local", key);
  const platformHint = platform === "linux"
    ? 'Logseq-linux-x86_64-*.AppImage'
    : 'Logseq-darwin-*.zip or Logseq.app';

  function buildLocalBetaHelpMessage(reason: string) {
    return (
      `${reason}\n` +
      `Please download the beta for your system from the Logseq GitHub repo and place it under ${sourceDirectory}.\n` +
      `Expected something like "${platformHint}", or provide binaryRelativePathOverrides.${key}.`
    );
  }

  if (!(await fileExists(sourceDirectory))) {
    await fsp.mkdir(sourceDirectory, { recursive: true });
    throw new Error(
      buildLocalBetaHelpMessage(`Configured local binary directory did not exist, so it was created automatically: ${sourceDirectory}`)
    );
  }

  const directExecutablePath = await findExecutableCandidate({
    rootDir: sourceDirectory,
    platform,
    arch,
    key,
    strategy,
    cfg,
  });

  if (directExecutablePath) {
    let resolvedExecutablePath = directExecutablePath;
    if (platform === "linux" || directExecutablePath.endsWith(path.join("MacOS", "Logseq"))) {
      await fsp.chmod(directExecutablePath, 0o755).catch(() => {});
    }
    if (strategy === "appimage" && directExecutablePath.endsWith(".AppImage")) {
      resolvedExecutablePath = await materializeAppImageExecutable({
        appImagePath: directExecutablePath,
        cacheDir,
        channel,
        key,
      });
    }
    return {
      executablePath: resolvedExecutablePath,
      strategy,
      installDir,
      sourceDirectory,
    };
  }

  await fsp.rm(installDir, { recursive: true, force: true });
  await fsp.mkdir(installDir, { recursive: true });

  const zipCandidates = await findMatchingFiles(sourceDirectory, (filePath) => filePath.endsWith(".zip"));
  for (const zipCandidate of zipCandidates) {
    const stagedZip = path.join(installDir, path.basename(zipCandidate));
    await fsp.copyFile(zipCandidate, stagedZip);
  }

  const extractedExecutablePath = await extractZipArchivesUntilExecutable({
    rootDir: installDir,
    platform,
    arch,
    key,
    strategy,
    cfg,
  });

  if (extractedExecutablePath) {
    let resolvedExecutablePath = extractedExecutablePath;
    if (platform === "linux" || extractedExecutablePath.endsWith(path.join("MacOS", "Logseq"))) {
      await fsp.chmod(extractedExecutablePath, 0o755).catch(() => {});
    }
    if (strategy === "appimage" && extractedExecutablePath.endsWith(".AppImage")) {
      resolvedExecutablePath = await materializeAppImageExecutable({
        appImagePath: extractedExecutablePath,
        cacheDir,
        channel,
        key,
      });
    }
    return {
      executablePath: resolvedExecutablePath,
      strategy,
      installDir,
      sourceDirectory,
    };
  }

  throw new Error(
    buildLocalBetaHelpMessage(`No compatible local Logseq binary found in ${sourceDirectory} for ${platform}/${arch}.`)
  );
}

export async function ensureLogseq(args: ParsedArgs): Promise<any> {
  const target = detectTarget();
  const config = await loadConfig(args.configPath);
  const channelCfg = config[args.channel];
  const configDir = path.dirname(args.configPath);

  if (!channelCfg) {
    throw new Error(`Missing config for channel "${args.channel}" in ${args.configPath}`);
  }

  if (channelCfg.source === "workflow") {
    const result = await ensureWorkflowExecutable({
      cacheDir: args.cacheDir,
      platform: target.platform,
      arch: target.arch,
      channel: args.channel,
      cfg: channelCfg,
      key: target.key,
    });

    return {
      channel: args.channel,
      source: "workflow",
      workflow: result.workflow,
      workflowRunId: result.runId,
      workflowHeadSha: result.headSha,
      workflowArtifactName: result.artifactName,
      workflowRunUrl: result.runUrl,
      platform: target.platform,
      arch: target.arch,
      installDir: result.installDir,
      executablePath: result.executablePath,
      strategy: result.strategy,
      assetName: result.artifactName,
    };
  }

  if (channelCfg.source === "local") {
    const result = await ensureLocalExecutable({
      cacheDir: args.cacheDir,
      configDir,
      platform: target.platform,
      arch: target.arch,
      channel: args.channel,
      cfg: channelCfg,
      key: target.key,
    });

    return {
      channel: args.channel,
      source: "local",
      directory: result.sourceDirectory,
      platform: target.platform,
      arch: target.arch,
      installDir: result.installDir,
      executablePath: result.executablePath,
      strategy: result.strategy,
      assetName: path.basename(result.executablePath),
    };
  }

  const installDir = path.join(args.cacheDir, args.channel, channelCfg.tag, target.key);

  const result = await ensureExecutable({
    installDir,
    cacheDir: args.cacheDir,
    platform: target.platform,
    arch: target.arch,
    channel: args.channel,
    cfg: channelCfg,
    key: target.key,
  });

  return {
    channel: args.channel,
    source: "release",
    tag: channelCfg.tag,
    platform: target.platform,
    arch: target.arch,
    installDir: result.installDir,
    executablePath: result.executablePath,
    strategy: result.strategy,
    assetName: result.assetName,
  };
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await ensureLogseq(args);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);

if (isMain) {
  main().catch((error) => {
    console.error(`[setup-logseq] ${error instanceof Error ? error.stack : String(error)}`);
    process.exit(1);
  });
}
