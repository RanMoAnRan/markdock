import type { BookmarkItem, RecycleBinEntry } from '../types/bookmark';
import { flattenBookmarkTree } from './bookmarks';
import { loadRecycleBin, saveRecycleBin } from './storage';

export const MAX_RECYCLE_BIN_ENTRIES = 2000;

export class RecycleBinCapacityError extends Error {
  readonly existingCount: number;
  readonly requestedCount: number;
  readonly maxEntries: number;

  constructor(existingCount: number, requestedCount: number, maxEntries: number) {
    const remaining = Math.max(0, maxEntries - existingCount);
    super(
      `回收站容量不足（剩余 ${remaining} / ${maxEntries}，本次需备份 ${requestedCount} 条），已阻止删除。请先清理回收站后再试。`,
    );
    this.name = 'RecycleBinCapacityError';
    this.existingCount = existingCount;
    this.requestedCount = requestedCount;
    this.maxEntries = maxEntries;
  }
}

export interface SafeDeleteBookmarksResult {
  entries: RecycleBinEntry[];
  createdEntries: RecycleBinEntry[];
  deletedIds: string[];
  missingIds: string[];
  failedIds: string[];
}

export interface SafeDeleteFolderResult {
  deletedBookmarkCount: number;
  failedBookmarkCount: number;
  removedFolderCount: number;
  remainingNonEmpty: boolean;
}

export interface RestoreRecycleBinResult {
  entries: RecycleBinEntry[];
  restoredIds: string[];
  failedIds: string[];
}

const BOOKMARKS_BAR_LABELS = new Set([
  '书签栏',
  '收藏夹栏',
  'Bookmarks Bar',
  'Bookmarks bar',
  'Favorites bar',
]);

const OTHER_BOOKMARKS_LABELS = new Set([
  '其他书签',
  '其他收藏夹',
  'Other Bookmarks',
  'Other bookmarks',
  'Other favorites',
]);

const MOBILE_BOOKMARKS_LABELS = new Set([
  '移动设备书签',
  'Mobile Bookmarks',
]);

const ROOT_FOLDER_LABELS = new Set([
  ...BOOKMARKS_BAR_LABELS,
  ...OTHER_BOOKMARKS_LABELS,
  ...MOBILE_BOOKMARKS_LABELS,
]);

// Serialize all recycle-bin read-modify-write operations inside the current
// execution context (the Service Worker in production).
let recycleBinWriteQueue: Promise<unknown> = Promise.resolve();

function enqueueRecycleBinMutation<T>(task: () => Promise<T>): Promise<T> {
  const next = recycleBinWriteQueue.then(task, task);
  recycleBinWriteQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function shouldProxyToBackground(
  bookmarksApiOverride?: typeof chrome.bookmarks,
): boolean {
  if (bookmarksApiOverride) return false;
  return (
    typeof window !== 'undefined' &&
    typeof chrome !== 'undefined' &&
    typeof chrome.runtime?.sendMessage === 'function'
  );
}

type BackgroundRecycleBinResponse<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      errorCode: 'CAPACITY' | 'ERROR';
      message: string;
      existingCount?: number;
      requestedCount?: number;
      maxEntries?: number;
    };

async function invokeBackgroundRecycleBin<T>(
  payload: Record<string, unknown>,
): Promise<T | null> {
  try {
    const response = (await chrome.runtime.sendMessage(
      payload,
    )) as BackgroundRecycleBinResponse<T> | undefined;
    if (!response || typeof response.ok !== 'boolean') {
      return null;
    }
    if (!response.ok) {
      if (response.errorCode === 'CAPACITY') {
        throw new RecycleBinCapacityError(
          response.existingCount ?? MAX_RECYCLE_BIN_ENTRIES,
          response.requestedCount ?? 1,
          response.maxEntries ?? MAX_RECYCLE_BIN_ENTRIES,
        );
      }
      throw new Error(response.message || '回收站操作失败');
    }
    return response.data;
  } catch (err) {
    if (err instanceof RecycleBinCapacityError) {
      throw err;
    }
    // If no background listener is registered (e.g. non-extension preview or
    // unit test with stubbed sendMessage), let caller fall back to local queue.
    const msg = err instanceof Error ? err.message : String(err);
    if (
      /Receiving end does not exist|message port closed|Extension context invalidated/i.test(
        msg,
      )
    ) {
      return null;
    }
    throw err;
  }
}

