import type { LogseqApi } from "../../application/ports/logseq-ports";
import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";
import "@logseq/libs";

export type LogseqRuntimeMode = "legacy" | "db";

export interface LogseqRuntimeInfo {
  mode: LogseqRuntimeMode;
  reasons: string[];
  capabilities: {
    db: boolean;
    datascriptQuery: boolean;
    transact: boolean;
    graphPathLooksDb: boolean;
    graphNameLooksDb: boolean;
  };
}

function getLogseq(): any {
  return (window as any).logseq;
}

function looksLikeDbGraph(graph: any): { path: boolean; name: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const path = String(graph?.path || graph?.url || "").toLowerCase();
  const name = String(graph?.name || "").toLowerCase();

  const pathMatch = /\/graphs\/|\\graphs\\/.test(path);
  const nameMatch = name === "demo" || name.includes("db");

  if (pathMatch) reasons.push(`graph path matched DB heuristic: ${path}`);
  if (nameMatch) reasons.push(`graph name matched DB heuristic: ${name}`);

  return { path: pathMatch, name: nameMatch, reasons };
}

export async function detectLogseqRuntime(): Promise<LogseqRuntimeInfo> {
  const api = getLogseq();
  const reasons: string[] = [];
  let graph: any = null;
  try {
    graph = await api?.App?.getCurrentGraph?.();
  } catch {
    graph = null;
  }
  const graphHints = looksLikeDbGraph(graph);
  reasons.push(...graphHints.reasons);

  const capabilities = {
    db: Boolean(api?.DB),
    datascriptQuery: typeof api?.DB?.datascriptQuery === "function",
    transact: typeof api?.DB?.transact === "function",
    graphPathLooksDb: graphHints.path,
    graphNameLooksDb: graphHints.name,
  };

  const positiveDbSignals = [
    capabilities.graphPathLooksDb,
    capabilities.graphNameLooksDb,
    capabilities.datascriptQuery && capabilities.transact,
  ].filter(Boolean).length;

  const mode: LogseqRuntimeMode = positiveDbSignals >= 2 ? "db" : "legacy";
  reasons.push(`selected mode=${mode} from ${positiveDbSignals} positive DB signals`);

  return { mode, reasons, capabilities };
}

type BlockId = string | number;

class BaseLogseqApi implements LogseqApi {
  readonly mode: LogseqRuntimeMode;
  protected api: any;

  constructor(mode: LogseqRuntimeMode) {
    this.mode = mode;
    this.api = getLogseq();
  }

  getPluginStorage() {
    try {
      return this.api.FileStorage ?? null;
    } catch (e) {
      console.error("[LogseqApi] Error accessing FileStorage:", e);
      return null;
    }
  }

  getGraphStorage() {
    try {
      return this.api.Assets?.makeSandboxStorage?.() ?? this.getPluginStorage();
    } catch (e) {
      console.error("[LogseqApi] Error accessing graph storage:", e);
      return null;
    }
  }

  async getCurrentGraph(): Promise<any> {
    return this.api.App.getCurrentGraph();
  }

  async getCurrentPage(): Promise<any> {
    return this.api.Editor.getCurrentPage();
  }

  async getCurrentBlock(): Promise<BlockEntity | null> {
    return this.api.Editor.getCurrentBlock?.() ?? null;
  }

  async getAllPages(): Promise<any[]> {
    return (await this.api.Editor.getAllPages?.()) ?? [];
  }

  appendBlockInPage(pageId: string, content: string): Promise<any> {
    return this.api.Editor.appendBlockInPage(pageId, content);
  }

  insertBlock(
    srcBlock: string,
    content: string,
    options?: { sibling?: boolean; before?: boolean },
  ): Promise<BlockEntity | null> {
    return this.api.Editor.insertBlock(srcBlock, content, options);
  }

  async getPage(name: string): Promise<any> {
    return this.api.Editor.getPage(name);
  }

  async getBlock(
    uuid: BlockId,
    options?: { includeChildren?: boolean },
  ): Promise<BlockEntity | null> {
    if (options === undefined) {
      return this.api.Editor.getBlock(uuid);
    }
    return this.api.Editor.getBlock(uuid, options);
  }

  async createPage(name: string, properties?: any, options?: any): Promise<any> {
    return this.api.Editor.createPage(name, properties, options);
  }

  async renamePage(oldName: string, newName: string, options?: { silent?: boolean }): Promise<any> {
    if (options?.silent) {
      try {
        const page = await this.getPage(oldName);
        if (page && this.api.DB?.transact) {
          return await this.api.DB.transact([
            {
              "db/id": page.id,
              "block/name": newName.toLowerCase(),
              "block/original-name": newName,
            },
          ]);
        }
      } catch (e) {
        console.error("[LogseqApi] Error in silent rename:", e);
      }
    }
    return this.api.Editor.renamePage(oldName, newName);
  }

  async deletePage(name: string): Promise<void> {
    return this.api.Editor.deletePage(name);
  }

  async deleteBlock(uuid: string): Promise<void> {
    return this.api.Editor.removeBlock(uuid);
  }

  async updateBlock(uuid: string, content: string): Promise<BlockEntity | null> {
    return this.api.Editor.updateBlock(uuid, content);
  }

