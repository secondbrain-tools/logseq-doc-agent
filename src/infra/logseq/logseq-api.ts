/**
 * Implementation of Logseq API port using the Logseq library
 */

import type { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';
import type { LogseqApi, IAsyncStorage } from '../../application/ports/logseq-ports';
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

  /**
   * Get plugin file storage for saving/loading attachment files
   * Uses logseq.FileStorage which is an LSPluginFileStorage instance
   */
  getPluginStorage(): IAsyncStorage | null {
    try {
      // logseq.FileStorage is already an LSPluginFileStorage instance
      const storage = this.api.FileStorage;
      if (storage) {
        console.log('[LogseqApiImpl] Using logseq.FileStorage');
        return storage as IAsyncStorage;
      } else {
        console.warn('[LogseqApiImpl] logseq.FileStorage not available');
        return null;
      }
    } catch (e) {
      console.error('[LogseqApiImpl] Error accessing FileStorage:', e);
      return null;
    }
  }

  /**
   * Get graph-specific file storage
   * Uses logseq.Assets.makeSandboxStorage() to ensure files are stored in the current graph
   */
  getGraphStorage(): IAsyncStorage | null {
    try {
      if (this.api.Assets && this.api.Assets.makeSandboxStorage) {
        console.log('[LogseqApiImpl] Using logseq.Assets.makeSandboxStorage');
        return this.api.Assets.makeSandboxStorage();
      } else {
        console.warn('[LogseqApiImpl] logseq.Assets.makeSandboxStorage not available');
        return this.getPluginStorage(); // Fallback to FileStorage
      }
    } catch (e) {
      console.error('[LogseqApiImpl] Error accessing Assets.makeSandboxStorage:', e);
      return null;
    }
  }

  async getCurrentGraph(): Promise<any> {
    return this.api.App.getCurrentGraph();
  }

  async getCurrentPage(): Promise<any> {
    return this.api.Editor.getCurrentPage();
  }

  appendBlockInPage(pageId: string, content: string): Promise<any> {
    return this.api.Editor.appendBlockInPage(pageId, content);
  }

  async insertBlock(srcBlock: string, content: string, options?: { sibling?: boolean; before?: boolean }): Promise<BlockEntity | null> {
    return this.api.Editor.insertBlock(srcBlock, content, options);
  }

  async getPage(name: string): Promise<any> {
    return this.api.Editor.getPage(name);
  }

  async getBlock(uuid: string, options?: { includeChildren?: boolean }): Promise<BlockEntity | null> {
    return this.api.Editor.getBlock(uuid, options);
  }

  async createPage(name: string, properties?: any, options?: any): Promise<any> {
    return this.api.Editor.createPage(name, properties, options);
  }

  async renamePage(oldName: string, newName: string, options?: { silent?: boolean }): Promise<any> {
    if (options?.silent) {
      try {
        const page = await this.getPage(oldName);
        if (page) {
          // Use DB transaction to rename silently (prevents navigation)
          return await this.api.DB.transact([{
            'db/id': page.id,
            'block/name': newName.toLowerCase(),
            'block/original-name': newName
          }]);
        }
      } catch (e) {
        console.error('Error in silent rename:', e);
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
    try {
      const blocks = await this.getPageBlocksTree(pageName);
      if (blocks && blocks.length > 0) {
        // Update property on the first block (standard Logseq behavior for page properties)
        await this.api.Editor.upsertBlockProperty(blocks[0].uuid, key, value);
      } else {
        // Page is empty, append a block with the property
        await this.appendBlockInPage(pageName, `${key}:: ${value}`);
      }
    } catch (e) {
      console.error(`Error upserting page property ${key} for page ${pageName}:`, e);
    }
  }

  async upsertBlockProperty(uuid: string, key: string, value: string): Promise<void> {
    return this.api.Editor.upsertBlockProperty(uuid, key, value);
  }

  async getPageBlocksTree(pageName: string): Promise<BlockEntity[]> {
    try {
      return await this.api.Editor.getPageBlocksTree(pageName) || [];
    } catch (error) {
      console.error('Error getting page blocks tree:', error);
      return [];
    }
  }

  async datascriptQuery(query: string): Promise<any[]> {
    try {
      if (!this.api.DB) {
        console.warn('Logseq DB API not available');
        return [];
      }
      return this.api.DB.datascriptQuery(query) || [];
    } catch (error) {
      console.error('Error executing datascript query:', error);
      return [];
    }
  }

  async q(query: string): Promise<any[]> {
    try {
      if (!this.api.DB) {
        console.warn('Logseq DB API not available');
        return [];
      }
      return await this.api.DB.q(query) || [];
    } catch (error) {
      console.error('Error executing simple query:', error);
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
    try {
      if (!this.api.DB) {
        console.warn('Logseq DB API not available');
        return [];
      }
      return await this.api.DB.q(query);
    } catch (error) {
      console.error('Error querying blocks:', error);
      return [];
    }
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