import { describe, expect, it } from 'vitest';
import { findEmptyFolders } from '../folders';

describe('empty folders detector', () => {
  it('finds leaf empty folders and parent folders containing only empty subfolders, deepest first, excluding roots', () => {
    const tree = [
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
                title: '非空目录',
                syncing: false,
                children: [
                  {
                    id: '100',
                    parentId: '10',
                    title: 'Link',
                    url: 'https://example.com',
                    syncing: false,
                  },
                ],
              },
              {
                id: '20',
                parentId: '1',
                title: '外层空目录',
                syncing: false,
                children: [
                  {
                    id: '21',
                    parentId: '20',
                    title: '内层空目录',
                    syncing: false,
                    children: [],
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
            children: [],
          },
        ],
      },
    ] as chrome.bookmarks.BookmarkTreeNode[];

    const empty = findEmptyFolders(tree);
    expect(empty.map((f) => ({ id: f.id, path: f.path, depth: f.depth }))).toEqual([
      { id: '21', path: ['书签栏', '外层空目录', '内层空目录'], depth: 3 },
      { id: '20', path: ['书签栏', '外层空目录'], depth: 2 },
    ]);
  });

  it('protects Edge Workspaces root & its workspace subfolders as well as any direct child of root 0 or unmodifiable folders', () => {
    const tree = [
      {
        id: '0',
        title: '',
        syncing: false,
        children: [
          {
            id: '4',
            parentId: '0',
            title: '工作区',
            syncing: false,
            children: [
              {
                id: '41',
                parentId: '4',
                title: '工作区 1',
                syncing: false,
                children: [],
              },
            ],
          },
          {
            id: '5',
            parentId: '0',
            title: 'Managed Bookmarks',
            unmodifiable: 'managed',
            syncing: false,
            children: [
              {
                id: '51',
                parentId: '5',
                title: 'Empty Managed Sub',
                unmodifiable: 'managed',
                syncing: false,
                children: [],
              },
            ],
          },
        ],
      },
    ] as chrome.bookmarks.BookmarkTreeNode[];

    expect(findEmptyFolders(tree)).toEqual([]);
  });
});
