/**
 * Implementation of Logseq API port using the Logseq library
 */

import type { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';
import type { LogseqApi } from '../../application/ports/logseq-ports';
import '@logseq/libs';

/**
 * Concrete implementation of Logseq API using the global logseq object
 */
export class LogseqApiImpl implements LogseqApi {
  private api: any;

  constructor() {
        
    // @ts-ignore - logseq is a global object provided by Logseq
    this.api = logseq;
  }

  async getCurrentGraph(): Promise<any> {
    return this.api.App.getCurrentGraph();
  }

  async getCurrentPage(): Promise<any> {
    return this.api.Editor.getCurrentPage();
  }

  async appendBlockInPage(pageId: string, content: string): Promise<any> {
    return this.api.Editor.appendBlockInPage(pageId, content);
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

  UI = {
    showMsg: async (message: string, type?: string): Promise<any> => {
      return this.api.UI.showMsg(message, type as any);
    }
  };

  Editor = {
    getBlock: async (uuid: string): Promise<BlockEntity> => {
      return this.api.Editor.getBlock(uuid);
    },
    
    getBlockPropertyContent: async (uuid: string, propertyName: string): Promise<string | null> => {
      const block = await this.api.Editor.getBlock(uuid);
      if (!block || !block.content) {
        return null;
      }
      
      const propertyPattern = new RegExp(`${propertyName}:: \\s*(.+)`);      
      const match = block.content.match(propertyPattern);
      
      if (match && match[1]) {
        return match[1].trim();
      }
      
      return null;
    }
  };
}