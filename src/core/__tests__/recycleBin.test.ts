import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_RECYCLE_BIN_ENTRIES,
  RecycleBinCapacityError,
  appendToRecycleBinList,
  removeRecycleBinEntries,
  restoreRecycleBinEntry,
  safeDeleteBookmarks,
  safeDeleteFolderTree,
} from '../recycleBin';
import { handleRecycleBinMessage } from '../../background/recycleBinHandler';
import { reconcileSnapshot } from '../storage';
import type { BookmarkItem, RecycleBinEntry, ScanSnapshot } from '../../types/bookmark';

const makeBookmark = (id: string, url = `https://example.com/${id}`): BookmarkItem => ({
  id,
  parentId: '10',
  title: `Title ${id}`,
  url,
  folderPath: ['书签栏', '开发'],
});

describe('recycleBin and snapshot reconciliation', () => {
  const storageMap = new Map<string, unknown>();

  beforeEach(() => {
    storageMap.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws RecycleBinCapacityError instead of silently evicting backups when exceeding 2000-entry cap', () => {
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

    expect(() =>
      appendToRecycleBinList(existing, [makeBookmark('new-1')], 'HTTP 404', 9999),
    ).toThrow(RecycleBinCapacityError);
  });

  it('blocks browser bookmark deletion when recycle bin capacity is exceeded', async () => {
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
    storageMap.set('bcp_recycle_bin', existing);

    const removeMock = vi.fn(async () => {});
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storageMap.get(key) })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) storageMap.set(k, v);
          }),
        },
      },
      bookmarks: { remove: removeMock },
    });

    await expect(
      safeDeleteBookmarks([makeBookmark('overflow-1')], 'test'),
    ).rejects.toThrow(RecycleBinCapacityError);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('serializes concurrent safeDeleteBookmarks calls so no backup entry is lost', async () => {
    const removeMock = vi.fn(async () => {});
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => {
            await new Promise((r) => setTimeout(r, 15));
            return { [key]: storageMap.get(key) };
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            await new Promise((r) => setTimeout(r, 15));
            for (const [k, v] of Object.entries(items)) storageMap.set(k, v);
          }),
        },
      },
      bookmarks: { remove: removeMock },
    });

    await Promise.all([
      safeDeleteBookmarks([makeBookmark('c-1')], 'single-1'),
      safeDeleteBookmarks([makeBookmark('c-2')], 'single-2'),
    ]);

    const saved = (storageMap.get('bcp_recycle_bin') as RecycleBinEntry[]) ?? [];
    expect(saved.map((e) => e.originalId).sort()).toEqual(['c-1', 'c-2']);
    expect(removeMock).toHaveBeenCalledTimes(2);
  });

  it('safeDeleteFolderTree re-reads live subtree, backs up all bookmarks, and removes only confirmed-empty folders', async () => {
    const removedIds: string[] = [];
    const bookmarksApi = {
      getSubTree: vi.fn(async () => [
        {
          id: 'folder-1',
          title: 'Work',
          children: [
            { id: 'b-1', parentId: 'folder-1', title: 'Old', url: 'https://a.com' },
            {
              id: 'sub-1',
              parentId: 'folder-1',
              title: 'Sub',
              children: [
                { id: 'b-2', parentId: 'sub-1', title: 'Synced', url: 'https://b.com' },
              ],
            },
          ],
        },
      ]),
      getChildren: vi.fn(async () => []),
      remove: vi.fn(async (id: string) => {
        removedIds.push(id);
      }),
    };

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storageMap.get(key) })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) storageMap.set(k, v);
          }),
        },
      },
      bookmarks: bookmarksApi,
    });

    const outcome = await safeDeleteFolderTree(
      'folder-1',
      '删除文件夹',
      bookmarksApi as unknown as typeof chrome.bookmarks,
    );

    expect(outcome).toEqual({
      deletedBookmarkCount: 2,
      failedBookmarkCount: 0,
      removedFolderCount: 2,
      remainingNonEmpty: false,
    });
    const saved = (storageMap.get('bcp_recycle_bin') as RecycleBinEntry[]) ?? [];
    expect(saved.map((e) => e.originalId).sort()).toEqual(['b-1', 'b-2']);
    // Bookmarks removed first, then bottom-up folders (sub-1 before folder-1)
    expect(removedIds).toEqual(['b-1', 'b-2', 'sub-1', 'folder-1']);
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
    expect(bookmarksApi.create).toHaveBeenNthCalledWith(1, { parentId: '1', title: '归档' });
    expect(bookmarksApi.create).toHaveBeenNthCalledWith(2, { parentId: '500', title: '2026' });
    expect(bookmarksApi.create).toHaveBeenNthCalledWith(3, {
      parentId: '501',
      title: 'Deep Link',
      url: 'https://example.com/deep',
    });
    expect(created.parentId).toBe('501');
  });

  it('reconciles scan snapshot by ID and URL so modified bookmarks do not keep stale dead status', () => {
    const snapshot: ScanSnapshot = {
      savedAt: 1000,
      folderId: 'all',
      results: [
        { bookmark: makeBookmark('1', 'https://old.example/1'), status: 'dead_404', reason: '404', checkedAt: 1000 },
        { bookmark: makeBookmark('2', 'https://same.example/2'), status: 'dead_404', reason: '404', checkedAt: 1000 },
        { bookmark: makeBookmark('3', 'https://deleted.example/3'), status: 'valid', reason: '200', checkedAt: 1000 },
      ],
    };
    const liveMap = new Map<string, string>([
      ['1', 'https://updated.example/1'], // URL changed!
      ['2', 'https://same.example/2'],
    ]);
    const reconciled = reconcileSnapshot(snapshot, liveMap);
    expect(reconciled.results.map((r) => r.bookmark.id)).toEqual(['2']);
  });

  it('serializes concurrent cross-page delete requests through handleRecycleBinMessage without losing backups', async () => {
    const removeMock = vi.fn(async () => {});
    const bookmarksApi = {
      remove: removeMock,
      get: vi.fn(async () => []),
    } as unknown as typeof chrome.bookmarks;

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => {
            await new Promise((r) => setTimeout(r, 15));
            return { [key]: storageMap.get(key) };
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            await new Promise((r) => setTimeout(r, 15));
            for (const [k, v] of Object.entries(items)) storageMap.set(k, v);
          }),
        },
      },
      bookmarks: bookmarksApi,
    });

    const [res1, res2] = await Promise.all([
      handleRecycleBinMessage(
        {
          type: 'RECYCLE_BIN_DELETE_BOOKMARKS',
          bookmarks: [makeBookmark('sidepanel-1')],
          reason: '侧边栏删除',
        },
        bookmarksApi,
      ),
      handleRecycleBinMessage(
        {
          type: 'RECYCLE_BIN_DELETE_BOOKMARKS',
          bookmarks: [makeBookmark('workbench-1')],
          reason: '工作台清理',
        },
        bookmarksApi,
      ),
    ]);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    const saved = (storageMap.get('bcp_recycle_bin') as RecycleBinEntry[]) ?? [];
    expect(saved.map((e) => e.originalId).sort()).toEqual([
      'sidepanel-1',
      'workbench-1',
    ]);
    expect(removeMock).toHaveBeenCalledTimes(2);
  });

  it('distinguishes browser-refused delete (managed bookmark) from missing bookmark and rolls back backup', async () => {
    const bookmarksApi = {
      remove: vi.fn(async (id: string) => {
        if (id === 'managed-1') throw new Error("Can't modify managed bookmarks.");
        if (id === 'gone-1') throw new Error("Can't find bookmark for id.");
      }),
      get: vi.fn(async (id: string) => {
        if (id === 'managed-1') {
          return [{ id: 'managed-1', title: 'Policy', url: 'https://corp.example' }];
        }
        throw new Error("Can't find bookmark for id.");
      }),
    } as unknown as typeof chrome.bookmarks;

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storageMap.get(key) })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) storageMap.set(k, v);
          }),
        },
      },
      bookmarks: bookmarksApi,
    });

    const res = await safeDeleteBookmarks(
      [
        makeBookmark('ok-1'),
        makeBookmark('managed-1'),
        makeBookmark('gone-1'),
      ],
      '批量清理',
      bookmarksApi,
    );

    expect(res.deletedIds).toEqual(['ok-1']);
    expect(res.failedIds).toEqual(['managed-1']);
    expect(res.missingIds).toEqual(['gone-1']);
    expect(res.createdEntries.map((e) => e.originalId)).toEqual(['ok-1']);
    const saved = (storageMap.get('bcp_recycle_bin') as RecycleBinEntry[]) ?? [];
    expect(saved.map((e) => e.originalId)).toEqual(['ok-1']);
  });

  it('preserves full ancestor path and rootId when deleting a nested folder and restores to the exact nested location', async () => {
    const nodesById = new Map<string, Partial<chrome.bookmarks.BookmarkTreeNode>>([
      ['2', { id: '2', parentId: '0', title: '其他书签' }],
      ['archive', { id: 'archive', parentId: '2', title: '归档' }],
      [
        'project',
        {
          id: 'project',
          parentId: 'archive',
          title: '项目',
          children: [
            {
              id: 'b-nested',
              parentId: 'project',
              title: 'Spec',
              url: 'https://example.com/spec',
              syncing: false,
            },
          ],
        },
      ],
    ]);

    const createdNodes: chrome.bookmarks.CreateDetails[] = [];
    let nextId = 800;
    const bookmarksApi = {
      getSubTree: vi.fn(async (id: string) => {
        const node = nodesById.get(id);
        return node ? [node] : [];
      }),
      get: vi.fn(async (id: string) => {
        const node = nodesById.get(id);
        if (!node) throw new Error('Not found');
        return [node];
      }),
      getChildren: vi.fn(async () => []),
      remove: vi.fn(async (id: string) => {
        nodesById.delete(id);
      }),
      create: vi.fn(async (details: chrome.bookmarks.CreateDetails) => {
        createdNodes.push(details);
        const created = {
          id: String(nextId++),
          parentId: details.parentId,
          title: details.title ?? '',
          url: details.url,
        };
        nodesById.set(created.id, created);
        return created;
      }),
    } as unknown as typeof chrome.bookmarks;

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storageMap.get(key) })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) storageMap.set(k, v);
          }),
        },
      },
      bookmarks: bookmarksApi,
    });

    await safeDeleteFolderTree('project', '删除文件夹', bookmarksApi);
    // Simulate archive folder also removed later
    nodesById.delete('archive');

    const saved = (storageMap.get('bcp_recycle_bin') as RecycleBinEntry[]) ?? [];
    expect(saved).toHaveLength(1);
    expect(saved[0].folderPath).toEqual(['其他书签', '归档', '项目']);
    expect(saved[0].rootId).toBe('2');

    await restoreRecycleBinEntry(saved[0], bookmarksApi);
    expect(createdNodes).toEqual([
      { parentId: '2', title: '归档' },
      { parentId: '800', title: '项目' },
      { parentId: '801', title: 'Spec', url: 'https://example.com/spec' },
    ]);
  });

  it('removes selected recycle bin entries permanently without affecting remaining entries', async () => {
    const initial: RecycleBinEntry[] = [
      {
        id: 'rb-keep',
        originalId: '1',
        title: 'Keep',
        url: 'https://example.com/keep',
        folderPath: ['书签栏'],
        parentId: '1',
        deletedAt: 1000,
        reason: '404',
      },
      {
        id: 'rb-del',
        originalId: '2',
        title: 'Delete',
        url: 'https://example.com/del',
        folderPath: ['书签栏'],
        parentId: '1',
        deletedAt: 2000,
        reason: '404',
      },
    ];
    storageMap.set('bcp_recycle_bin', initial);

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storageMap.get(key) })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) storageMap.set(k, v);
          }),
        },
      },
    });

    const remaining = await removeRecycleBinEntries(['rb-del']);
    expect(remaining.map((e) => e.id)).toEqual(['rb-keep']);
    expect(
      ((storageMap.get('bcp_recycle_bin') as RecycleBinEntry[]) ?? []).map((e) => e.id),
    ).toEqual(['rb-keep']);
  });
});
