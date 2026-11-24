import { describe, expect, it } from 'vitest';
import {
  getFrequentBookmarks,
  getRecentBookmarks,
  prunePinnedIds,
  pruneVisitStats,
  recordBookmarkVisit,
} from '../views';
import type { BookmarkItem, VisitStatsMap } from '../../types/bookmark';

const makeBookmark = (
  id: string,
  title: string,
  dateAdded?: number,
): BookmarkItem => ({
  id,
  parentId: '1',
  title,
  url: `https://example.com/${id}`,
  dateAdded,
  folderPath: ['书签栏'],
});

describe('sidebar views & visit stats', () => {
  it('increments visit count and updates lastVisitedAt immutably', () => {
    const initial: VisitStatsMap = {};
    const step1 = recordBookmarkVisit(initial, 'b1', 1000);
    const step2 = recordBookmarkVisit(step1, 'b1', 2500);

    expect(initial).toEqual({});
    expect(step1).toEqual({ b1: { count: 1, lastVisitedAt: 1000 } });
    expect(step2).toEqual({ b1: { count: 2, lastVisitedAt: 2500 } });
  });

  it('prunes deleted or zero-count bookmark entries', () => {
    const stats: VisitStatsMap = {
      b1: { count: 3, lastVisitedAt: 1000 },
      b2: { count: 1, lastVisitedAt: 2000 },
      b3: { count: 0, lastVisitedAt: 3000 },
    };
    expect(pruneVisitStats(stats, new Set(['b1', 'b3']))).toEqual({
      b1: { count: 3, lastVisitedAt: 1000 },
    });
  });

  it('returns recent bookmarks sorted by dateAdded descending and respects limit', () => {
    const items = [
      makeBookmark('b1', 'Old', 1000),
      makeBookmark('b2', 'Newest', 3000),
      makeBookmark('b3', 'Missing date', undefined),
      makeBookmark('b4', 'Middle', 2000),
    ];
    expect(getRecentBookmarks(items, 3).map((b) => b.id)).toEqual([
      'b2',
      'b4',
      'b1',
    ]);
  });

  it('returns frequent bookmarks sorted by count desc, then lastVisitedAt desc, excluding unvisited', () => {
    const items = [
      makeBookmark('b1', 'One', 1000),
      makeBookmark('b2', 'Two', 2000),
      makeBookmark('b3', 'Three', 3000),
      makeBookmark('b4', 'Unvisited', 4000),
    ];
    const stats: VisitStatsMap = {
      b1: { count: 5, lastVisitedAt: 1000 },
      b2: { count: 5, lastVisitedAt: 9000 },
      b3: { count: 2, lastVisitedAt: 9999 },
      deleted_id: { count: 99, lastVisitedAt: 9999 },
    };

    const frequent = getFrequentBookmarks(items, stats, 10);
    expect(frequent.map((f) => f.bookmark.id)).toEqual(['b2', 'b1', 'b3']);
    expect(frequent.map((f) => f.count)).toEqual([5, 5, 2]);
  });

  it('prunes deleted or duplicate pinned bookmark IDs while preserving user order', () => {
    const pinned = ['b3', 'deleted-1', 'b1', 'b3', 'deleted-2'];
    const liveIds = new Set(['b1', 'b2', 'b3']);
    expect(prunePinnedIds(pinned, liveIds)).toEqual(['b3', 'b1']);
  });
});
