
import { type ParsedBlock, type InsertedNode } from './subtree-parser';
import type { LogseqBlock } from './types';
import type { MergeEntity } from '../../../domain/merge/entity';

// Access the global logseq object
const getLogseq = () => (window as any).logseq;

/**
 * Removes all children of a given block.
 * 
 * @param blockUuid The UUID of the parent block
 */
export async function removeAllChildren(blockUuid: string): Promise<void> {
    const logseq = getLogseq();
    if (!logseq) return;

    try {
        const block = await logseq.Editor.getBlock(blockUuid, { includeChildren: true });
        if (block && block.children && block.children.length > 0) {
            // Delete text children in reverse order to avoid index shifting issues (though UUIDs should be safe)
            // Note: Logseq API removeBlock takes UUID
            for (const child of [...block.children].reverse()) {
                if (child.uuid) {
                    await logseq.Editor.removeBlock(child.uuid);
                }
            }
        }
    } catch (e) {
        console.error(`[BlockOperations] Error removing children of ${blockUuid}:`, e);
        throw e;
    }
}

/**
 * Recursively inserts a parsed block tree into Logseq.
 * 
 * @param parentUuid The UUID of the parent block to insert under
 * @param node The ParsedBlock to insert
 * @param options Options for the insertBlock call (only used for root)
 * @param merge Whether to add merge metadata
 * @returns InsertedNode with IDs and any errors
 */
export async function insertSubtreeRecursive(
    parentUuid: string,
    node: ParsedBlock,
    options: any,
    merge: boolean
): Promise<InsertedNode> {
    const logseq = getLogseq();

    const result: InsertedNode = {
        id: 'unknown',
        content: node.content,
        children: []
    };

    if (!logseq) {
        result.error = 'Logseq API not available';
        return result;
    }

    try {
        // Build insert options including properties
        const insertOptions: any = { ...options };
        if (Object.keys(node.properties).length > 0) {
            insertOptions.properties = node.properties;
        }

        // Insert the block
        const newBlock = await logseq.Editor.insertBlock(parentUuid, node.content, insertOptions);

        if (!newBlock) {
            result.error = 'Failed to insert block';
            return result;
        }

        // Get the block ID
        let blockId: number | undefined = newBlock.id;
        if (blockId === undefined && newBlock.uuid) {
            const fetchedBlock = await logseq.Editor.getBlock(newBlock.uuid);
            blockId = fetchedBlock?.id;
        }
        result.id = blockId !== undefined ? blockId : 'unknown';

        // Add merge metadata if enabled
        if (merge && newBlock.uuid) {
            const mergeData: MergeEntity = { type: 'add' };
            await logseq.Editor.upsertBlockProperty(newBlock.uuid, 'logseq-doc-agent.merge', JSON.stringify(mergeData));
        }

        // Recursively insert children (children don't use the anchor options)
        for (const child of node.children) {
            const childResult = await insertSubtreeRecursive(
                newBlock.uuid,
                child,
                {}, // Children are always inserted as children of their parent
                merge
            );
            result.children.push(childResult);

            // If child had an error, propagate it up
            if (childResult.error && !result.error) {
                result.error = `Child error: ${childResult.error}`;
            }
        }

    } catch (e) {
        result.error = String(e);
    }

    return result;
}
