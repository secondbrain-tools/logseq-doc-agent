#!/usr/bin/env tsx

/**
 * review.ts — Pre-commit / CI review pipeline.
 *
 * Fixes are always applied where possible (format, lint).
 *
 * Two-phase execution:
 *   Phase 1 — Quick steps (always run, stop at first failure):
 *     Format → Lint → Spell → Dead code → Circular deps → ArchUnit → Type check → Audit
 *   Phase 2 — Slow steps (run one at a time after phase 1 passes):
 *     Build → Coverage → E2E (legacy) → E2E (db)
 *
 * Usage:
 *   npx tsx scripts/review.ts              # both phases
 *   npx tsx scripts/review.ts --quick      # phase 1 only
 *   npx tsx scripts/review.ts --skip-e2e   # skip both e2e steps
 *   npx tsx scripts/review.ts --only=Lint  # run a single step (with fix)
 */

import { execSync, spawn, type SpawnOptions } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { styleText } from "node:util";

// ── Types ────────────────────────────────────────────────────────────────────

interface Step {
  name: string;
  command: string;
  args: string[]; // check args (unused since fix is always on)
  fixArgs: string[]; // always used — fixes applied by default
  slow?: boolean;
}

interface ReviewOptions {
  quick: boolean;
  skipE2e: boolean;
  skipUnit: boolean;
  only?: string;
}

// ── Config ───────────────────────────────────────────────────────────────────

const GREEN = styleText("green", "✓");
const RED = styleText("red", "✗");
const YELLOW = styleText("yellow", "⚠");
const BOLD = (s: string) => styleText("bold", s);
const DIM = (s: string) => styleText("dim", s);

const AUDIT_LEVEL = "high";
const COVERAGE_THRESHOLD_PCT = 60;

const QUICK_STEPS: Step[] = [
  {
    name: "Format",
    command: "npx",
    args: ["biome", "format", "."],
    fixArgs: ["biome", "format", "--write", "."],
  },
  {
    name: "Lint",
    command: "npx",
    args: ["oxlint", "."],
    fixArgs: ["oxlint", "--fix", "."],
  },
  {
    name: "Spell",
    command: "npx",
    args: ["cspell", "--no-progress", "--no-summary", "src/**", "scripts/**", "tests/**", "*.md"],
    fixArgs: [
      "cspell",
      "--no-progress",
      "--no-summary",
      "src/**",
      "scripts/**",
      "tests/**",
      "*.md",
    ],
  },
  {
    name: "Dead code",
    command: "npx",
    args: ["ts-prune"],
    fixArgs: ["ts-prune"],
  },
  {
    name: "Circular deps",
    command: "npx",
    args: ["madge", "--circular", "--extensions", "ts,svelte", "src/"],
    fixArgs: ["madge", "--circular", "--extensions", "ts,svelte", "src/"],
  },
  {
    name: "ArchUnit",
    command: "npm",
    args: ["run", "test:arch"],
    fixArgs: ["run", "test:arch"],
  },
  {
    name: "Type check",
    command: "npm",
    args: ["run", "check"],
    fixArgs: ["run", "check"],
  },
  {
    name: "Audit",
    command: "npm",
    args: ["audit", "--audit-level", AUDIT_LEVEL],
    fixArgs: ["audit", "--audit-level", AUDIT_LEVEL],
  },
];

const SLOW_STEPS: Step[] = [
  {
    name: "Build",
    command: "npm",
    args: ["run", "build"],
    fixArgs: ["run", "build"],
    slow: true,
  },
  {
    name: "Coverage",
    command: "npx",
    args: ["vitest", "run", "--coverage"],
    fixArgs: ["vitest", "run", "--coverage"],
    slow: true,
  },
  {
    name: "E2E (legacy)",
    command: "npm",
    args: ["run", "test:e2e:legacy", "--", "--reporter=line"],
    fixArgs: ["run", "test:e2e:legacy", "--", "--reporter=line"],
    slow: true,
  },
  {
    name: "E2E (db)",
    command: "npm",
    args: ["run", "test:e2e:db", "--", "--reporter=line"],
    fixArgs: ["run", "test:e2e:db", "--", "--reporter=line"],
    slow: true,
  },
];

