import fs from "node:fs/promises";
import path from "node:path";
import { _electron as electron, type Page } from "@playwright/test";

const ADD_GRAPH_SELECTOR = ".add-graph-btn";
const GRAPH_INPUT_SELECTOR = 'input[type="file"], input[webkitdirectory]';
const GRAPH_OPEN_SELECTORS = [
  ".add-graph-btn",
  'button:has-text("Open a local graph")',
  'button:has-text("Open local graph")',
  'button:has-text("Open a graph")',
  'button:has-text("Open graph")',
  '[role="menuitem"]:has-text("Open a local graph")',
  '[role="menuitem"]:has-text("Open local graph")',
  '[role="menuitem"]:has-text("Open a graph")',
  '[role="menuitem"]:has-text("Open graph")',
  'button:has-text("Choose directory")',
  'button:has-text("Choose folder")',
  'button:has-text("Select directory")',
  'button:has-text("Ordner auswählen")',
  'a:has-text("Ordner auswählen")',
  '[role="menuitem"]:has-text("Ordner auswählen")',
  'button:has-text("Graph hinzufügen")',
  'a:has-text("Graph hinzufügen")',
  '[role="menuitem"]:has-text("Graph hinzufügen")',
  'label:has-text("Choose directory")',
  'label:has-text("Choose folder")',
  'label:has-text("Select directory")',
  'label:has-text("Ordner auswählen")',
  'strong:has-text("Ordner auswählen")',
  'text=Ordner auswählen',
];

async function collectFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function setInputFilesWithFallback(input: any, graphDir: string): Promise<void> {
  try {
    await input.setInputFiles(graphDir);
    return;
  } catch (primaryError) {
    const files = await collectFiles(graphDir);
    if (files.length === 0) {
      throw primaryError;
    }

    await input.setInputFiles(files);
  }
}

async function clickTriggerAndSelectGraph(page: Page, selector: string, graphDir: string): Promise<boolean> {
  const trigger = page.locator(selector).first();
  if ((await trigger.count()) === 0) {
    return false;
  }

  const chooserPromise = page.waitForEvent("filechooser", { timeout: 2_500 }).catch(() => null);

  try {
    await trigger.click({ timeout: 2_500 });
  } catch {
    return false;
  }

  await page.waitForTimeout(300);

  const chooser = await chooserPromise;
  if (chooser) {
    await chooser.setFiles(graphDir);
    return true;
  }

  const inputs = page.locator(GRAPH_INPUT_SELECTOR);
  if ((await inputs.count()) > 0) {
    await setInputFilesWithFallback(inputs.first(), graphDir);
    return true;
  }

  return false;
}

export async function ensureGraphOpen(page: Page, graphDir: string): Promise<boolean> {
  if ((await page.locator(ADD_GRAPH_SELECTOR).count()) === 0) {
    return false;
  }


  for (const selector of GRAPH_OPEN_SELECTORS) {
    const opened = await clickTriggerAndSelectGraph(page, selector, graphDir);
    if (opened) {
      return true;
    }

    await page.waitForTimeout(250);
  }

  const inputs = page.locator(GRAPH_INPUT_SELECTOR);
  if ((await inputs.count()) > 0) {
    await setInputFilesWithFallback(inputs.first(), graphDir);
    return true;
  }

  const htmlSnippet = await page.locator("body").innerHTML().catch(() => "<body unavailable>");
  throw new Error(`Detected ${ADD_GRAPH_SELECTOR} but could not find a graph chooser for ${graphDir}. Input count=${await inputs.count()}. HTML snippet: ${htmlSnippet.slice(0, 2000)}`);
}

export async function primeGraphSelection(args: {
  executablePath: string;
  graphDir: string;
  homeDir: string;
  xdgDir: string;
  launchArgs?: string[];
}): Promise<void> {
  const app = await electron.launch({
    executablePath: args.executablePath,
    args: args.launchArgs ?? [args.graphDir],
    env: {
      ...process.env,
      HOME: args.homeDir,
      XDG_CONFIG_HOME: args.xdgDir,
    },
  });

  try {
    const window = await app.firstWindow();
    await window.waitForSelector("#app, .cp__header, .add-graph-btn", {
      state: "visible",
      timeout: 45_000,
    });

    if ((await window.locator(ADD_GRAPH_SELECTOR).count()) > 0) {
      console.error(`[graph-bootstrap] ${ADD_GRAPH_SELECTOR} detected; opening ${args.graphDir}`);
      await ensureGraphOpen(window, args.graphDir);
    }

    await window.waitForSelector("#app, .cp__header", { state: "visible", timeout: 45_000 });
    await window.waitForTimeout(1_000);
  } finally {
    await app.close();
  }
}
