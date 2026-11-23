import { describe, expect, it } from 'vitest';
import { highlightSegments, searchBookmarks } from '../search';
import type { BookmarkItem } from '../../types/bookmark';

const items: BookmarkItem[] = [
  {
    id: '1',
    parentId: '10',
    title: 'React Official Docs',
    url: 'https://react.dev/learn',
    folderPath: ['书签栏', '前端开发'],
  },
  {
    id: '2',
    parentId: '10',
    title: 'GitHub - facebook/react',
    url: 'https://github.com/facebook/react',
    folderPath: ['书签栏', '开源项目'],
  },
  {
    id: '3',
    parentId: '11',
    title: 'MDN Web Docs',
    url: 'https://developer.mozilla.org',
    folderPath: ['书签栏', '前端开发'],
  },
];

describe('bookmark multi-keyword search', () => {
  it('matches all space-separated tokens across title, url, and folderPath and ranks title prefix higher', () => {
    const res1 = searchBookmarks(items, 'react');
    expect(res1.map((b) => b.id)).toEqual(['1', '2']);

    const res2 = searchBookmarks(items, '前端 mdn');
    expect(res2.map((b) => b.id)).toEqual(['3']);

    const res3 = searchBookmarks(items, 'github react');
    expect(res3.map((b) => b.id)).toEqual(['2']);
  });

  it('returns empty array when query is empty or has no matches', () => {
    expect(searchBookmarks(items, '   ')).toEqual([]);
    expect(searchBookmarks(items, 'nonexistent-xyz')).toEqual([]);
  });

  it('splits text into highlighted and non-highlighted segments', () => {
    const segments = highlightSegments('React Official Docs', 'react docs');
    expect(segments).toEqual([
      { text: 'React', match: true },
      { text: ' Official ', match: false },
      { text: 'Docs', match: true },
    ]);
  });

  it('matches Chinese titles and folder paths by full pinyin and initials', () => {
    const cnItems: BookmarkItem[] = [
      ...items,
      {
        id: '4',
        parentId: '12',
        title: '开发工具合集',
        url: 'https://tools.example.com',
        folderPath: ['书签栏', '效率软件'],
      },
      {
        id: '5',
        parentId: '12',
        title: 'Vue 官方文档',
        url: 'https://cn.vuejs.org',
        folderPath: ['书签栏', '前端开发'],
      },
    ];

    expect(searchBookmarks(cnItems, 'kf').map((b) => b.id)).toContain('4');
    expect(searchBookmarks(cnItems, 'kaifa').map((b) => b.id)[0]).toBe('4');
    expect(searchBookmarks(cnItems, 'kfgj').map((b) => b.id)).toEqual(['4']);
    expect(searchBookmarks(cnItems, 'qdkf vue').map((b) => b.id)).toEqual(['5']);
    expect(searchBookmarks(cnItems, 'xlrj').map((b) => b.id)).toEqual(['4']);
  });

  it('highlights Chinese characters matched by pinyin initials and full pinyin', () => {
    expect(highlightSegments('开发工具合集', 'kf')).toEqual([
      { text: '开发', match: true },
      { text: '工具合集', match: false },
    ]);
    expect(highlightSegments('开发工具合集', 'kaifagongju')).toEqual([
      { text: '开发工具', match: true },
      { text: '合集', match: false },
    ]);
    expect(highlightSegments('C++ [指南]', 'c++')).toEqual([
      { text: 'C++', match: true },
      { text: ' [指南]', match: false },
    ]);
  });
});
