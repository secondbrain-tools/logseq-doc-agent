import fs from "node:fs/promises";
import path from "node:path";

export default async function globalSetup() {
  const runtimeDir = path.resolve(".logseq");
  const graphDir = path.resolve("tests/graph");
  const graphTemplateDir = path.resolve("tests/graph-template");
  const homeDir = path.join(runtimeDir, "home");
  const xdgDir = path.join(runtimeDir, "xdg");

  // Step 1: clear and copy graph from template
  console.log(`Setting up test graph: clearing ${graphDir} and copying from ${graphTemplateDir}...`);
  await fs.rm(graphDir, { recursive: true, force: true });
  await fs.mkdir(graphDir, { recursive: true });
  await fs.cp(graphTemplateDir, graphDir, { recursive: true });

  // Ensure other runtime directories
  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(xdgDir, { recursive: true });

  const executablePath = process.env.LOGSEQ_EXECUTABLE;

  if (!executablePath) {
    console.warn(
      "LOGSEQ_EXECUTABLE is not set. Skipping Electron runtime config generation."
    );
    return;
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