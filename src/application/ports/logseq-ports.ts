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
  getCurrentGraph(): Promise<any>;
  getCurrentPage(): Promise<any>;
  appendBlockInPage(pageId: string, content: string): Promise<any>;
  insertBlock(srcBlock: string, content: string, options?: { sibling?: boolean; before?: boolean }): Promise<BlockEntity | null>;
  getPage(name: string): Promise<any>;
  getBlock(uuid: string, options?: { includeChildren?: boolean }): Promise<BlockEntity | null>;
  createPage(name: string, properties?: any, options?: any): Promise<any>;
  renamePage(oldName: string, newName: string, options?: { silent?: boolean }): Promise<any>;
  deletePage(name: string): Promise<void>;
  deleteBlock(uuid: string): Promise<void>;
  updateBlock(uuid: string, content: string): Promise<BlockEntity | null>;
  upsertPageProperty(pageName: string, key: string, value: string): Promise<void>;
  upsertBlockProperty(uuid: string, key: string, value: string): Promise<void>;
  getPageBlocksTree(pageName: string): Promise<BlockEntity[]>;
  datascriptQuery(query: string): Promise<any[]>;
  q(query: string): Promise<any[]>;
  registerSlashCommand(name: string, callback: Function): void;
  registerBlockContextMenuItem(name: string, callback: Function): void;
  registerUIItem(location: string, config: any): void;
  provideModel(model: any): void;
  queryBlocks(query: string): Promise<BlockEntity[]>;
  UI: {
    showMsg(message: string, type?: string): Promise<any>;
  };
  Editor: {
    getBlock(uuid: string): Promise<BlockEntity>;
    getBlockPropertyContent(uuid: string, propertyName: string): Promise<string | null>;
    getBlockText(uuid: string): Promise<string>;
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