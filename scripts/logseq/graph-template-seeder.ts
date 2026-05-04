import fs from "node:fs/promises";
import path from "node:path";
import { _electron as electron, type Page } from "@playwright/test";
import { ensureGraphOpen } from "./graph-bootstrap";
import {
  parseSubtree,
  type ParsedBlock,
} from "../../src/infra/ai/tools/subtree-parser";

interface TemplatePage {
  name: string;
  tree: ParsedBlock;
}

async function collectMarkdownFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function derivePageName(
  templatePagesDir: string,
  markdownPath: string
): string {
  const relativePath = path.relative(templatePagesDir, markdownPath);
  return relativePath
    .replaceAll(path.sep, "/")
    .replace(/___/g, "/")
    .replace(/\.md$/i, "");
}

async function readTemplatePages(
  templatePagesDir: string
): Promise<TemplatePage[]> {
  const files = await collectMarkdownFiles(templatePagesDir);
  const pages: TemplatePage[] = [];

  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    pages.push({
      name: derivePageName(templatePagesDir, filePath),
      tree: parseSubtree(content),
    });
  }

  return pages;
}

interface LogseqApiProbe {
  ready: boolean;
  topWindowHasLogseq: boolean;
  topWindowHasEditor: boolean;
  iframes: Array<{
    id: string;
    src: string;
    hasLogseq: boolean;
    hasEditor: boolean;
  }>;
}

async function probeLogseqApi(window: Page): Promise<LogseqApiProbe> {
  return window.evaluate(() => {
    const topWindow = window as any;
    const iframes = Array.from(document.querySelectorAll("iframe")).map((iframe) => {
      let hasLogseq = false;
      let hasEditor = false;

      try {
        const iframeWindow = iframe.contentWindow as any;
        hasLogseq = Boolean(iframeWindow?.logseq);
        hasEditor = Boolean(iframeWindow?.logseq?.Editor);
      } catch {
        // Ignore inaccessible iframes.
      }

      return {
        id: iframe.id || "",
        src: iframe.getAttribute("src") || "",
        hasLogseq,
        hasEditor,
      };
    });

    return {
      ready: iframes.some((iframe) => iframe.hasEditor),
      topWindowHasLogseq: Boolean(topWindow.logseq),
      topWindowHasEditor: Boolean(topWindow.logseq?.Editor),
      iframes,
    };
  });
}

async function waitForLogseqFrame(window: Page): Promise<void> {
  let lastProbe: LogseqApiProbe | null = null;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    lastProbe = await probeLogseqApi(window);
    if (lastProbe.ready) {
      return;
    }

    await window.waitForTimeout(1000);
  }

  throw new Error(
    `No plugin iframe with a Logseq API was found. Last probe: ${JSON.stringify(lastProbe)}`
  );
}

