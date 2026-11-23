import type { BookmarkItem, RecycleBinEntry } from '../types/bookmark';
import { removeBookmarkById } from './bookmarks';
import { loadRecycleBin, saveRecycleBin } from './storage';

export const MAX_RECYCLE_BIN_ENTRIES = 2000;

const ROOT_FOLDER_LABELS = new Set([
  '书签栏',
  '收藏夹栏',
  'Bookmarks Bar',
  'Bookmarks bar',
  'Favorites bar',
  '其他书签',
  '其他收藏夹',
  'Other Bookmarks',
  'Other bookmarks',
  'Other favorites',
  '移动设备书签',
  'Mobile Bookmarks',
]);

export function appendToRecycleBinList(
  existing: RecycleBinEntry[],
  bookmarks: BookmarkItem[],
  reason: string,
  now: number = Date.now(),
): RecycleBinEntry[] {
  const newEntries: RecycleBinEntry[] = bookmarks.map((b, idx) => ({
    id: `rb_${now}_${idx}_${b.id}`,
    originalId: b.id,
    title: b.title,
    url: b.url,
    folderPath: b.folderPath,
    parentId: b.parentId,
    deletedAt: now,
    reason,
  }));

  return [...newEntries, ...existing].slice(0, MAX_RECYCLE_BIN_ENTRIES);
}

export async function safeDeleteBookmarks(
  bookmarks: BookmarkItem[],
  reason: string,
): Promise<RecycleBinEntry[]> {
  if (bookmarks.length === 0) {
    return await loadRecycleBin();
  }

  // Record to Recycle Bin FIRST before removing from browser bookmarks
  const existing = await loadRecycleBin();
  const updated = appendToRecycleBinList(existing, bookmarks, reason);
  await saveRecycleBin(updated);

  for (const bookmark of bookmarks) {
    try {
      await removeBookmarkById(bookmark.id);
    } catch {
      // Bookmark may have already been removed externally
    }
  }

  return updated;
}

export async function restoreRecycleBinEntry(
  entry: RecycleBinEntry,
  bookmarksApi: typeof chrome.bookmarks = chrome.bookmarks,
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  // 1. Try restoring directly into original parentId if folder still exists
  if (entry.parentId) {
    try {
      const nodes = await bookmarksApi.get(entry.parentId);
      if (nodes && nodes.length > 0 && !nodes[0].url) {
        return await bookmarksApi.create({
          parentId: entry.parentId,
          title: entry.title,
          url: entry.url,
        });
      }
    } catch {
      // Original folder no longer exists; fall through to path recreation
    }
  }

  // 2. Recreate missing folder path under Bookmarks Bar ("1")
  const segments =
    entry.folderPath.length > 0 && ROOT_FOLDER_LABELS.has(entry.folderPath[0])
      ? entry.folderPath.slice(1)
      : entry.folderPath;

  let currentParentId = '1';
  for (const segment of segments) {
    if (!segment) continue;
    const children = await bookmarksApi.getChildren(currentParentId);
    const existingFolder = children.find(
      (child) => !child.url && child.title === segment,
    );
    if (existingFolder) {
      currentParentId = existingFolder.id;
    } else {
      const createdFolder = await bookmarksApi.create({
        parentId: currentParentId,
        title: segment,
      });
      currentParentId = createdFolder.id;
    }
  }

  return await bookmarksApi.create({
    parentId: currentParentId,
    title: entry.title,
    url: entry.url,
  });
}
