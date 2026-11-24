import type { BookmarkItem } from '../types/bookmark';
import {
  RecycleBinCapacityError,
  clearRecycleBinLocal,
  removeRecycleBinEntriesLocal,
  restoreRecycleBinEntriesLocal,
  safeDeleteBookmarksLocal,
  safeDeleteFolderTreeLocal,
} from '../core/recycleBin';

export type RecycleBinMessage =
  | {
      type: 'RECYCLE_BIN_DELETE_BOOKMARKS';
      bookmarks: BookmarkItem[];
      reason: string;
    }
  | {
      type: 'RECYCLE_BIN_DELETE_FOLDER';
      folderId: string;
      reason: string;
    }
  | {
      type: 'RECYCLE_BIN_RESTORE_ENTRIES';
      entryIds: string[];
    }
  | {
      type: 'RECYCLE_BIN_REMOVE_ENTRIES';
      entryIds: string[];
    }
  | {
      type: 'RECYCLE_BIN_CLEAR';
    };

export function isRecycleBinMessage(msg: unknown): msg is RecycleBinMessage {
  if (!msg || typeof msg !== 'object') return false;
  const type = (msg as { type?: unknown }).type;
  return (
    type === 'RECYCLE_BIN_DELETE_BOOKMARKS' ||
    type === 'RECYCLE_BIN_DELETE_FOLDER' ||
    type === 'RECYCLE_BIN_RESTORE_ENTRIES' ||
    type === 'RECYCLE_BIN_REMOVE_ENTRIES' ||
    type === 'RECYCLE_BIN_CLEAR'
  );
}

export async function handleRecycleBinMessage(
  msg: RecycleBinMessage,
  bookmarksApi: typeof chrome.bookmarks = chrome.bookmarks,
): Promise<
  | { ok: true; data: unknown }
  | {
      ok: false;
      errorCode: 'CAPACITY' | 'ERROR';
      message: string;
      existingCount?: number;
      requestedCount?: number;
      maxEntries?: number;
    }
> {
  try {
    switch (msg.type) {
      case 'RECYCLE_BIN_DELETE_BOOKMARKS': {
        const data = await safeDeleteBookmarksLocal(
          msg.bookmarks,
          msg.reason,
          bookmarksApi,
        );
        return { ok: true, data };
      }
      case 'RECYCLE_BIN_DELETE_FOLDER': {
        const data = await safeDeleteFolderTreeLocal(
          msg.folderId,
          msg.reason,
          bookmarksApi,
        );
        return { ok: true, data };
      }
      case 'RECYCLE_BIN_RESTORE_ENTRIES': {
        const data = await restoreRecycleBinEntriesLocal(
          msg.entryIds,
          bookmarksApi,
        );
        return { ok: true, data };
      }
      case 'RECYCLE_BIN_REMOVE_ENTRIES': {
        const data = await removeRecycleBinEntriesLocal(msg.entryIds);
        return { ok: true, data };
      }
      case 'RECYCLE_BIN_CLEAR': {
        const data = await clearRecycleBinLocal();
        return { ok: true, data };
      }
    }
  } catch (err) {
    if (err instanceof RecycleBinCapacityError) {
      return {
        ok: false,
        errorCode: 'CAPACITY',
        message: err.message,
        existingCount: err.existingCount,
        requestedCount: err.requestedCount,
        maxEntries: err.maxEntries,
      };
    }
    return {
      ok: false,
      errorCode: 'ERROR',
      message: err instanceof Error ? err.message : '回收站操作失败',
    };
  }
}