  async upsertPageProperty(pageName: string, key: string, value: string): Promise<void> {
    const blocks = await this.getPageBlocksTree(pageName);
    if (blocks.length > 0) {
      await this.api.Editor.upsertBlockProperty(blocks[0].uuid, key, value);
      return;
    }
    await this.appendBlockInPage(pageName, `${key}:: ${value}`);
  }

  async upsertBlockProperty(uuid: string, key: string, value: string): Promise<void> {
    return this.api.Editor.upsertBlockProperty(uuid, key, value);
  }

  async removeBlockProperty(uuid: string, key: string): Promise<void> {
    return this.api.Editor.removeBlockProperty(uuid, key);
  }

  async moveBlock(
    uuid: string,
    targetUuid: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    return this.api.Editor.moveBlock(uuid, targetUuid, options);
  }

  async getPageBlocksTree(pageName: string): Promise<BlockEntity[]> {
    try {
      return (await this.api.Editor.getPageBlocksTree(pageName)) || [];
    } catch (error) {
      console.error("[LogseqApi] Error getting page blocks tree:", error);
      return [];
    }
  }

  async datascriptQuery(query: string): Promise<any[]> {
    try {
      return (await this.api.DB?.datascriptQuery?.(query)) || [];
    } catch (error) {
      console.error("[LogseqApi] Error executing datascript query:", error);
      return [];
    }
  }

  async q(query: string): Promise<any[]> {
    try {
      return (await this.api.DB?.q?.(query)) || [];
    } catch (error) {
      console.error("[LogseqApi] Error executing simple query:", error);
      return [];
    }
  }

  registerSlashCommand(name: string, callback: Function): void {
    this.api.Editor.registerSlashCommand(name, callback as any);
  }

  registerBlockContextMenuItem(name: string, callback: Function): void {
    this.api.Editor.registerBlockContextMenuItem(name, callback as any);
  }

  registerUIItem(location: string, config: any): void {
    this.api.App.registerUIItem(location as any, config);
  }

  provideModel(model: any): void {
    this.api.provideModel(model);
  }

  async queryBlocks(query: string): Promise<BlockEntity[]> {
    return (await this.q(query)) as BlockEntity[];
  }

  onRouteChanged(callback: (event?: any) => void): () => void {
    return this.api.App.onRouteChanged(callback) ?? (() => {});
  }

  onGraphChanged(callback: (event?: any) => void): () => void {
    return this.api.DB?.onChanged?.(callback) ?? (() => {});
  }

  UI = {
    showMsg: async (message: string, type?: string): Promise<any> => {
      return this.api.UI.showMsg(message, type as any);
    },
  };

  Editor = {
    getBlock: async (uuid: BlockId): Promise<BlockEntity> => {
      return this.api.Editor.getBlock(uuid);
    },

    getBlockPropertyContent: async (uuid: string, propertyName: string): Promise<string | null> => {
      const block = await this.api.Editor.getBlock(uuid, { includeChildren: false });
      if (!block) return null;
      if (block.properties && block.properties[propertyName]) {
        const val = block.properties[propertyName];
        return typeof val === "string" ? val : JSON.stringify(val);
      }
      if (!block.content) return null;
      const propertyPattern = new RegExp(`${propertyName}:: \\s*(.+)`);
      const match = block.content.match(propertyPattern);
      return match?.[1]?.trim() ?? null;
    },

    getBlockText: async (uuid: string): Promise<string> => {
      const block = await this.api.Editor.getBlock(uuid, { includeChildren: false });
      if (!block?.content) return "";
      return block.content
        .split("\n")
        .filter((line: string) => {
          const trimmedLine = line.trim();
          return trimmedLine !== "" && !/^[^:]+::\s*.+$/.test(trimmedLine);
        })
        .join("\n");
    },

    updateBlock: async (uuid: string, content: string): Promise<BlockEntity | null> => {
      return this.api.Editor.updateBlock(uuid, content);
    },

    onBlockSelected: (callback: (block: BlockEntity | null) => void): (() => void) => {
      return this.api.Editor.onBlockSelected?.(callback) ?? (() => {});
    },
  };
}

export class LegacyLogseqApi extends BaseLogseqApi {
  constructor() {
    super("legacy");
  }
}

export class DbLogseqApi extends BaseLogseqApi {
  constructor() {
    super("db");
  }

  override async getPageBlocksTree(pageName: string): Promise<BlockEntity[]> {
    const attempts = [pageName];
    const page = await this.getPage(pageName);
    if (page?.id !== undefined) attempts.push(String(page.id));
    if (page?.uuid) attempts.push(page.uuid);
    if (page?.name) attempts.push(page.name);
    if (page?.originalName) attempts.push(page.originalName);

    for (const ref of attempts) {
      try {
        const result = await this.api.Editor.getPageBlocksTree(ref);
        if (Array.isArray(result)) return result;
      } catch {
        // try next ref
      }
    }
    return [];
  }
}

export async function createLogseqApi(): Promise<{ api: LogseqApi; runtime: LogseqRuntimeInfo }> {
  const runtime = await detectLogseqRuntime();
  const api = runtime.mode === "db" ? new DbLogseqApi() : new LegacyLogseqApi();
  return { api, runtime };
}
