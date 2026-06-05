#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureLogseq, type ChannelName } from "./logseq/ensure-logseq";
import { getLogseqEnvironmentsRoot } from "./logseq/runtime-profile";

interface ParsedArgs {
  channel: ChannelName;
  configPath?: string;
  cacheDir?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [channelArg, ...rest] = argv;

  if (channelArg !== "legacy" && channelArg !== "db") {
    throw new Error(`First argument must be "legacy" or "db". Got: ${channelArg ?? "<missing>"}`);
  }

  const parsed: ParsedArgs = {
    channel: channelArg,
  };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    const next = rest[i + 1];

    if (arg === "--config") {
      if (!next) throw new Error("--config requires a value");
      parsed.configPath = path.resolve(next);
      i += 1;
      continue;
    }

    if (arg === "--cache-dir") {
      if (!next) throw new Error("--cache-dir requires a value");
      parsed.cacheDir = path.resolve(next);
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(__dirname, "..");
  const result = await ensureLogseq({
    channel: args.channel,
    configPath: args.configPath || "./logseq-versions.jsonc",
    cacheDir: args.cacheDir || path.join(getLogseqEnvironmentsRoot(rootDir), "app"),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