const ALL_STEPS = [...QUICK_STEPS, ...SLOW_STEPS];

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseArgs(): ReviewOptions {
  const raw = process.argv.slice(2);
  return {
    quick: raw.includes("--quick"),
    skipE2e: raw.includes("--skip-e2e"),
    skipUnit: raw.includes("--skip-unit"),
    only: raw.find((a) => a.startsWith("--only="))?.split("=")[1],
  };
}

async function runStep(step: Step): Promise<number> {
  process.stdout.write(`${DIM("…")} ${step.name.padEnd(28)} `);
  const { code, stdout, stderr } = await exec(step.command, step.fixArgs);

  if (code === 0) {
    console.log(GREEN);
    return 0;
  }

  console.log(`${RED} failed (exit ${code})`);
  if (stdout.trim()) console.log(stdout.trimEnd());
  if (stderr.trim()) console.error(stderr.trimEnd());
  return code;
}

function exec(
  command: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "pipe",
      env: { ...process.env, FORCE_COLOR: "1" },
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (err) => {
      resolve({ code: 1, stdout: "", stderr: `spawn failed: ${err.message}` });
    });
  });
}

// ── Coverage (special handling) ──────────────────────────────────────────────

function getChangedSourceFiles(): string[] {
  const stdout = execSync("git diff HEAD --name-only --diff-filter=ACMR", { encoding: "utf-8" });
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((f: string) => /^src\/.*\.(ts|svelte)$/.test(f))
    .filter((f: string) => !f.endsWith(".test.ts"))
    .filter((f: string) => !f.endsWith(".prompt.ts"))
    .filter((f: string) => !f.endsWith("built-in-prompts.ts"));
}

/** Returns true if the diff for a file only touches comment lines (no code changes). */
function isCommentOnlyDiff(file: string): boolean {
  try {
    const diff = execSync(`git diff HEAD -- ${file}`, { encoding: "utf-8" });
    const changedLines = diff
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .map((l) => l.slice(1).trim());
    if (changedLines.length === 0) return false;
    return changedLines.every(
      (l) => l === "" || l.startsWith("//") || l.startsWith("/*") || l.startsWith("*"),
    );
  } catch {
    return false;
  }
}

async function checkCoverage(): Promise<boolean> {
  const changedFiles = getChangedSourceFiles().filter((f) => !isCommentOnlyDiff(f));

  if (changedFiles.length === 0) {
    console.log(`${GREEN} ${BOLD("Coverage")}${DIM(" — no uncommitted source changes, skipping")}`);
    return true;
  }

  console.log(`${DIM("…")} Coverage${DIM(` — ${changedFiles.length} uncommitted file(s)`)}`);

  const { code, stdout, stderr } = await exec("npx", [
    "vitest",
    "run",
    "--coverage",
    "--exclude",
    "tests/architecture/**",
    "--coverage.reporter=json-summary",
    "--reporter=verbose",
  ]);

  if (code !== 0) {
    console.log(`${RED} Tests failed`);
    if (stdout.trim()) console.log(stdout.trimEnd());
    if (stderr.trim()) console.error(stderr.trimEnd());
    return false;
  }

  const summaryPath = resolve(process.cwd(), "coverage/coverage-summary.json");
  if (!existsSync(summaryPath)) {
    console.log(`${YELLOW} No coverage summary generated`);
    return true;
  }

  const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
  let allAboveThreshold = true;

  for (const file of changedFiles) {
    const normalized = file.startsWith("src/") ? file : `src/${file.replace(/^src\//, "")}`;
    const keys = Object.keys(summary).filter(
      (k) => k.includes(normalized) || k.endsWith(`/${normalized}`),
    );

    if (keys.length === 0) {
      console.log(`  ${DIM("?")} ${normalized} — no coverage data (untested?)`);
      allAboveThreshold = false;
      continue;
    }

    for (const key of keys) {
      const pct = summary[key]?.lines?.pct ?? 0;
      const status = pct >= COVERAGE_THRESHOLD_PCT ? GREEN : RED;
      console.log(`  ${status} ${key.replace(process.cwd(), "")}  ${pct.toFixed(1)}% lines`);
      if (pct < COVERAGE_THRESHOLD_PCT) allAboveThreshold = false;
    }
  }

  return allAboveThreshold;
}