async function waitForLogseqApiReady(window: Page): Promise<void> {
  await waitForLogseqFrame(window);

  let lastError = "unknown";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probePageName = `__lda_api_probe__${Date.now()}_${attempt}`;

    try {
      await invokeLogseq(window, "createPage", {
        name: probePageName,
      });
      await invokeLogseq(window, "deletePage", {
        name: probePageName,
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await window.waitForTimeout(1000);
    }
  }

  throw new Error(
    `Plugin iframe was found, but the Logseq Editor API never became ready. Last error: ${lastError}`
  );
}

async function invokeLogseq<T>(
  window: Page,
  action: string,
  args: Record<string, unknown>
): Promise<T> {
  return window.evaluate(
    async ({
      action,
      args,
    }: {
      action: string;
      args: Record<string, unknown>;
    }) => {
      try {
        const topWindow = window as any;
        const iframeCandidates = Array.from(document.querySelectorAll("iframe")).filter(
          (iframe) => {
            try {
              return Boolean((iframe.contentWindow as any)?.logseq?.Editor);
            } catch {
              return false;
            }
          }
        );

        const preferredIframe =
          iframeCandidates.find((iframe) => iframe.id.includes("logseq-doc-agent")) ||
          iframeCandidates.find((iframe) =>
            (iframe.getAttribute("src") || "").includes("dist/index.html")
          ) ||
          iframeCandidates[0];

        const logseqApi = topWindow.logseq?.Editor
          ? topWindow.logseq
          : (preferredIframe?.contentWindow as any)?.logseq;

        if (!logseqApi?.Editor) {
          throw new Error("No Logseq Editor API was available in the page or plugin iframe.");
        }

        switch (action) {
          case "getPage":
            return await logseqApi.Editor.getPage(args.name);
          case "getPageBlocksTree":
            return await logseqApi.Editor.getPageBlocksTree(args.name);
          case "deletePage":
            return await logseqApi.Editor.deletePage(args.name);
          case "createPage":
            return await logseqApi.Editor.createPage(
              args.name,
              {},
              { createFirstBlock: false, redirect: false }
            );
          case "appendBlockInPage":
            return await logseqApi.Editor.appendBlockInPage(args.name, args.content);
          case "deleteBlock":
            return await logseqApi.Editor.removeBlock(args.uuid);
          case "removeBlockProperty":
            return await logseqApi.Editor.removeBlockProperty(args.uuid, args.key);
          case "insertBlock":
            return await logseqApi.Editor.insertBlock(
              args.parentUuid,
              args.content,
              args.options
            );
          default:
            throw new Error(`Unsupported Logseq action: ${action}`);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "object" && error !== null
              ? JSON.stringify(error)
              : String(error);
        throw new Error(`Logseq action '${action}' failed: ${message}`);
      }
    },
    { action, args }
  );
}

async function insertChildren(
  window: Page,
  parentUuid: string,
  children: ParsedBlock[]
): Promise<void> {
  let lastUuid = parentUuid;
  let isFirst = true;

  for (const child of children || []) {
    const childBlock = await invokeLogseq<any>(window, "insertBlock", {
      parentUuid: lastUuid,
      content: child.content,
      options: isFirst
        ? { sibling: false, properties: child.properties || {} }
        : { sibling: true, before: false, properties: child.properties || {} },
    });

    if (childBlock?.uuid && child.children && child.children.length > 0) {
      await insertChildren(window, childBlock.uuid, child.children);
    }

    if (childBlock?.uuid) {
      lastUuid = childBlock.uuid;
      isFirst = false;
    }
  }
}

function isTrashedPage(page: Record<string, unknown> | null | undefined) {
  return Boolean(page?.[":logseq.property/deleted-at"]);
}

async function restorePageIfNeeded(window: Page, pageName: string) {
  const page = await invokeLogseq<Record<string, unknown> | null>(window, "getPage", {
    name: pageName,
  });

  if (!page || !isTrashedPage(page) || typeof page.uuid !== "string") {
    return page;
  }

  for (const key of ["deleted-at", "recycle/original-page"]) {
    try {
      await invokeLogseq(window, "removeBlockProperty", {
        uuid: page.uuid,
        key,
      });
    } catch {
      // Best effort only.
    }
  }

  await window.waitForTimeout(250);
  return await invokeLogseq<Record<string, unknown> | null>(window, "getPage", {
    name: pageName,
  });
}

async function clearPageBlocks(window: Page, pageName: string) {
  const blocks = await invokeLogseq<Array<{ uuid?: string }>>(window, "getPageBlocksTree", {
    name: pageName,
  });

  for (const block of [...(blocks || [])].reverse()) {
    if (!block?.uuid) {
      continue;
    }

    await invokeLogseq(window, "deleteBlock", {
      uuid: block.uuid,
    });
  }
}

async function seedPages(window: Page, pages: TemplatePage[]) {
  if (pages.length === 0) {
    return;
  }

  await waitForLogseqApiReady(window);

  for (const page of pages) {
    let existing: Record<string, unknown> | null = null;

    try {
      existing = await restorePageIfNeeded(window, page.name);
    } catch {
      // Ignore missing pages.
    }

    if (existing && isTrashedPage(existing)) {
      throw new Error(
        `Template page '${page.name}' exists in the recycle bin and could not be restored safely.`
      );
    }

    if (existing) {
      await clearPageBlocks(window, page.name);
    } else {
      await invokeLogseq(window, "createPage", { name: page.name });
    }

    if (page.tree.content) {
      const rootBlock = await invokeLogseq<any>(window, "appendBlockInPage", {
        name: page.name,
        content: page.tree.content,
      });

      if (
        rootBlock?.uuid &&
        page.tree.children &&
        page.tree.children.length > 0
      ) {
        await insertChildren(window, rootBlock.uuid, page.tree.children);
      }
    } else if (page.tree.children && page.tree.children.length > 0) {
      for (const child of page.tree.children) {
        const childBlock = await invokeLogseq<any>(window, "appendBlockInPage", {
          name: page.name,
          content: child.content,
        });

        if (childBlock?.uuid && child.children && child.children.length > 0) {
          await insertChildren(window, childBlock.uuid, child.children);
        }
      }
    }
  }
}

export async function seedGraphTemplateFromPages(args: {
  executablePath: string;
  graphDir: string;
  homeDir: string;
  xdgDir: string;
  templateDir: string;
}) {
  const pagesDir = path.join(args.templateDir, "pages");
  const pages = await readTemplatePages(pagesDir);

  if (pages.length === 0) {
    return;
  }

  const appDir =
    path.basename(args.executablePath) === "AppRun"
      ? path.dirname(args.executablePath)
      : undefined;
  const app = await electron.launch({
    executablePath: args.executablePath,
    args: [
      args.graphDir,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-software-rasterizer",
    ],
    env: {
      ...process.env,
      ...(appDir ? { APPDIR: appDir } : {}),
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
    await ensureGraphOpen(window, args.graphDir);
    await window.waitForSelector("#app, .cp__header", {
      state: "visible",
      timeout: 45_000,
    });
    await seedPages(window, pages);
    await window.waitForTimeout(1_000);
  } finally {
    await app.close();
  }
}
