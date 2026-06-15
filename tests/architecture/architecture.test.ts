import { describe, expect, it } from "vitest";
import { projectFiles, projectSlices } from "archunit";

const TS_CONFIG = "tsconfig.app.json";
const LAYER_PATTERN = "src/(**)/";
const TARGET_DIAGRAM_PATH = "tests/architecture/layers.target.puml";

const layers = ["domain", "application", "infra", "ui", "plugin"] as const;
type Layer = (typeof layers)[number];
type LayerDependency = `${Layer}->${Layer}`;

const allowedDependencies = new Set<LayerDependency>([
  "application->domain",
  "infra->application",
  "infra->domain",
  "ui->application",
  "ui->domain",
  "plugin->application",
  "plugin->infra",
  "plugin->domain",
]);

const pendingGuards = new Set<LayerDependency>([
  "application->infra",
  "application->ui",
  "infra->ui",
]);

const pendingGuardsEnabled = process.env.ARCHUNIT_ENABLE_PENDING_GUARDS === "1";
const targetDiagramEnabled = process.env.ARCHUNIT_ENFORCE_TARGET_DIAGRAM === "1";

function guardTest(edge: LayerDependency) {
  return pendingGuardsEnabled || !pendingGuards.has(edge) ? it : it.skip;
}

describe("architecture", () => {
  it("keeps the TypeScript graph cycle-free", async () => {
    const violations = await projectFiles(TS_CONFIG)
      .inPath("src/**/*.ts")
      .should()
      .haveNoCycles()
      .check({ clearCache: true });

    expect(violations).toEqual([]);
  });

  describe("layer guards derived from the target diagram", () => {
    for (const source of layers) {
      for (const target of layers) {
        if (source === target) continue;

        const edge = `${source}->${target}` as LayerDependency;
        if (allowedDependencies.has(edge)) continue;

        guardTest(edge)(`forbids ${source} -> ${target}`, async () => {
          const violations = await projectSlices(TS_CONFIG)
            .definedBy(LAYER_PATTERN)
            .shouldNot()
            .containDependency(source, target)
            .check();

          expect(violations).toEqual([]);
        });
      }
    }
  });

  (targetDiagramEnabled ? it : it.skip)("matches the target layer diagram", async () => {
    const violations = await projectSlices(TS_CONFIG)
      .definedBy(LAYER_PATTERN)
      .should()
      .ignoringUnknownNodes()
      .ignoringExternalDependencies()
      .adhereToDiagramInFile(TARGET_DIAGRAM_PATH)
      .check({ clearCache: true });

    expect(violations).toEqual([]);
  });

  it("keeps infra coupled only to application ports", async () => {
    const violations = await projectFiles(TS_CONFIG)
      .inPath("src/infra/**/*.ts")
      .shouldNot()
      .dependOnFiles()
      .inPath("src/application/**/*.ts", {
        except: { inPath: "src/application/ports/**/*.ts" },
      })
      .check({ clearCache: true });

    expect(violations).toEqual([]);
  });
});
