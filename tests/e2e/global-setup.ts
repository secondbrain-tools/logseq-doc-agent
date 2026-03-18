import fs from "node:fs/promises";
import path from "node:path";

export default async function globalSetup() {

  const runtimeDir = path.resolve(".tmp");
  const graphDir = path.join(runtimeDir, "graph");
  const homeDir = path.join(runtimeDir, "home");
  const xdgDir = path.join(runtimeDir, "xdg");

  await fs.mkdir(graphDir, { recursive: true });
  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(xdgDir, { recursive: true });

  const executablePath = process.env.LOGSEQ_EXECUTABLE;

  if (!executablePath) {
    throw new Error(
      "LOGSEQ_EXECUTABLE is not set. " +
        "Run `npx tsx scripts/setup-logseq.ts legacy` (or db) " +
        "and set LOGSEQ_EXECUTABLE to the reported executablePath " +
        "before running `npm run test:e2e`."
    );
  }

  await fs.writeFile(
    path.join(runtimeDir, "runtime.json"),
    JSON.stringify(
      {
        executablePath,
        graphDir,
        homeDir,
        xdgDir,
      },
      null,
      2
    )
  );
}