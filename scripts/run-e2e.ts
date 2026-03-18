// scripts/run-e2e.ts
import { execSync, spawn } from "node:child_process";
import path from "node:path";

// Step 1: run the existing setup script (legacy mode)
console.log("Running Logseq setup (legacy)...");
let setupOutput: string;
try {
  setupOutput = execSync("npx tsx scripts/setup-logseq.ts legacy", { encoding: "utf-8" });
} catch (err: any) {
  console.error("Error during Logseq setup:", err.stderr || err.message);
  process.exit(1);
}

// The setup script may output multiple JSON objects; find the first JSON block
let executablePath = "";
const jsonMatches = setupOutput.match(/\{[^}]*\}/g);
if (jsonMatches) {
  for (const jsonStr of jsonMatches) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && parsed.executablePath) {
        executablePath = parsed.executablePath;
        break;
      }
    } catch {}
  }
}
if (!executablePath) {
  console.error("Could not determine LOGSEQ_EXECUTABLE from setup output.");
  process.exit(1);
}
console.log(`LOGSEQ_EXECUTABLE resolved to: ${executablePath}`);
process.env.LOGSEQ_EXECUTABLE = executablePath;

// Step 2: run the Playwright e2e tests
console.log("Launching Playwright e2e tests...");
const playwright = spawn("npm", ["run", "test:e2e"], {
  stdio: "inherit",
  env: process.env,
  cwd: process.cwd()
});

playwright.on("close", (code) => {
  process.exit(code ?? 0);
});
