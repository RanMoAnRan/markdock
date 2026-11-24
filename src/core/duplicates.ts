import type { BookmarkItem, DuplicateGroup } from '../types/bookmark';

const TRACKING_PARAMS = new Set([
  'ref',
  'spm',
  'fbclid',
  'gclid',
  'yclid',
  'mc_cid',
  'mc_eid',
  'igshid',
]);

export interface NormalizeOptions {
  stripTrackingParams?: boolean;
  stripHash?: boolean;
}

export function normalizeUrl(
  rawUrl: string,
  options: NormalizeOptions = {},
): string {
  const { stripTrackingParams = true, stripHash = true } = options;
  if (!rawUrl) return rawUrl;

  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hostname = parsed.hostname.toLowerCase();

    if (stripHash && parsed.hash) {
      // Preserve SPA hash-based application routes (e.g. #/settings, #!/dashboard)
      // while stripping plain in-page section anchors (e.g. #top, #section-1).
      const isAppHashRoute =
        parsed.hash.startsWith('#/') || parsed.hash.startsWith('#!/');
      if (!isAppHashRoute) {
        parsed.hash = '';
      }
    }

    if (stripTrackingParams && parsed.search) {
      const kept = new URLSearchParams();
      const entries = [...parsed.searchParams.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
      );
      for (const [key, value] of entries) {
        const lower = key.toLowerCase();
        if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) {
          continue;
        }
        kept.append(key, value);
      }
      const query = kept.toString();
      parsed.search = query ? `?${query}` : '';
    }

    let normalized = parsed.toString();
    if (normalized.endsWith('/') && parsed.pathname !== '/' ? true : parsed.pathname === '/' && !parsed.search && !parsed.hash) {
      normalized = normalized.replace(/\/+$/, '');
    } else if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
      normalized = parsed.toString();
    }
    return normalized;
  } catch {
    return rawUrl;
  }
}

export type DuplicateKeepStrategy = 'newest' | 'oldest';

export function findDuplicateGroups(
  bookmarks: BookmarkItem[],
  mode: 'exact' | 'normalized',
  options?: NormalizeOptions,
  keepStrategy: DuplicateKeepStrategy = 'newest',
): DuplicateGroup[] {
  const map = new Map<string, BookmarkItem[]>();

  for (const item of bookmarks) {
    const key = mode === 'exact' ? item.url : normalizeUrl(item.url, options);
    const list = map.get(key);
    if (list) {
      list.push(item);
    } else {
      map.set(key, [item]);
    }
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, items] of map.entries()) {
    if (items.length > 1) {
      const sorted = [...items].sort((a, b) => {
        if (keepStrategy === 'oldest') {
          return (
            (a.dateAdded ?? Number.MAX_SAFE_INTEGER) -
            (b.dateAdded ?? Number.MAX_SAFE_INTEGER)
          );
        }
        return (b.dateAdded ?? 0) - (a.dateAdded ?? 0);
      });
      groups.push({ key, items: sorted });
    }
  }

  return groups.sort((a, b) => b.items.length - a.items.length);
}

/**
 * Re-computes removable duplicates against the latest live bookmark list,
 * guaranteeing that at least 1 live copy is always preserved in every group.
 */
export function computeSafeRemovableDuplicates(
  liveBookmarks: BookmarkItem[],
  mode: 'exact' | 'normalized',
  targetKeys?: Set<string>,
  options?: NormalizeOptions,
  keepStrategy: DuplicateKeepStrategy = 'newest',
): BookmarkItem[] {
  const freshGroups = findDuplicateGroups(
    liveBookmarks,
    mode,
    options,
    keepStrategy,
  );
  const removable: BookmarkItem[] = [];
  for (const group of freshGroups) {
    if (targetKeys && !targetKeys.has(group.key)) continue;
    if (group.items.length > 1) {
      removable.push(...group.items.slice(1));
    }
  }
  return removable;
}

export function findMatchingBookmarksByUrl(
  bookmarks: BookmarkItem[],
  rawUrl: string,
  options?: NormalizeOptions,
): BookmarkItem[] {
  const trimmed = rawUrl.trim();
  if (!trimmed) return [];

  try {
    // Reject incomplete/malformed URLs so typing in the modal doesn't trigger false alerts
    new URL(trimmed);
  } catch {
    return [];
  }

  const targetKey = normalizeUrl(trimmed, options);
  return bookmarks
    .filter((item) => normalizeUrl(item.url, options) === targetKey)
    .sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0));
}
