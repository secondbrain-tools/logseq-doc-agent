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
                // 1. Fetch block to get properties
                // Note: getBlockPropertyContent is explicitly avoided as it throws "Not existed method" errors in some contexts.

                let rawContent: string | null = null;
                let mergeData: any = null;

                const block = await logseq.Editor.getBlock(uuid);

                if (block) {
                    // Check properties object (handling Logseq normalization)
                    if (block.properties) {
                        // Kebab-case (original)
                        if (block.properties['logseq-doc-agent.merge']) {
                            const prop = block.properties['logseq-doc-agent.merge'];
                            if (typeof prop === 'string') rawContent = prop;
                            else mergeData = prop;
                        }
                        // CamelCase (normalized)
                        else if (block.properties['logseqDocAgent.merge']) {
                            const prop = block.properties['logseqDocAgent.merge'];
                            if (typeof prop === 'string') rawContent = prop;
                            else mergeData = prop;
                        }
                    }

                    // Final fallback: Content Regex
                    if (!mergeData && !rawContent && block.content) {
                        const match = block.content.match(/logseq-doc-agent\.merge::\s*(.+)/);
                        if (match && match[1]) {
                            rawContent = match[1];
                        }
                    }
                } else {
                    console.warn(`[MergeActionService] Block ${uuid} could not be fetched.`);
                }

                if (!mergeData && rawContent) {
                    try {
                        mergeData = JSON.parse(rawContent);
                    } catch (e) {
                        console.warn(`[MergeActionService] Failed to parse merge data for ${uuid}`, e);
                    }
                }

                if (mergeData) {
                    if (mergeData.type === 'add') {
                        // For "add" type, delete the block entirely
                        console.log(`[MergeActionService] Block ${uuid} is type 'add', deleting...`);
                        await logseq.Editor.removeBlock(uuid);
                        continue; // Done for this block
                    } else if (mergeData.type === 'update') {
                        // For "update" type, check if we have base content to restore
                        if (mergeData.base !== undefined) {
                            console.log(`[MergeActionService] Block ${uuid} is type 'update', restoring base content...`);
                            await logseq.Editor.updateBlock(uuid, mergeData.base);
                        }
                    }
                }

                // Default: Just remove the property (cleans up 'update' markers or unknown types)
                await logseq.Editor.removeBlockProperty(uuid, "logseq-doc-agent.merge");

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
