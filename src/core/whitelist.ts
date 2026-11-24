import type { WhitelistEntry } from '../types/bookmark';

export function normalizeWhitelistPattern(
  pattern: string,
  matchType: 'url' | 'domain',
): string {
  const trimmed = pattern.trim();
  if (!trimmed) return '';
  if (matchType === 'url') {
    return trimmed;
  }

  let candidate = trimmed
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^\.+/, '');
  if (!candidate) return '';

  try {
    const parsed = new URL(`http://${candidate}`);
    return parsed.hostname.toLowerCase().replace(/^\.+|\.+$/g, '');
  } catch {
    return candidate
      .replace(/[/?#].*$/, '')
      .replace(/:\d+$/, '')
      .replace(/^\.+|\.+$/g, '');
  }
}

export function createWhitelistEntry(
  pattern: string,
  matchType: 'url' | 'domain',
): WhitelistEntry {
  const cleaned = normalizeWhitelistPattern(pattern, matchType);

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
    if (!entry.pattern) continue;
    if (entry.matchType === 'url') {
      if (url === entry.pattern) return true;
    } else if (hostname) {
      const target = normalizeWhitelistPattern(entry.pattern, 'domain');
      if (target && (hostname === target || hostname.endsWith(`.${target}`))) {
        return true;
      }
    }
  }

  return false;
}
