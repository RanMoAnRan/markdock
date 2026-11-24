import { describe, expect, it } from 'vitest';
import {
  computeSafeRemovableDuplicates,
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

  it('preserves SPA hash routes (#/... and #!/...) so distinct app pages are not merged', () => {
    const items = [
      makeBookmark('s1', 'https://app.example.com/#/settings', 1000),
      makeBookmark('s2', 'https://app.example.com/#/profile', 2000),
      makeBookmark('s3', 'https://app.example.com/#!/dashboard', 3000),
      makeBookmark('s4', 'https://app.example.com/#!/billing', 4000),
    ];

    expect(findDuplicateGroups(items, 'normalized')).toEqual([]);
    expect(normalizeUrl('https://app.example.com/#/settings?utm_source=x')).toBe(
      'https://app.example.com/#/settings?utm_source=x',
    );
  });

  it('never deletes the last remaining copy when the originally kept bookmark was removed externally', () => {
    // Originally two copies existed: b2 (kept) and b1 (planned for removal).
    // Before confirmation, b2 was deleted externally, leaving only b1 live.
    const liveAfterExternalDelete = [
      makeBookmark('b1', 'https://example.com/only-left', 1000),
      makeBookmark('c3', 'https://example.com/still-dup', 3000),
      makeBookmark('c2', 'https://example.com/still-dup', 2000),
      makeBookmark('c1', 'https://example.com/still-dup', 1000),
    ];

    const targetKeys = new Set([
      'https://example.com/only-left',
      'https://example.com/still-dup',
    ]);
    const removable = computeSafeRemovableDuplicates(
      liveAfterExternalDelete,
      'exact',
      targetKeys,
    );

    // b1 MUST NOT be deleted because it is now the sole remaining copy
    expect(removable.map((i) => i.id)).toEqual(['c2', 'c1']);
  });

  it('supports oldest-first retention strategy when deduplicating', () => {
    const items = [
      makeBookmark('b2', 'https://example.com/page', 2000),
      makeBookmark('b1', 'https://example.com/page', 1000),
      makeBookmark('b3', 'https://example.com/page', 3000),
    ];

    const groups = findDuplicateGroups(items, 'exact', undefined, 'oldest');
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(['b1', 'b2', 'b3']);

    const removable = computeSafeRemovableDuplicates(
      items,
      'exact',
      undefined,
      undefined,
      'oldest',
    );
    expect(removable.map((i) => i.id)).toEqual(['b2', 'b3']);
  });
});
