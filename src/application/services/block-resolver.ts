/**
 * Resolves a Logseq source_id string (e.g. "block:843", "id:843", a bare
 * numeric string "843", or an existing UUID) to the block's UUID, which is
 * what the DOM `blockid` attribute contains.
 *
 * Returns `null` when the ID cannot be parsed or the block is not found.
 */
export async function resolveSourceIdToUuid(sourceId: string | null | undefined): Promise<string | null> {
    if (!sourceId) return null;

    const logseq = (window as any).logseq;
    if (!logseq) return null;

    // Already a UUID (contains hyphens in the expected UUID-v4 pattern)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId)) {
        return sourceId;
    }

    // Parse "block:843", "id:843", or bare "843"
    let numericId: number | null = null;
    const prefixed = sourceId.match(/^(?:block|id):(\d+)$/);
    if (prefixed) {
        numericId = parseInt(prefixed[1], 10);
    } else if (/^\d+$/.test(sourceId.trim())) {
        numericId = parseInt(sourceId.trim(), 10);
    }

    if (numericId === null) return null;

    try {
        const block = await logseq.Editor.getBlock(numericId);
        return block?.uuid ?? null;
    } catch {
        return null;
    }
}
