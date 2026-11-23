import type { BookmarkItem, VisitStatsMap } from '../types/bookmark';

export interface FrequentBookmarkItem {
  bookmark: BookmarkItem;
  count: number;
  lastVisitedAt: number;
}

export function recordBookmarkVisit(
  stats: VisitStatsMap,
  bookmarkId: string,
  now = Date.now(),
): VisitStatsMap {
  if (!bookmarkId) return stats;
  const prev = stats[bookmarkId];
  return {
    ...stats,
    [bookmarkId]: {
      count: (prev?.count ?? 0) + 1,
      lastVisitedAt: now,
    },
  };
}

export function pruneVisitStats(
  stats: VisitStatsMap,
  liveBookmarkIds: Set<string>,
): VisitStatsMap {
  const pruned: VisitStatsMap = {};
  for (const [id, stat] of Object.entries(stats)) {
    if (liveBookmarkIds.has(id) && stat && stat.count > 0) {
      pruned[id] = stat;
    }
  }
  return pruned;
}

export function getRecentBookmarks(
  bookmarks: BookmarkItem[],
  limit = 50,
): BookmarkItem[] {
  return [...bookmarks]
    .sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0))
    .slice(0, limit);
}

export function getFrequentBookmarks(
  bookmarks: BookmarkItem[],
  stats: VisitStatsMap,
  limit = 50,
): FrequentBookmarkItem[] {
  const list: FrequentBookmarkItem[] = [];
  for (const bookmark of bookmarks) {
    const stat = stats[bookmark.id];
    if (stat && stat.count > 0) {
      list.push({
        bookmark,
        count: stat.count,
        lastVisitedAt: stat.lastVisitedAt ?? 0,
      });
    }
  }

  list.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.lastVisitedAt !== a.lastVisitedAt) {
      return b.lastVisitedAt - a.lastVisitedAt;
    }
    return (b.bookmark.dateAdded ?? 0) - (a.bookmark.dateAdded ?? 0);
  });

  return list.slice(0, limit);
}
