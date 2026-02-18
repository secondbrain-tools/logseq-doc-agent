import type { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';
import type { MergeEntity } from '../../domain/merge/entity';

export interface MergeTreeItem {
    uuid: string;
    content: string;
    level: number; // 0 = root
    mergeData?: MergeEntity;
    children?: MergeTreeItem[]; // Optional if we want nested structure, but flattened is easier for UI loop
}

export class MergeTreeService {
    async getMergeTree(rootUuid: string): Promise<MergeTreeItem[]> {
        const rootBlock = await logseq.Editor.getBlock(rootUuid, {
            includeChildren: true,
        });

        if (!rootBlock) {
            return [];
        }

        const items: MergeTreeItem[] = [];
        await this.traverse(rootBlock, 0, items);
        return items;
    }

    async getPageMergeTree(pageUuid: string): Promise<MergeTreeItem[]> {
        const blocks = await logseq.Editor.getPageBlocksTree(pageUuid);
        const items: MergeTreeItem[] = [];

        // Page blocks are an array of root blocks
        for (const block of blocks) {
            await this.traverse(block, 0, items);
        }

        return items;
    }

    private async traverse(block: BlockEntity, level: number, result: MergeTreeItem[]) {
        // Parse merge data if present
        let mergeData: MergeEntity | undefined;


        let rawMerge: any = block.properties?.['logseqDocAgent.merge']; // Logseq normalizes keys? 

        if (block.properties) {

            const keys = Object.keys(block.properties);
            const mergeKey = keys.find(k => k.includes('logseq') && k.includes('merge'));

            if (mergeKey) {
                const val = block.properties[mergeKey];

                if (typeof val === 'string') {
                    try {
                        mergeData = JSON.parse(val);
                    } catch (e) {/* ignore */ }
                } else if (typeof val === 'object') {
                    mergeData = val as MergeEntity;
                }
            }
        }

        // If not found in properties (Sim might not parse complex keys correctly?), 
        // maybe try to extract from content regex?
        if (!mergeData && block.content) {
            const match = block.content.match(/logseq-doc-agent\.merge::\s*(.+)$/m);
            if (match) {
                try {
                    mergeData = JSON.parse(match[1]);
                } catch (e) { }
            }
        }

        // Also fetch live content (excluding properties if possible)
        // For the "Current Content" in the merge tool.
        // We want the text WITHOUT the merge property.
        let cleanContent = block.content;

        // Naively strip the merge property line for display
        if (cleanContent) {
            const lines = cleanContent.split('\n');
            cleanContent = lines.filter(l => !l.includes('logseq-doc-agent.merge::')).join('\n').trim();
        }

        if (mergeData) {
            // Ensure currentContent is set
            mergeData.currentContent = cleanContent;
        }

        result.push({
            uuid: block.uuid,
            content: cleanContent,
            level: level,
            mergeData: mergeData
        });

        // Traverse children
        if (block.children && Array.isArray(block.children)) {
            for (const child of block.children) {
                // Children in `includeChildren` are BlockEntity[] or [uuid, string][]?
                // Usually BlockEntity[] if fully loaded.
                // Safety check
                if ((child as any).uuid) {
                    await this.traverse(child as BlockEntity, level + 1, result);
                }
            }
        }
    }
}
