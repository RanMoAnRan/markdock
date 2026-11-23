import type { WhitelistEntry } from '../types/bookmark';

export function createWhitelistEntry(
  pattern: string,
  matchType: 'url' | 'domain',
): WhitelistEntry {
  const cleaned =
    matchType === 'domain'
      ? pattern
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, '')
      : pattern.trim();

  return {
    id: `${matchType}:${cleaned}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    pattern: cleaned,
    matchType,
    addedAt: Date.now(),
  };
}

export function isWhitelisted(url: string, entries: WhitelistEntry[]): boolean {
  if (!url || entries.length === 0) return false;

  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    // Malformed URL can only match exact string pattern
  }

  for (const entry of entries) {
    if (entry.matchType === 'url') {
      if (url === entry.pattern) return true;
    } else if (hostname && entry.pattern) {
      const target = entry.pattern.toLowerCase();
      if (hostname === target || hostname.endsWith(`.${target}`)) {
        return true;
      }
    }
  }

  return false;
}
