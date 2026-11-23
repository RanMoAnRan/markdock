import { describe, expect, it } from 'vitest';
import { createWhitelistEntry, isWhitelisted } from '../whitelist';

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

  it('handles malformed URLs safely without throwing', () => {
    const entries = [createWhitelistEntry('example.com', 'domain')];
    expect(isWhitelisted('javascript:void(0)', entries)).toBe(false);
    expect(isWhitelisted('not-a-url', entries)).toBe(false);
  });
});
