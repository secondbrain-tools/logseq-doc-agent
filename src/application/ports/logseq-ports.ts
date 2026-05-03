/**
 * Ports for Logseq-specific operations
 */

import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";

/**
 * Async storage interface for plugin file storage
 */
export interface IAsyncStorage {
  getItem(key: string): Promise<string | undefined>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  hasItem(key: string): Promise<boolean>;
  allKeys(): Promise<Array<string>>;
  clear(): Promise<void>;
}

export interface LogseqApi {
  readonly mode: 'legacy' | 'db';
  getCurrentGraph(): Promise<any>;
  getCurrentPage(): Promise<any>;
  getCurrentBlock(): Promise<BlockEntity | null>;
  getAllPages(): Promise<any[]>;
  appendBlockInPage(pageId: string, content: string): Promise<any>;
  insertBlock(srcBlock: string, content: string, options?: { sibling?: boolean; before?: boolean }): Promise<BlockEntity | null>;
  getPage(name: string): Promise<any>;
  getBlock(uuid: string | number, options?: { includeChildren?: boolean }): Promise<BlockEntity | null>;
  createPage(name: string, properties?: any, options?: any): Promise<any>;
  renamePage(oldName: string, newName: string, options?: { silent?: boolean }): Promise<any>;
  deletePage(name: string): Promise<void>;
  deleteBlock(uuid: string): Promise<void>;
  updateBlock(uuid: string, content: string): Promise<BlockEntity | null>;
  upsertPageProperty(pageName: string, key: string, value: string): Promise<void>;
  upsertBlockProperty(uuid: string, key: string, value: string): Promise<void>;
  removeBlockProperty(uuid: string, key: string): Promise<void>;
  moveBlock(uuid: string, targetUuid: string, options?: Record<string, unknown>): Promise<void>;
  getPageBlocksTree(pageName: string): Promise<BlockEntity[]>;
  datascriptQuery(query: string): Promise<any[]>;
  q(query: string): Promise<any[]>;
  registerSlashCommand(name: string, callback: Function): void;
  registerBlockContextMenuItem(name: string, callback: Function): void;
  registerUIItem(location: string, config: any): void;
  provideModel(model: any): void;
  queryBlocks(query: string): Promise<BlockEntity[]>;
  onRouteChanged(callback: (event?: any) => void): () => void;
  onGraphChanged(callback: (event?: any) => void): () => void;
  UI: {
    showMsg(message: string, type?: string): Promise<any>;
  };
  Editor: {
    getBlock(uuid: string | number): Promise<BlockEntity>;
    getBlockPropertyContent(uuid: string, propertyName: string): Promise<string | null>;
    getBlockText(uuid: string): Promise<string>;
    updateBlock(uuid: string, content: string): Promise<BlockEntity | null>;
    onBlockSelected?(callback: (block: BlockEntity | null) => void): () => void;
  };
  /**
   * Get plugin file storage for saving/loading attachment files
   */
  getPluginStorage?(): IAsyncStorage | null;

  /**
   * Get graph-specific file storage (usually in assets or logseq/storages of current graph)
   */
  getGraphStorage?(): IAsyncStorage | null;
}
