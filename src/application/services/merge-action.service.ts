import { filterProperties } from '../../domain/logseq/properties';

export class MergeActionService {

    /**
     * Accepts a merge for a single block, preserving properties via live fetch.
     */
    async acceptMerge(uuid: string, content: string, filterPatterns: string[]): Promise<void> {
        let finalContent = content;

        // Live Preservation: Fetch block to get ignored properties
        try {
            const currentBlock = await logseq.Editor.getBlock(uuid);

            if (currentBlock && currentBlock.content) {
                const [_, header] = filterProperties(
                    currentBlock.content,
                    filterPatterns,
                );

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
        await logseq.Editor.updateBlock(uuid, finalContent);

        // Also remove merge property
        await logseq.Editor.removeBlockProperty(
            uuid,
            "logseq-doc-agent.merge",
        );
    }

    /**
     * Accepts a batch of merges (tree mode).
     */
    async acceptBatchMerge(edits: Record<string, string>, filterPatterns: string[]): Promise<void> {
        const uuids = Object.keys(edits);
        console.log(
            `[MergeActionService] Processing batch update for ${uuids.length} blocks.`,
        );

        for (const uuid of uuids) {
            await this.acceptMerge(uuid, edits[uuid], filterPatterns);
        }
    }

    /**
     * Reverts a merge.
     * For "add" type: deletes the block entirely (since it was added by the agent).
     * For other types: removes the merge property (keeping original content).
     */
    async revertMerge(uuids: string[]): Promise<void> {
        console.log(
            `[MergeActionService] Reverting for ${uuids.length} blocks.`,
        );

        for (const uuid of uuids) {
            try {
                // Fetch the merge property to check the type
                const rawContent = await logseq.Editor.getBlockPropertyContent(uuid, 'logseq-doc-agent.merge');

                if (rawContent) {
                    const mergeData = JSON.parse(rawContent);

                    if (mergeData.type === 'add') {
                        // For "add" type, delete the block entirely
                        console.log(`[MergeActionService] Block ${uuid} is type 'add', deleting...`);
                        await logseq.Editor.removeBlock(uuid);
                    } else {
                        // For other types, just remove the property
                        await logseq.Editor.removeBlockProperty(uuid, "logseq-doc-agent.merge");
                    }
                } else {
                    // No merge property, just try to remove it anyway
                    await logseq.Editor.removeBlockProperty(uuid, "logseq-doc-agent.merge");
                }
            } catch (e) {
                console.warn(`[MergeActionService] Error reverting block ${uuid}:`, e);
                // Fallback: just remove property
                await logseq.Editor.removeBlockProperty(uuid, "logseq-doc-agent.merge");
            }
        }
    }

    /**
     * Quick accept: removes merge property from current block, keeping content as-is.
     */
    async quickAccept(uuid: string): Promise<void> {
        console.log(`[MergeActionService] Quick accept for block: ${uuid}`);
        await logseq.Editor.removeBlockProperty(uuid, "logseq-doc-agent.merge");
    }

    /**
     * Accepts a delete merge by removing the block.
     * With children? Usually delete removes the tree.
     */
    async acceptDelete(uuid: string): Promise<void> {
        console.log(`[MergeActionService] Accepting DELETE for block: ${uuid}`);
        await logseq.Editor.removeBlock(uuid);
    }

    /**
     * Quick accept with children: removes merge property from block and all descendants.
     */
    async quickAcceptWithChildren(uuid: string): Promise<void> {
        console.log(`[MergeActionService] Quick accept with children for block: ${uuid}`);

        const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
        if (!block) {
            console.warn(`[MergeActionService] Block not found: ${uuid}`);
            return;
        }

        // Collect all UUIDs (current block + descendants)
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


        for (const u of uuids) {
            await logseq.Editor.removeBlockProperty(u, "logseq-doc-agent.merge");
        }
    }
}
