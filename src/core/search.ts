import PinyinMatch from 'pinyin-match';
import type { BookmarkItem } from '../types/bookmark';

export interface TextSegment {
  text: string;
  match: boolean;
}

function tokenize(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function matchPinyinRange(
  text: string,
  token: string,
): [number, number] | null {
  if (!text || !token) return null;
  try {
    const result = PinyinMatch.match(text, token);
    if (Array.isArray(result) && result.length === 2) {
      return [result[0], result[1]];
    }
  } catch {
    // Ignore malformed input in pinyin matcher
  }
  return null;
}

export function searchBookmarks(
  bookmarks: BookmarkItem[],
  query: string,
  limit = 100,
): BookmarkItem[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored: Array<{ item: BookmarkItem; score: number }> = [];

  for (const item of bookmarks) {
    const titleLower = item.title.toLowerCase();
    const urlLower = item.url.toLowerCase();
    const pathText = item.folderPath.join(' / ');
    const pathLower = pathText.toLowerCase();

    let totalScore = 0;
    let allMatched = true;

    for (const token of tokens) {
      let tokenScore = 0;
      if (titleLower.startsWith(token)) {
        tokenScore = 100;
      } else if (titleLower.includes(token)) {
        tokenScore = 60;
      } else {
        const titlePinyin = matchPinyinRange(item.title, token);
        if (titlePinyin) {
          tokenScore = titlePinyin[0] === 0 ? 55 : 45;
        } else if (urlLower.includes(token)) {
          tokenScore = 30;
        } else if (pathLower.includes(token)) {
          tokenScore = 15;
        } else if (matchPinyinRange(pathText, token)) {
          tokenScore = 12;
        } else {
          allMatched = false;
          break;
        }
      }
      totalScore += tokenScore;
    }

    if (allMatched) {
      scored.push({ item, score: totalScore });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.item.dateAdded ?? 0) - (a.item.dateAdded ?? 0);
  });

  return scored.slice(0, limit).map((s) => s.item);
}

export function highlightSegments(text: string, query: string): TextSegment[] {
  const tokens = tokenize(query);
  if (!text || tokens.length === 0) {
    return [{ text, match: false }];
  }

  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];

  for (const token of tokens) {
    let foundLiteral = false;
    let searchFrom = 0;
    while (searchFrom < lower.length) {
      const idx = lower.indexOf(token, searchFrom);
      if (idx === -1) break;
      foundLiteral = true;
      ranges.push([idx, idx + token.length]);
      searchFrom = idx + token.length;
    }

    if (!foundLiteral) {
      const pyRange = matchPinyinRange(text, token);
      if (pyRange) {
        ranges.push([pyRange[0], pyRange[1] + 1]);
      }
    }
  }

  if (ranges.length === 0) {
    return [{ text, match: false }];
  }

  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of ranges) {
    const clampedStart = Math.max(0, start);
    const clampedEnd = Math.min(text.length, end);
    if (clampedStart >= clampedEnd) continue;
    const last = merged[merged.length - 1];
    if (last && clampedStart <= last[1]) {
      last[1] = Math.max(last[1], clampedEnd);
    } else {
      merged.push([clampedStart, clampedEnd]);
    }
  }

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (cursor < start) {
      segments.push({ text: text.slice(cursor, start), match: false });
    }
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }

  return segments;
}