// ── Tool availability ───────────────────────────────────────────────────────

async function checkTools(): Promise<void> {
  const tools = [
    { name: "Biome", check: ["npx", "biome", "--version"] },
    { name: "oxlint", check: ["npx", "oxlint", "--version"] },
    { name: "cspell", check: ["npx", "cspell", "--version"] },
  ];

  for (const tool of tools) {
    const { code } = await exec(tool.check[0], tool.check.slice(1));
    if (code !== 0) {
      console.log(`${YELLOW} ${tool.name} not found — install it to enable that check`);
    }
  }
}

function fail(msg: string): never {
  console.log(`\n${RED} ${BOLD("Review failed")} at "${msg}". Fix the issue and re-run.\n`);
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  // ── --only mode ──────────────────────────────────────────────────────────
  if (opts.only) {
    const found = ALL_STEPS.find((s) => s.name.toLowerCase() === opts.only!.toLowerCase());
    if (!found) {
      console.error(
        `${RED} Unknown step: "${opts.only}". Available: ${ALL_STEPS.map((s) => s.name).join(", ")}`,
      );
      process.exit(1);
    }
    console.log(`\n${BOLD("▶ review")}  ${DIM(`--only=${found.name}`)}\n`);
    await checkTools();

    if (found.name === "Coverage") {
      const ok = await checkCoverage();
      if (!ok) fail(found.name);
    } else {
      const code = await runStep(found);
      if (code !== 0) fail(found.name);
    }
    console.log(`\n${GREEN} ${BOLD("All checks passed")}\n`);
    return;
  }

  // ── Build step lists ─────────────────────────────────────────────────────
  let quick = [...QUICK_STEPS];
  let slow = [...SLOW_STEPS];

  if (opts.skipUnit) {
    slow = slow.filter((s) => s.name !== "Coverage");
  }
  if (opts.skipE2e) {
    slow = slow.filter((s) => !s.name.startsWith("E2E"));
  }

  const modeLabel = opts.quick ? "quick" : "full";
  console.log(`\n${BOLD("▶ review")}  ${DIM(modeLabel)}\n`);

  if (slow.length < SLOW_STEPS.length) {
    const skipped = SLOW_STEPS.filter((s) => !slow.includes(s));
    console.log(`${DIM("⏭")} Skipping slow: ${skipped.map((s) => s.name).join(", ")}\n`);
  }

  await checkTools();

  const start = performance.now();

  // ── Phase 1: Quick steps ─────────────────────────────────────────────────
  console.log(`${DIM("── Quick ──")}`);
  for (const step of quick) {
    const code = await runStep(step);
    if (code !== 0) fail(step.name);
  }

  if (opts.quick) {
    const elapsed = ((performance.now() - start) / 1000).toFixed(1);
    console.log(`\n${GREEN} ${BOLD("Quick review passed")}  ${DIM(`(${elapsed}s)`)}\n`);
    return;
  }

  // ── Phase 2: Slow steps (one at a time) ──────────────────────────────────
  if (slow.length > 0) {
    console.log(`\n${DIM("── Slow ──")}`);
  }

  for (const step of slow) {
    if (step.name === "Coverage") {
      const ok = await checkCoverage();
      if (!ok) fail(step.name);
    } else {
      const code = await runStep(step);
      if (code !== 0) fail(step.name);
    }
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  console.log(`\n${GREEN} ${BOLD("All checks passed")}  ${DIM(`(${elapsed}s)`)}\n`);
}

main().catch((err) => {
  console.error(`${RED} Unexpected error:`, err);
  process.exit(1);
});
