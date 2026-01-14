/**
 * Ports for Logseq-specific operations
 */

import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";

export interface LogseqApi {
  getCurrentGraph(): Promise<any>;
  getCurrentPage(): Promise<any>;
  appendBlockInPage(pageId: string, content: string): Promise<any>;
  registerSlashCommand(name: string, callback: Function): void;
  registerBlockContextMenuItem(name: string, callback: Function): void;
  registerUIItem(location: string, config: any): void;
  provideModel(model: any): void;
  UI: {
    showMsg(message: string, type?: string): Promise<any>;
  };
  Editor: {
    getBlock(uuid: string): Promise<BlockEntity>;
    getBlockPropertyContent(uuid: string, propertyName: string): Promise<string | null>;
    getBlockText(uuid: string): Promise<string>;
  };
}