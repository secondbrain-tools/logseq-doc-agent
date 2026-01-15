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
    this.api = (window as any).logseq;
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
      const block = await this.api.Editor.getBlock(uuid, {
        includeChildren: false
      });


      if (uuid == "6941d548-fcd6-4057-a64e-c404e2031a99" || uuid == "6941d548-3a24-43c0-9e7e-1d833615618d") {
        console.log(`Getting property '${propertyName}' for block ${uuid}:`, block);
        console.log('Block content:', block ? block.content : 'Block not found');
      }

      if (!block) {
        return null;
      }

      // Check properties object first (preferred method)
      if (block.properties && block.properties[propertyName]) {
        console.log(`Found property '${propertyName}' in block.properties:`, block.properties[propertyName]);
        const val = block.properties[propertyName];
        return typeof val === 'string' ? val : JSON.stringify(val);
      }

      if (!block.content) {
        return null;
      }

      const propertyPattern = new RegExp(`${propertyName}:: \\s*(.+)`);
      const match = block.content.match(propertyPattern);

      if (match && match[1]) {
        return match[1].trim();
      }

      return null;
    },

    getBlockText: async (uuid: string): Promise<string> => {
      const block = await this.api.Editor.getBlock(uuid, {
        includeChildren: false
      });

      if (!block || !block.content) {
        return '';
      }

      // Split content into lines
      const lines = block.content.split('\n');

      // Filter out empty lines and property lines (key:: value)
      const filteredLines = lines.filter((line: string) => {
        const trimmedLine = line.trim();
        // Skip empty lines
        if (trimmedLine === '') {
          return false;
        }
        // Skip property lines (key:: value pattern)
        if (/^[^:]+::\s*.+$/.test(trimmedLine)) {
          return false;
        }
        return true;
      });

      // Join the filtered lines back together
      return filteredLines.join('\n');
    }
  };
}