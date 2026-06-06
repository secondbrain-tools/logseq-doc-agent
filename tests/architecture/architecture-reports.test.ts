import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectGraph } from "archunit";

const TS_CONFIG = "tsconfig.app.json";
const REPORT_DIR = "reports/archunit";

async function ensureReportDir() {
  await mkdir(REPORT_DIR, { recursive: true });
}

describe("architecture reports", () => {
  it("exports dependency graph reports", async () => {
    await ensureReportDir();

    await projectGraph(TS_CONFIG)
      .titled("logseq-doc-agent dependency graph")
      .exportAsHTML(join(REPORT_DIR, "dependency-graph.html"));

    await projectGraph(TS_CONFIG)
      .titled("logseq-doc-agent dependency graph")
      .exportAsMermaid(join(REPORT_DIR, "dependency-graph.mmd"));

    await projectGraph(TS_CONFIG)
      .collapseToFolderDepth(2)
      .titled("logseq-doc-agent layer graph")
      .exportAsHTML(join(REPORT_DIR, "layer-graph.html"));

    await projectGraph(TS_CONFIG)
      .collapseToFolderDepth(2)
      .titled("logseq-doc-agent layer graph")
      .exportAsMermaid(join(REPORT_DIR, "layer-graph.mmd"));

    expect(true).toBe(true);
  });
});
