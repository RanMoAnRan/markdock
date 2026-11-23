import { describe, expect, it } from 'vitest';
import {
  findDuplicateGroups,
  findMatchingBookmarksByUrl,
  normalizeUrl,
} from '../duplicates';
import type { BookmarkItem } from '../../types/bookmark';

const makeBookmark = (
  id: string,
  url: string,
  dateAdded: number,
  folderPath = ['书签栏'],
): BookmarkItem => ({
  id,
  parentId: '1',
  title: `Item ${id}`,
  url,
  dateAdded,
  folderPath,
});

describe('duplicates detector', () => {
  it('normalizes host case, trailing slash, tracking params, and hash', () => {
    expect(
      normalizeUrl('https://Example.COM/docs/?utm_source=twitter&id=42&fbclid=abc#top'),
    ).toBe('https://example.com/docs?id=42');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
  });

  it('safely returns raw input for malformed URLs without throwing', () => {
    expect(normalizeUrl('not a valid url :::')).toBe('not a valid url :::');
    expect(normalizeUrl('')).toBe('');
  });

  it('groups duplicates in exact mode and sorts newest first', () => {
    const items = [
      makeBookmark('b2', 'https://example.com/page', 2000),
      makeBookmark('b1', 'https://example.com/page', 1000),
      makeBookmark('b3', 'https://example.com/page/', 1500),
      makeBookmark('b4', 'https://unique.org', 500),
    ];

    const groups = findDuplicateGroups(items, 'exact');
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(['b2', 'b1']);
  });

  it('groups normalized duplicates across tracking params and trailing slashes, newest first', () => {
    const items = [
      makeBookmark('b1', 'https://Example.com/post/?utm_medium=social#sec', 3000),
      makeBookmark('b2', 'https://example.com/post', 1000),
      makeBookmark('b3', 'https://example.com/post/?spm=123', 2000),
    ];

    const groups = findDuplicateGroups(items, 'normalized');
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(['b1', 'b3', 'b2']);
  });

  it('finds existing bookmarks matching a normalized URL for duplicate-save alerts', () => {
    const items = [
      makeBookmark('b1', 'https://example.com/docs', 1000, ['书签栏', '开发工具']),
      makeBookmark('b2', 'https://example.com/docs/?utm_source=x#intro', 3000, [
        '书签栏',
        '常用',
      ]),
      makeBookmark('b3', 'https://other.dev', 2000, ['书签栏']),
    ];

    const matches = findMatchingBookmarksByUrl(
      items,
      'https://Example.COM/docs/?fbclid=123#top',
    );
    expect(matches.map((m) => m.id)).toEqual(['b2', 'b1']);

    expect(findMatchingBookmarksByUrl(items, '')).toEqual([]);
    expect(findMatchingBookmarksByUrl(items, 'not-a-url')).toEqual([]);
  });
});
