/**
 * Ports for Logseq-specific operations
 */

import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";

export interface LogseqApi {
  getCurrentGraph(): Promise<any>;
  getCurrentPage(): Promise<any>;
  appendBlockInPage(pageId: string, content: string): Promise<any>;
  insertBlock(srcBlock: string, content: string, options?: { sibling?: boolean; before?: boolean }): Promise<BlockEntity | null>;
  getPage(name: string): Promise<any>;
  createPage(name: string, properties?: any, options?: any): Promise<any>;
  renamePage(oldName: string, newName: string, options?: { silent?: boolean }): Promise<any>;
  deletePage(name: string): Promise<void>;
  upsertPageProperty(pageName: string, key: string, value: string): Promise<void>;
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
}