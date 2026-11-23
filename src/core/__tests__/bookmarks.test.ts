import { describe, expect, it } from 'vitest';
import {
  computeBookmarkMoveTarget,
  extractFolders,
  filterBookmarksByFolder,
  flattenBookmarkTree,
  getAncestorFolderIds,
  isDescendantNode,
  reorderIdList,
} from '../bookmarks';

const sampleTree = [
  {
    id: '0',
    title: '',
    syncing: false,
    children: [
      {
        id: '1',
        parentId: '0',
        title: '书签栏',
        syncing: false,
        children: [
          {
            id: '10',
            parentId: '1',
            title: 'GitHub',
            url: 'https://github.com',
            dateAdded: 1000,
            syncing: false,
          },
          {
            id: '11',
            parentId: '1',
            title: '开发工具',
            syncing: false,
            children: [
              {
                id: '111',
                parentId: '11',
                title: 'MDN',
                url: 'https://developer.mozilla.org',
                dateAdded: 2000,
                syncing: false,
              },
            ],
          },
        ],
      },
      {
        id: '2',
        parentId: '0',
        title: '其他书签',
        syncing: false,
        children: [
          {
            id: '20',
            parentId: '2',
            title: 'Docs',
            url: 'https://example.com/docs',
            dateAdded: 3000,
            syncing: false,
          },
        ],
      },
    ],
  },
] as chrome.bookmarks.BookmarkTreeNode[];

describe('bookmarks tree utilities', () => {
  it('flattens bookmark tree with folder paths excluding root node 0', () => {
    const items = flattenBookmarkTree(sampleTree);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      id: '10',
      parentId: '1',
      title: 'GitHub',
      url: 'https://github.com',
      folderPath: ['书签栏'],
    });
    expect(items[1]).toMatchObject({
      id: '111',
      parentId: '11',
      title: 'MDN',
      folderPath: ['书签栏', '开发工具'],
    });
    expect(items[2]).toMatchObject({
      id: '20',
      parentId: '2',
      folderPath: ['其他书签'],
    });
  });

  it('extracts selectable folders with recursive bookmark counts', () => {
    const folders = extractFolders(sampleTree);
    expect(folders.map((f) => ({ id: f.id, count: f.bookmarkCount, path: f.path }))).toEqual([
      { id: '1', count: 2, path: ['书签栏'] },
      { id: '11', count: 1, path: ['书签栏', '开发工具'] },
      { id: '2', count: 1, path: ['其他书签'] },
    ]);
  });

  it('filters bookmarks by folder id including nested descendants', () => {
    const all = flattenBookmarkTree(sampleTree);
    expect(filterBookmarksByFolder(all, sampleTree, 'all')).toHaveLength(3);
    expect(filterBookmarksByFolder(all, sampleTree, '1').map((b) => b.id)).toEqual(['10', '111']);
    expect(filterBookmarksByFolder(all, sampleTree, '11').map((b) => b.id)).toEqual(['111']);
  });
});

const reorderTree = [
  {
    id: '0',
    title: '',
    syncing: false,
    children: [
      {
        id: '1',
        parentId: '0',
        title: '书签栏',
        syncing: false,
        children: [
          {
            id: '10',
            parentId: '1',
            title: 'GitHub',
            url: 'https://github.com',
            syncing: false,
          },
          {
            id: '11',
            parentId: '1',
            title: '开发工具',
            syncing: false,
            children: [
              {
                id: '111',
                parentId: '11',
                title: 'MDN',
                url: 'https://developer.mozilla.org',
                syncing: false,
              },
              {
                id: '112',
                parentId: '11',
                title: '子目录',
                syncing: false,
                children: [],
              },
            ],
          },
          {
            id: '12',
            parentId: '1',
            title: 'Google',
            url: 'https://google.com',
            syncing: false,
          },
        ],
      },
      {
        id: '2',
        parentId: '0',
        title: '其他书签',
        syncing: false,
        children: [
          {
            id: '20',
            parentId: '2',
            title: 'Docs',
            url: 'https://example.com/docs',
            syncing: false,
          },
        ],
      },
    ],
  },
] as chrome.bookmarks.BookmarkTreeNode[];