export function appendToRecycleBinList(
  existing: RecycleBinEntry[],
  bookmarks: BookmarkItem[],
  reason: string,
  now: number = Date.now(),
): RecycleBinEntry[] {
  if (existing.length + bookmarks.length > MAX_RECYCLE_BIN_ENTRIES) {
    throw new RecycleBinCapacityError(
      existing.length,
      bookmarks.length,
      MAX_RECYCLE_BIN_ENTRIES,
    );
  }

  const newEntries: RecycleBinEntry[] = bookmarks.map((b, idx) => ({
    id: `rb_${now}_${idx}_${b.id}`,
    originalId: b.id,
    title: b.title,
    url: b.url,
    folderPath: b.folderPath,
    parentId: b.parentId,
    ...(b.rootId ? { rootId: b.rootId } : {}),
    deletedAt: now,
    reason,
  }));

  return [...newEntries, ...existing];
}

async function classifyRemoveError(
  id: string,
  err: unknown,
  bookmarksApi: typeof chrome.bookmarks,
): Promise<'missing' | 'failed'> {
  if (typeof bookmarksApi.get === 'function') {
    try {
      const nodes = await bookmarksApi.get(id);
      if (nodes && nodes.length > 0) {
        return 'failed';
      }
      return 'missing';
    } catch {
      return 'missing';
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/can'?t find|cannot find|not found|no bookmark/i.test(msg)) {
    return 'missing';
  }
  return 'failed';
}

export async function safeDeleteBookmarksLocal(
  bookmarks: BookmarkItem[],
  reason: string,
  bookmarksApi: typeof chrome.bookmarks = chrome.bookmarks,
): Promise<SafeDeleteBookmarksResult> {
  if (bookmarks.length === 0) {
    return {
      entries: await loadRecycleBin(),
      createdEntries: [],
      deletedIds: [],
      missingIds: [],
      failedIds: [],
    };
  }

  return await enqueueRecycleBinMutation(async () => {
    // 1. Write tentative backups FIRST so a mid-delete crash never loses data.
    //    If capacity is insufficient, throws RecycleBinCapacityError and deletes NOTHING.
    const existing = await loadRecycleBin();
    const tentativeEntries = appendToRecycleBinList(existing, bookmarks, reason);
    const createdByBookmarkId = new Map<string, RecycleBinEntry>();
    for (let i = 0; i < bookmarks.length; i++) {
      createdByBookmarkId.set(bookmarks[i].id, tentativeEntries[i]);
    }
    await saveRecycleBin(tentativeEntries);

    const deletedIds: string[] = [];
    const missingIds: string[] = [];
    const failedIds: string[] = [];

    for (const bookmark of bookmarks) {
      try {
        await bookmarksApi.remove(bookmark.id);
        deletedIds.push(bookmark.id);
      } catch (err) {
        const kind = await classifyRemoveError(bookmark.id, err, bookmarksApi);
        if (kind === 'missing') {
          missingIds.push(bookmark.id);
        } else {
          failedIds.push(bookmark.id);
        }
      }
    }

    const rollbackEntryIds = new Set<string>();
    for (const id of [...missingIds, ...failedIds]) {
      const entry = createdByBookmarkId.get(id);
      if (entry) rollbackEntryIds.add(entry.id);
    }

    let finalEntries = tentativeEntries;
    if (rollbackEntryIds.size > 0) {
      finalEntries = tentativeEntries.filter((e) => !rollbackEntryIds.has(e.id));
      await saveRecycleBin(finalEntries);
    }

    const deletedSet = new Set(deletedIds);
    const createdEntries = bookmarks
      .filter((b) => deletedSet.has(b.id))
      .map((b) => createdByBookmarkId.get(b.id)!)
      .filter(Boolean);

    return {
      entries: finalEntries,
      createdEntries,
      deletedIds,
      missingIds,
      failedIds,
    };
  });
}

export async function safeDeleteBookmarks(
  bookmarks: BookmarkItem[],
  reason: string,
  bookmarksApi?: typeof chrome.bookmarks,
): Promise<SafeDeleteBookmarksResult> {
  if (shouldProxyToBackground(bookmarksApi)) {
    const proxied = await invokeBackgroundRecycleBin<SafeDeleteBookmarksResult>({
      type: 'RECYCLE_BIN_DELETE_BOOKMARKS',
      bookmarks,
      reason,
    });
    if (proxied) return proxied;
  }
  return await safeDeleteBookmarksLocal(
    bookmarks,
    reason,
    bookmarksApi ?? chrome.bookmarks,
  );
}

function collectFolderIdsBottomUp(
  node: chrome.bookmarks.BookmarkTreeNode,
  out: string[] = [],
): string[] {
  if (typeof node.url === 'string') return out;
  if (node.children) {
    for (const child of node.children) {
      collectFolderIdsBottomUp(child, out);
    }
  }
  out.push(node.id);
  return out;
}

async function resolveAncestorPrefix(
  folderNode: chrome.bookmarks.BookmarkTreeNode,
  bookmarksApi: typeof chrome.bookmarks,
): Promise<{ ancestorPath: string[]; rootId?: string }> {
  const ancestorTitles: string[] = [];
  let rootId: string | undefined;
  let parentId = folderNode.parentId;
  const visited = new Set<string>([folderNode.id]);

  if (parentId === '0') {
    return { ancestorPath: [], rootId: folderNode.id };
  }

  if (typeof bookmarksApi.get !== 'function') {
    return { ancestorPath: [], rootId: undefined };
  }

  while (parentId && parentId !== '0' && !visited.has(parentId)) {
    visited.add(parentId);
    try {
      const nodes = await bookmarksApi.get(parentId);
      const parent = nodes?.[0];
      if (!parent) break;
      if (parent.title) {
        ancestorTitles.unshift(parent.title);
      }
      if (parent.parentId === '0' || !parent.parentId) {
        rootId = parent.id;
        break;
      }
      parentId = parent.parentId;
    } catch {
      break;
    }
  }

  return { ancestorPath: ancestorTitles, rootId };
}

export async function safeDeleteFolderTreeLocal(
  folderId: string,
  reason: string,
  bookmarksApi: typeof chrome.bookmarks = chrome.bookmarks,
): Promise<SafeDeleteFolderResult> {
  // Re-read the live subtree at confirm time so any newly synced bookmarks are backed up too
  const subtree = await bookmarksApi.getSubTree(folderId);
  if (!subtree || subtree.length === 0) {
    return {
      deletedBookmarkCount: 0,
      failedBookmarkCount: 0,
      removedFolderCount: 0,
      remainingNonEmpty: false,
    };
  }

  const { ancestorPath, rootId } = await resolveAncestorPrefix(
    subtree[0],
    bookmarksApi,
  );
  const liveBookmarks = flattenBookmarkTree(subtree).map((b) => ({
    ...b,
    folderPath: [...ancestorPath, ...b.folderPath],
    ...(rootId ? { rootId } : {}),
  }));

  let deletedBookmarkCount = 0;
  let failedBookmarkCount = 0;
  if (liveBookmarks.length > 0) {
    const deleteRes = await safeDeleteBookmarksLocal(
      liveBookmarks,
      reason,
      bookmarksApi,
    );
    deletedBookmarkCount = deleteRes.deletedIds.length;
    failedBookmarkCount = deleteRes.failedIds.length;
  }

  // Remove only confirmed-empty folders bottom-up; never blind removeTree
  const folderIds = collectFolderIdsBottomUp(subtree[0]);
  let removedFolderCount = 0;
  let remainingNonEmpty = failedBookmarkCount > 0;

  for (const id of folderIds) {
    try {
      const children = await bookmarksApi.getChildren(id);
      if (children.length === 0) {
        await bookmarksApi.remove(id);
        removedFolderCount++;
      } else {
        remainingNonEmpty = true;
      }
    } catch {
      // Folder may already have been removed externally or protected
    }
  }

  return {
    deletedBookmarkCount,
    failedBookmarkCount,
    removedFolderCount,
    remainingNonEmpty,
  };
}

export async function safeDeleteFolderTree(
  folderId: string,
  reason: string,
  bookmarksApi?: typeof chrome.bookmarks,
): Promise<SafeDeleteFolderResult> {
  if (shouldProxyToBackground(bookmarksApi)) {
    const proxied = await invokeBackgroundRecycleBin<SafeDeleteFolderResult>({
      type: 'RECYCLE_BIN_DELETE_FOLDER',
      folderId,
      reason,
    });
    if (proxied) return proxied;
  }
  return await safeDeleteFolderTreeLocal(
    folderId,
    reason,
    bookmarksApi ?? chrome.bookmarks,
  );
}

function inferRootIdFromLabel(label?: string): string {
  if (!label) return '1';
  if (OTHER_BOOKMARKS_LABELS.has(label)) return '2';
  if (MOBILE_BOOKMARKS_LABELS.has(label)) return '3';
  return '1';
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

  // 2. Recreate missing folder path under the original root folder (defaulting to Bookmarks Bar "1")
  const hasRootLabel =
    entry.folderPath.length > 0 && ROOT_FOLDER_LABELS.has(entry.folderPath[0]);
  const segments = hasRootLabel ? entry.folderPath.slice(1) : entry.folderPath;

  let currentParentId =
    entry.rootId || inferRootIdFromLabel(hasRootLabel ? entry.folderPath[0] : undefined);

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

export async function restoreRecycleBinEntriesLocal(
  entryIds: string[],
  bookmarksApi: typeof chrome.bookmarks = chrome.bookmarks,
): Promise<RestoreRecycleBinResult> {
  return await enqueueRecycleBinMutation(async () => {
    const existing = await loadRecycleBin();
    const idSet = new Set(entryIds);
    const targets = existing.filter((e) => idSet.has(e.id));
    const restoredIds: string[] = [];
    const failedIds: string[] = [];

    for (const entry of targets) {
      try {
        await restoreRecycleBinEntry(entry, bookmarksApi);
        restoredIds.push(entry.id);
      } catch {
        failedIds.push(entry.id);
      }
    }

    const restoredSet = new Set(restoredIds);
    const remaining = existing.filter((e) => !restoredSet.has(e.id));
    if (restoredIds.length > 0) {
      await saveRecycleBin(remaining);
    }

    return {
      entries: remaining,
      restoredIds,
      failedIds,
    };
  });
}

export async function restoreRecycleBinEntries(
  entryIds: string[],
  bookmarksApi?: typeof chrome.bookmarks,
): Promise<RestoreRecycleBinResult> {
  if (shouldProxyToBackground(bookmarksApi)) {
    const proxied = await invokeBackgroundRecycleBin<RestoreRecycleBinResult>({
      type: 'RECYCLE_BIN_RESTORE_ENTRIES',
      entryIds,
    });
    if (proxied) return proxied;
  }
  return await restoreRecycleBinEntriesLocal(
    entryIds,
    bookmarksApi ?? chrome.bookmarks,
  );
}

export async function clearRecycleBinLocal(): Promise<RecycleBinEntry[]> {
  return await enqueueRecycleBinMutation(async () => {
    await saveRecycleBin([]);
    return [];
  });
}

export async function clearRecycleBin(): Promise<RecycleBinEntry[]> {
  if (shouldProxyToBackground()) {
    const proxied = await invokeBackgroundRecycleBin<RecycleBinEntry[]>({
      type: 'RECYCLE_BIN_CLEAR',
    });
    if (proxied) return proxied;
  }
  return await clearRecycleBinLocal();
}

export async function removeRecycleBinEntriesLocal(
  entryIds: string[],
): Promise<RecycleBinEntry[]> {
  return await enqueueRecycleBinMutation(async () => {
    const existing = await loadRecycleBin();
    if (entryIds.length === 0) return existing;
    const removeSet = new Set(entryIds);
    const remaining = existing.filter((e) => !removeSet.has(e.id));
    if (remaining.length !== existing.length) {
      await saveRecycleBin(remaining);
    }
    return remaining;
  });
}

export async function removeRecycleBinEntries(
  entryIds: string[],
): Promise<RecycleBinEntry[]> {
  if (shouldProxyToBackground()) {
    const proxied = await invokeBackgroundRecycleBin<RecycleBinEntry[]>({
      type: 'RECYCLE_BIN_REMOVE_ENTRIES',
      entryIds,
    });
    if (proxied) return proxied;
  }
  return await removeRecycleBinEntriesLocal(entryIds);
}
