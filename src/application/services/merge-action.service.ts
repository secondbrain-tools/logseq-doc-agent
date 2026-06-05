import {
  filterProperties,
  LDA_MERGE_PROPERTY,
  LDA_MERGE_PROPERTY_CAMEL,
} from "../../domain/logseq/properties";
import { getCurrentLogseqApi } from "../../infra/logseq";

export class MergeActionService {
  /**
   * Accepts a merge for a single block, preserving properties via live fetch.
   */
  async acceptMerge(uuid: string, content: string, filterPatterns: string[]): Promise<void> {
    const logseqApi = getCurrentLogseqApi();
    let finalContent = content;

    // Live Preservation: Fetch block to get ignored properties
    try {
      const currentBlock = await logseqApi.getBlock(uuid);

      if (currentBlock && currentBlock.content) {
        const [_, header] = filterProperties(currentBlock.content, filterPatterns);

        if (header) {
          // Prepend header manually to force position at the top
          if (finalContent.startsWith("\n")) {
            finalContent = header + finalContent;
          } else {
            finalContent = header + "\n" + finalContent;
          }
        }
      }
    } catch (err) {
      console.warn(
        `[MergeActionService] Failed to fetch live block ${uuid} for property preservation. Using content as-is.`,
        err,
      );
    }

    // Update block with manually constructed content (properties at top)
    await logseqApi.updateBlock(uuid, finalContent);

    // Also remove merge property
    await logseqApi.removeBlockProperty(uuid, LDA_MERGE_PROPERTY);
  }

  /**
   * Accepts a batch of merges (tree mode).
   */
  async acceptBatchMerge(edits: Record<string, string>, filterPatterns: string[]): Promise<void> {
    const uuids = Object.keys(edits);
    console.log(`[MergeActionService] Processing batch update for ${uuids.length} blocks.`);

    for (const uuid of uuids) {
      await this.acceptMerge(uuid, edits[uuid], filterPatterns);
    }
  }

  /**
   * Reverts a merge.
   */
  async revertMerge(uuids: string[]): Promise<void> {
    const logseqApi = getCurrentLogseqApi();
    console.log(`[MergeActionService] Reverting for ${uuids.length} blocks.`);

    for (const uuid of uuids) {
      try {
        const mergeData = await this.extractMergeData(uuid);

        if (mergeData) {
          if (mergeData.type === "add") {
            await logseqApi.deleteBlock(uuid);
            continue;
          } else if (mergeData.type === "update" && mergeData.base !== undefined) {
            await logseqApi.updateBlock(uuid, mergeData.base);
          }
        }

        await logseqApi.removeBlockProperty(uuid, LDA_MERGE_PROPERTY);
      } catch (e) {
        console.warn(`[MergeActionService] Error reverting block ${uuid}:`, e);
        await logseqApi.removeBlockProperty(uuid, LDA_MERGE_PROPERTY);
      }
    }
  }

  /**
   * Quick accept: removes merge property from current block, keeping content as-is.
   */
  async quickAccept(uuid: string): Promise<void> {
    await getCurrentLogseqApi().removeBlockProperty(uuid, LDA_MERGE_PROPERTY);
  }

  /**
   * Accepts a delete merge by removing the block.
   */
  async acceptDelete(uuid: string): Promise<void> {
    await getCurrentLogseqApi().deleteBlock(uuid);
  }

  /**
   * Quick accept with children: removes merge property from block and all descendants.
   */
  async quickAcceptWithChildren(uuid: string): Promise<void> {
    const logseqApi = getCurrentLogseqApi();
    const block = await logseqApi.getBlock(uuid, { includeChildren: true });
    if (!block) {
      console.warn(`[MergeActionService] Block not found: ${uuid}`);
      return;
    }

    const uuids = this.getDescendantUuids(block);
    for (const u of uuids) {
      await logseqApi.removeBlockProperty(u, LDA_MERGE_PROPERTY);
    }
  }

  /**
   * Reverts merge for a block and all its descendants.
   */
  async revertMergeWithChildren(uuid: string): Promise<void> {
    const block = await getCurrentLogseqApi().getBlock(uuid, { includeChildren: true });
    if (!block) {
      console.warn(`[MergeActionService] Block not found: ${uuid}`);
      return;
    }

    const uuids = this.getDescendantUuids(block);
    await this.revertMerge(uuids);
  }

  // --- Private Helpers ---

  private getDescendantUuids(block: any): string[] {
    const uuids: string[] = [];
    const traverse = (b: any) => {
      if (b.uuid) uuids.push(b.uuid);
      if (b.children && Array.isArray(b.children)) {
        for (const child of b.children) {
          traverse(child);
        }
      }
    };
    traverse(block);
    return uuids;
  }

  private async extractMergeData(uuid: string): Promise<any> {
    const block = await getCurrentLogseqApi().getBlock(uuid);
    if (!block) {
      console.warn(`[MergeActionService] Block ${uuid} could not be fetched.`);
      return null;
    }

    let rawContent: string | null = null;
    let mergeData: any = null;

    if (block.properties) {
      if (block.properties[LDA_MERGE_PROPERTY]) {
        const prop = block.properties[LDA_MERGE_PROPERTY];
        if (typeof prop === "string") rawContent = prop;
        else mergeData = prop;
      } else if (block.properties[LDA_MERGE_PROPERTY_CAMEL]) {
        const prop = block.properties[LDA_MERGE_PROPERTY_CAMEL];
        if (typeof prop === "string") rawContent = prop;
        else mergeData = prop;
      }
    }

    if (!mergeData && !rawContent && block.content) {
      const match = block.content.match(new RegExp(`${LDA_MERGE_PROPERTY}::\\s*(.+)`));
      if (match && match[1]) {
        rawContent = match[1];
      }
    }

    if (!mergeData && rawContent) {
      try {
        mergeData = JSON.parse(rawContent);
      } catch (e) {
        console.warn(`[MergeActionService] Failed to parse merge data for ${uuid}`, e);
      }
    }

    return mergeData;
  }
}