describe('drag-and-drop reorder utilities', () => {
  it('computes same-parent move upward and downward using pre-removal slot indices', () => {
    expect(computeBookmarkMoveTarget(reorderTree, '12', '10', 'before')).toEqual({
      parentId: '1',
      index: 0,
    });
    expect(computeBookmarkMoveTarget(reorderTree, '12', '10', 'after')).toEqual({
      parentId: '1',
      index: 1,
    });
    expect(computeBookmarkMoveTarget(reorderTree, '10', '11', 'after')).toEqual({
      parentId: '1',
      index: 2,
    });
    expect(computeBookmarkMoveTarget(reorderTree, '10', '12', 'after')).toEqual({
      parentId: '1',
      index: 3,
    });
  });

  it('returns null for same-parent no-op drops and self drops', () => {
    expect(computeBookmarkMoveTarget(reorderTree, '10', '10', 'before')).toBeNull();
    expect(computeBookmarkMoveTarget(reorderTree, '10', '11', 'before')).toBeNull();
    expect(computeBookmarkMoveTarget(reorderTree, '11', '10', 'after')).toBeNull();
  });

  it('computes cross-parent before, after, and inside targets', () => {
    expect(computeBookmarkMoveTarget(reorderTree, '20', '10', 'before')).toEqual({
      parentId: '1',
      index: 0,
    });
    expect(computeBookmarkMoveTarget(reorderTree, '20', '11', 'after')).toEqual({
      parentId: '1',
      index: 2,
    });
    expect(computeBookmarkMoveTarget(reorderTree, '20', '11', 'inside')).toEqual({
      parentId: '11',
    });
  });

  it('prevents dropping a folder into itself or its descendants, and blocks before/after on root containers', () => {
    expect(isDescendantNode(reorderTree, '11', '111')).toBe(true);
    expect(isDescendantNode(reorderTree, '11', '20')).toBe(false);
    expect(computeBookmarkMoveTarget(reorderTree, '11', '11', 'inside')).toBeNull();
    expect(computeBookmarkMoveTarget(reorderTree, '11', '111', 'before')).toBeNull();
    expect(computeBookmarkMoveTarget(reorderTree, '11', '112', 'inside')).toBeNull();
    expect(computeBookmarkMoveTarget(reorderTree, '10', '1', 'before')).toBeNull();
    expect(computeBookmarkMoveTarget(reorderTree, '10', '2', 'after')).toBeNull();
    expect(computeBookmarkMoveTarget(reorderTree, '10', '2', 'inside')).toEqual({
      parentId: '2',
    });
  });

  it('reorders pinned id lists cleanly and returns null on no-op', () => {
    expect(reorderIdList(['a', 'b', 'c'], 'c', 'a', 'before')).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(reorderIdList(['a', 'b', 'c'], 'a', 'b', 'after')).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(reorderIdList(['a', 'b', 'c'], 'a', 'c', 'after')).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(reorderIdList(['a', 'b', 'c'], 'a', 'b', 'before')).toBeNull();
    expect(reorderIdList(['a', 'b', 'c'], 'a', 'a', 'after')).toBeNull();
  });

  it('returns ancestor folder ids excluding root 0 for nested folder and bookmark locating', () => {
    expect(getAncestorFolderIds(reorderTree, '112')).toEqual(['1', '11']);
    expect(getAncestorFolderIds(reorderTree, '111')).toEqual(['1', '11']);
    expect(getAncestorFolderIds(reorderTree, '11')).toEqual(['1']);
    expect(getAncestorFolderIds(reorderTree, '1')).toEqual([]);
    expect(getAncestorFolderIds(reorderTree, 'missing')).toEqual([]);
  });
});
