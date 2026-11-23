import { describe, expect, it, vi } from 'vitest';
import {
  MAX_RECYCLE_BIN_ENTRIES,
  appendToRecycleBinList,
  restoreRecycleBinEntry,
} from '../recycleBin';
import { reconcileSnapshot } from '../storage';
import type { BookmarkItem, RecycleBinEntry, ScanSnapshot } from '../../types/bookmark';

const makeBookmark = (id: string): BookmarkItem => ({
  id,
  parentId: '10',
  title: `Title ${id}`,
  url: `https://example.com/${id}`,
  folderPath: ['书签栏', '开发'],
});

describe('recycleBin and snapshot reconciliation', () => {
  it('prepends newly deleted items and enforces 2000-entry cap', () => {
    const existing: RecycleBinEntry[] = Array.from({ length: MAX_RECYCLE_BIN_ENTRIES }, (_, i) => ({
      id: `old-${i}`,
      originalId: `orig-${i}`,
      title: `Old ${i}`,
      url: `https://old.com/${i}`,
      folderPath: ['书签栏'],
      parentId: '1',
      deletedAt: 1000 + i,
      reason: '404',
    }));

    const updated = appendToRecycleBinList(existing, [makeBookmark('new-1')], 'HTTP 404', 9999);
    expect(updated).toHaveLength(MAX_RECYCLE_BIN_ENTRIES);
    expect(updated[0]).toMatchObject({
      originalId: 'new-1',
      title: 'Title new-1',
      reason: 'HTTP 404',
      deletedAt: 9999,
    });
  });

  it('restores directly to original parentId when folder exists', async () => {
    const bookmarksApi = {
      get: vi.fn(async (id: string) => [{ id, title: '开发' }]),
      getChildren: vi.fn(async () => []),
      create: vi.fn(async (details: chrome.bookmarks.CreateDetails) => ({
        id: 'restored-1',
        title: details.title ?? '',
        url: details.url,
        parentId: details.parentId,
      })),
    };

    const entry: RecycleBinEntry = {
      id: 'rb-1',
      originalId: '99',
      title: 'My Doc',
      url: 'https://example.com/doc',
      folderPath: ['书签栏', '开发'],
      parentId: '10',
      deletedAt: 5000,
      reason: '404',
    };

    const created = await restoreRecycleBinEntry(
      entry,
      bookmarksApi as unknown as typeof chrome.bookmarks,
    );
    expect(created.id).toBe('restored-1');
    expect(bookmarksApi.create).toHaveBeenCalledWith({
      parentId: '10',
      title: 'My Doc',
      url: 'https://example.com/doc',
    });
  });

  it('recreates missing nested folderPath under Bookmarks Bar (id 1) when original parentId is gone', async () => {
    let nextId = 500;
    const bookmarksApi = {
      get: vi.fn(async () => {
        throw new Error('Can not find bookmark for id.');
      }),
      getChildren: vi.fn(async () => []),
      create: vi.fn(async (details: chrome.bookmarks.CreateDetails) => ({
        id: String(nextId++),
        title: details.title ?? '',
        url: details.url,
        parentId: details.parentId,
      })),
    };

    const entry: RecycleBinEntry = {
      id: 'rb-2',
      originalId: '100',
      title: 'Deep Link',
      url: 'https://example.com/deep',
      folderPath: ['书签栏', '归档', '2026'],
      parentId: 'deleted-folder',
      deletedAt: 6000,
      reason: '404',
    };

    const created = await restoreRecycleBinEntry(
      entry,
      bookmarksApi as unknown as typeof chrome.bookmarks,
    );
    // Should create '归档' under '1', then '2026' under '500', then bookmark under '501'
    expect(bookmarksApi.create).toHaveBeenNthCalledWith(1, { parentId: '1', title: '归档' });
    expect(bookmarksApi.create).toHaveBeenNthCalledWith(2, { parentId: '500', title: '2026' });
    expect(bookmarksApi.create).toHaveBeenNthCalledWith(3, {
      parentId: '501',
      title: 'Deep Link',
      url: 'https://example.com/deep',
    });
    expect(created.parentId).toBe('501');
  });

  it('reconciles scan snapshot by filtering out bookmark IDs deleted externally', () => {
    const snapshot: ScanSnapshot = {
      savedAt: 1000,
      folderId: 'all',
      results: [
        { bookmark: makeBookmark('1'), status: 'dead_404', reason: '404', checkedAt: 1000 },
        { bookmark: makeBookmark('2'), status: 'valid', reason: '200', checkedAt: 1000 },
      ],
    };
    const reconciled = reconcileSnapshot(snapshot, new Set(['1']));
    expect(reconciled.results.map((r) => r.bookmark.id)).toEqual(['1']);
  });
});
