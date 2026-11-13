import type { BriefingResult } from '@workspace/api-client-react';

export const MAX_OFFLINE_BRIEFINGS = 5;
export const MAX_OFFLINE_STORAGE_BYTES = 1_500_000;

export interface SavedOfflineBriefing {
  savedAt: string;
  result: BriefingResult;
}

export interface OfflineStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface OfflineBriefingsRead {
  items: SavedOfflineBriefing[];
  error: string | null;
}

export type OfflineBriefingsWrite =
  | { ok: true; items: SavedOfflineBriefing[] }
  | { ok: false; error: string };

export function offlineBriefingsStorageKey(accountId: string, basePath: string): string {
  return `briefing-agent:offline-public-briefs:v1:${encodeURIComponent(basePath || '/')}:${encodeURIComponent(accountId)}`;
}

function isPublicBrief(value: unknown): value is BriefingResult {
  if (!value || typeof value !== 'object') return false;
  const brief = value as Partial<BriefingResult>;
  return typeof brief.briefingId === 'string' &&
    typeof brief.subject === 'string' &&
    typeof brief.generatedAt === 'string' &&
    brief.sourceMode === 'public' &&
    Array.isArray(brief.topics) &&
    Array.isArray(brief.highlights) &&
    Array.isArray(brief.questions) &&
    Array.isArray(brief.topicBriefs) &&
    Array.isArray(brief.aiSummaries) &&
    Array.isArray(brief.sources) &&
    Array.isArray(brief.sapData) &&
    brief.sapData.length === 0 &&
    Boolean(brief.overview) &&
    Array.isArray(brief.overview?.sourceIds) &&
    Boolean(brief.overview?.topPositive) &&
    Boolean(brief.overview?.topNegative);
}

function isSavedOfflineBriefing(value: unknown): value is SavedOfflineBriefing {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<SavedOfflineBriefing>;
  return typeof record.savedAt === 'string' &&
    Number.isFinite(Date.parse(record.savedAt)) &&
    isPublicBrief(record.result);
}

export function loadOfflineBriefings(storage: OfflineStorage, storageKey: string): OfflineBriefingsRead {
  let serialized: string | null;
  try {
    serialized = storage.getItem(storageKey);
  } catch {
    return { items: [], error: 'This browser blocked access to saved offline briefs.' };
  }

  if (!serialized) return { items: [], error: null };

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed) || !parsed.every(isSavedOfflineBriefing)) {
      return {
        items: [],
        error: 'Saved offline data could not be read safely. Clear the saved copies before saving again.',
      };
    }
    return { items: parsed.slice(0, MAX_OFFLINE_BRIEFINGS), error: null };
  } catch {
    return {
      items: [],
      error: 'Saved offline data could not be read safely. Clear the saved copies before saving again.',
    };
  }
}

export function saveOfflineBriefing(
  storage: OfflineStorage,
  storageKey: string,
  result: BriefingResult,
  savedAt = new Date().toISOString(),
): OfflineBriefingsWrite {
  if (result.sourceMode !== 'public' || result.sapData.length > 0) {
    return { ok: false, error: 'Only public-source briefs can be saved offline. SAP or private data is not stored on this device.' };
  }

  const existing = loadOfflineBriefings(storage, storageKey);
  if (existing.error) return { ok: false, error: existing.error };

  const localResult: BriefingResult = {
    ...result,
    // Keep the cited text and links, but avoid retaining externally hosted media.
    sources: result.sources.map(({ images: _images, ...source }) => source),
  };
  const record: SavedOfflineBriefing = { savedAt, result: localResult };
  const items = [record, ...existing.items.filter((item) => item.result.briefingId !== result.briefingId)]
    .slice(0, MAX_OFFLINE_BRIEFINGS);
  const serialized = JSON.stringify(items);

  if (serialized.length * 2 > MAX_OFFLINE_STORAGE_BYTES) {
    return { ok: false, error: 'This brief is too large for the offline storage limit.' };
  }

  try {
    storage.setItem(storageKey, serialized);
    return { ok: true, items };
  } catch {
    return { ok: false, error: 'The browser could not save this brief. Free device storage or try a shorter brief.' };
  }
}

export function removeOfflineBriefing(
  storage: OfflineStorage,
  storageKey: string,
  briefingId: string,
): OfflineBriefingsWrite {
  const existing = loadOfflineBriefings(storage, storageKey);
  if (existing.error) return { ok: false, error: existing.error };

  const items = existing.items.filter((item) => item.result.briefingId !== briefingId);
  try {
    storage.setItem(storageKey, JSON.stringify(items));
    return { ok: true, items };
  } catch {
    return { ok: false, error: 'The offline copy could not be removed.' };
  }
}

export function clearOfflineBriefings(storage: OfflineStorage, storageKey: string): string | null {
  try {
    storage.removeItem(storageKey);
    return null;
  } catch {
    return 'The browser could not clear saved offline data.';
  }
}
