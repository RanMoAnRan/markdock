import { describe, expect, it } from 'vitest';
import {
  createWhitelistEntry,
  isWhitelisted,
  normalizeWhitelistPattern,
} from '../whitelist';

describe('whitelist matcher', () => {
  it('matches exact URL entries', () => {
    const entries = [createWhitelistEntry('https://example.com/private', 'url')];
    expect(isWhitelisted('https://example.com/private', entries)).toBe(true);
    expect(isWhitelisted('https://example.com/other', entries)).toBe(false);
  });

  it('matches domain entries including subdomains', () => {
    const entries = [createWhitelistEntry('internal.corp', 'domain')];
    expect(isWhitelisted('https://internal.corp/dashboard', entries)).toBe(true);
    expect(isWhitelisted('https://docs.internal.corp/api', entries)).toBe(true);
    expect(isWhitelisted('https://notinternal.corp', entries)).toBe(false);
  });

  it('normalizes domain entries with ports, paths, queries, and leading dots', () => {
    expect(
      normalizeWhitelistPattern('https://Example.COM:8443/login?next=1#top', 'domain'),
    ).toBe('example.com');
    expect(normalizeWhitelistPattern('.sub.example.com:3000/', 'domain')).toBe(
      'sub.example.com',
    );
    expect(normalizeWhitelistPattern('https://', 'domain')).toBe('');

    const entry = createWhitelistEntry('https://Example.com:8080/admin', 'domain');
    expect(entry.pattern).toBe('example.com');
    expect(isWhitelisted('https://example.com/app', [entry])).toBe(true);
  });

  it('handles malformed URLs safely without throwing', () => {
    const entries = [createWhitelistEntry('example.com', 'domain')];
    expect(isWhitelisted('javascript:void(0)', entries)).toBe(false);
    expect(isWhitelisted('not-a-url', entries)).toBe(false);
  });
});
