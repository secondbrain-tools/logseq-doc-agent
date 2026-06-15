const LOG_PREFIX = "[BlockResolver]";
import { getCurrentLogseqApi } from "../../infra/logseq";

const uuidCache = new Map<string, string | null>();

/**
 * Resolves a Logseq source_id string (e.g. "block:843", "id:843", a bare
 * numeric string "843", or an existing UUID) to the block's UUID, which is
 * what the DOM `blockid` attribute contains.
 *
 * Results are cached for the lifetime of the session so repeated lookups
 * (e.g. evidence + suggestion for the same child block) don't hit the API again.
 *
 * Returns `null` when the ID cannot be parsed or the block is not found.
 */
export async function resolveSourceIdToUuid(
  sourceId: string | null | undefined,
): Promise<string | null> {
  if (!sourceId) return null;

  // Already a UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId)) {
    return sourceId;
  }

  if (uuidCache.has(sourceId)) {
    const cached = uuidCache.get(sourceId)!;
    console.log(`${LOG_PREFIX} cache hit: "${sourceId}" => ${cached ?? "null"}`);
    return cached;
  }

  // Parse "block:843", "id:843", or bare "843"
  let numericId: number | null = null;
  const prefixed = sourceId.match(/^(?:block|id):(\d+)$/);
  if (prefixed) {
    numericId = parseInt(prefixed[1], 10);
  } else if (/^\d+$/.test(sourceId.trim())) {
    numericId = parseInt(sourceId.trim(), 10);
  }

  if (numericId === null) {
    console.warn(`${LOG_PREFIX} could not parse numeric ID from "${sourceId}"`);
    uuidCache.set(sourceId, null);
    return null;
  }

  try {
    const block = await getCurrentLogseqApi().getBlock(numericId);
    const uuid = block?.uuid ?? null;
    console.log(`${LOG_PREFIX} resolved "${sourceId}" (id=${numericId}) => uuid=${uuid}`);
    uuidCache.set(sourceId, uuid);
    return uuid;
  } catch (e) {
    console.warn(`${LOG_PREFIX} API error resolving "${sourceId}":`, e);
    uuidCache.set(sourceId, null);
    return null;
  }
}

/**
 * Clears the resolution cache. Useful when the graph changes (e.g. page reload).
 */
export function clearResolverCache(): void {
  uuidCache.clear();
}
