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
     * Reverts a merge (removes the merge property).
     */
    async revertMerge(uuids: string[]): Promise<void> {
        console.log(
            `[MergeActionService] Reverting (removing merge property) for ${uuids.length} blocks.`,
        );

        for (const uuid of uuids) {
            // We don't restore text (original text is already there), just remove property.
            await logseq.Editor.removeBlockProperty(
                uuid,
                "logseq-doc-agent.merge",
            );
        }
    }
}
