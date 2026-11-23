import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SCAN_SETTINGS,
  ScanRunner,
  checkSingleBookmark,
  classifyResponse,
  shouldSkipUrl,
} from '../checker';
import { createWhitelistEntry } from '../whitelist';
import type { BookmarkItem, ScanSettings } from '../../types/bookmark';

const makeBookmark = (id: string, url: string): BookmarkItem => ({
  id,
  parentId: '1',
  title: `Bookmark ${id}`,
  url,
  folderPath: ['书签栏'],
});

describe('shouldSkipUrl', () => {
  it('skips non-http(s), malformed, local/private, logout, and whitelisted URLs', () => {
    const whitelist = [createWhitelistEntry('trusted.example.com', 'domain')];
    expect(shouldSkipUrl('chrome://extensions', DEFAULT_SCAN_SETTINGS, whitelist).skip).toBe(true);
    expect(shouldSkipUrl('edge://settings', DEFAULT_SCAN_SETTINGS, whitelist).skip).toBe(true);
    expect(shouldSkipUrl('javascript:void(0)', DEFAULT_SCAN_SETTINGS, whitelist).skip).toBe(true);
    expect(shouldSkipUrl('file:///Users/test.html', DEFAULT_SCAN_SETTINGS, whitelist).skip).toBe(true);
    expect(shouldSkipUrl('bad:::url', DEFAULT_SCAN_SETTINGS, whitelist).skip).toBe(true);
    expect(shouldSkipUrl('http://localhost:3000/app', DEFAULT_SCAN_SETTINGS, whitelist).skip).toBe(true);
    expect(shouldSkipUrl('http://127.0.0.1:8080', DEFAULT_SCAN_SETTINGS, whitelist).skip).toBe(true);
    expect(shouldSkipUrl('http://192.168.1.10/admin', DEFAULT_SCAN_SETTINGS, whitelist).skip).toBe(true);
    expect(shouldSkipUrl('https://site.com/logout', DEFAULT_SCAN_SETTINGS, whitelist).skip).toBe(true);
    expect(shouldSkipUrl('https://site.com/auth/sign-out', DEFAULT_SCAN_SETTINGS, whitelist).skip).toBe(true);
    expect(shouldSkipUrl('https://trusted.example.com/a', DEFAULT_SCAN_SETTINGS, whitelist).skip).toBe(true);

    expect(shouldSkipUrl('https://github.com/openai', DEFAULT_SCAN_SETTINGS, whitelist).skip).toBe(false);
    expect(
      shouldSkipUrl('http://localhost:3000', { ...DEFAULT_SCAN_SETTINGS, skipLocal: false }, []).skip,
    ).toBe(false);
  });
});

describe('classifyResponse', () => {
  it('classifies Cloudflare challenge header as restricted bot_challenge', () => {
    const res = classifyResponse({
      originalUrl: 'https://cf-site.com',
      finalUrl: 'https://cf-site.com',
      redirected: false,
      status: 403,
      headers: new Headers({ 'cf-mitigated': 'challenge', server: 'cloudflare' }),
    });
    expect(res.status).toBe('restricted');
    expect(res.restrictedSubType).toBe('bot_challenge');
  });

  it('classifies CAPTCHA / Turnstile HTML snippet as restricted bot_challenge even on 200 or 503', () => {
    const res = classifyResponse({
      originalUrl: 'https://protected.com',
      finalUrl: 'https://protected.com',
      redirected: false,
      status: 503,
      headers: new Headers(),
      bodySnippet: '<html><title>Just a moment...</title><div class="cf-turnstile"></div></html>',
    });
    expect(res.status).toBe('restricted');
    expect(res.restrictedSubType).toBe('bot_challenge');
  });

  it('classifies 401/403/429 and login redirects as restricted auth_required', () => {
    expect(
      classifyResponse({
        originalUrl: 'https://a.com',
        finalUrl: 'https://a.com',
        redirected: false,
        status: 403,
        headers: new Headers(),
      }),
    ).toMatchObject({ status: 'restricted', restrictedSubType: 'auth_required' });

    expect(
      classifyResponse({
        originalUrl: 'https://app.com/dashboard',
        finalUrl: 'https://app.com/login?next=/dashboard',
        redirected: true,
        status: 200,
        headers: new Headers(),
      }),
    ).toMatchObject({ status: 'restricted', restrictedSubType: 'auth_required' });
  });

  it('classifies 404/410 as dead_404, 5xx as server_5xx, and 451 as client_4xx', () => {
    expect(
      classifyResponse({
        originalUrl: 'https://a.com/missing',
        finalUrl: 'https://a.com/missing',
        redirected: false,
        status: 404,
        headers: new Headers(),
      }).status,
    ).toBe('dead_404');

    expect(
      classifyResponse({
        originalUrl: 'https://a.com/err',
        finalUrl: 'https://a.com/err',
        redirected: false,
        status: 502,
        headers: new Headers(),
      }).status,
    ).toBe('server_5xx');

    expect(
      classifyResponse({
        originalUrl: 'https://a.com/legal',
        finalUrl: 'https://a.com/legal',
        redirected: false,
        status: 451,
        headers: new Headers(),
      }).status,
    ).toBe('client_4xx');
  });

  it('classifies meaningful redirects with subtype and ignores trivial trailing slash redirect', () => {
    expect(
      classifyResponse({
        originalUrl: 'http://example.com/docs',
        finalUrl: 'https://example.com/docs',
        redirected: true,
        status: 200,
        headers: new Headers(),
      }),
    ).toMatchObject({ status: 'redirect', redirectSubType: 'http_to_https' });

    expect(
      classifyResponse({
        originalUrl: 'https://old.com/a',
        finalUrl: 'https://new.com/b',
        redirected: true,
        status: 200,
        headers: new Headers(),
      }),
    ).toMatchObject({ status: 'redirect', redirectSubType: 'cross_origin' });

    expect(
      classifyResponse({
        originalUrl: 'https://example.com/docs',
        finalUrl: 'https://example.com/docs/',
        redirected: true,
        status: 200,
        headers: new Headers(),
      }).status,
    ).toBe('valid');
  });
});

describe('checkSingleBookmark & ScanRunner', () => {
  it('uses credentials according to settings and avoids GET on clean HEAD 200', async () => {
    const mockFetch = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    const res = await checkSingleBookmark(
      makeBookmark('1', 'https://clean.example.com'),
      { ...DEFAULT_SCAN_SETTINGS, includeCredentials: true },
      [],
      mockFetch,
    );

    expect(res.status).toBe('valid');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1]?.method).toBe('HEAD');
    expect(mockFetch.mock.calls[0][1]?.credentials).toBe('include');
  });

  it('falls back to GET with capped 16KB stream read without misclassifying intentional abort', async () => {
    const bigChunk = new TextEncoder().encode('<html><title>Just a moment...</title>' + 'a'.repeat(20000));
    let pullCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount++;
        if (pullCount === 1) {
          controller.enqueue(bigChunk);
        } else {
          controller.close();
        }
      },
    });

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(stream, { status: 403, headers: { 'content-type': 'text/html' } }));

    const res = await checkSingleBookmark(
      makeBookmark('2', 'https://waf.example.com'),
      DEFAULT_SCAN_SETTINGS,
      [],
      mockFetch as unknown as typeof fetch,
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(res.status).toBe('restricted');
    expect(res.restrictedSubType).toBe('bot_challenge');
  });

  it('classifies timeout vs network error accurately', async () => {
    const slowFetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new DOMException('Aborted', 'AbortError');
            reject(err);
          });
        }),
    );

    const fastTimeout: ScanSettings = { ...DEFAULT_SCAN_SETTINGS, timeoutSeconds: 0.05 };
    const timeoutRes = await checkSingleBookmark(
      makeBookmark('3', 'https://slow.example.com'),
      fastTimeout,
      [],
      slowFetch as unknown as typeof fetch,
    );
    expect(timeoutRes.status).toBe('timeout');

    const failFetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const dnsRes = await checkSingleBookmark(
      makeBookmark('4', 'https://nonexistent.invalid'),
      DEFAULT_SCAN_SETTINGS,
      [],
      failFetch as unknown as typeof fetch,
    );
    expect(dnsRes.status).toBe('dns_network');
  });

  it('falls back to GET when HEAD throws a network error (e.g. server resets HEAD)', async () => {
    const mockFetch = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === 'HEAD') {
        throw new TypeError('Failed to fetch');
      }
      return new Response('<html><title>OK</title></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    });

    const res = await checkSingleBookmark(
      makeBookmark('5', 'https://drops-head.example.com'),
      DEFAULT_SCAN_SETTINGS,
      [],
      mockFetch,
    );
    expect(res.status).toBe('valid');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to credentials omit when include fails, and to no-cors probe before marking dns_network', async () => {
    const omitOkFetch = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.credentials === 'include') {
        throw new TypeError('Failed to fetch');
      }
      return new Response('ok', { status: 200 });
    });

    const res1 = await checkSingleBookmark(
      makeBookmark('6', 'https://strict-cors.example.com'),
      { ...DEFAULT_SCAN_SETTINGS, includeCredentials: true },
      [],
      omitOkFetch,
    );
    expect(res1.status).toBe('valid');

    const noCorsOkFetch = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.mode === 'no-cors') {
        return { type: 'opaque', status: 0, ok: false, redirected: false, url: '', headers: new Headers() } as Response;
      }
      throw new TypeError('Failed to fetch');
    });

    const res2 = await checkSingleBookmark(
      makeBookmark('7', 'https://origin-blocked.example.com'),
      DEFAULT_SCAN_SETTINGS,
      [],
      noCorsOkFetch,
    );
    expect(res2.status).toBe('restricted');
  });

  it('ScanRunner respects concurrency limit and completes all items', async () => {
    let active = 0;
    let maxActive = 0;
    const mockFetch = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return new Response(null, { status: 200 });
    });

    const items = Array.from({ length: 6 }, (_, i) =>
      makeBookmark(String(i), `https://site-${i}.example.com`),
    );
    const results: string[] = [];
    const runner = new ScanRunner(mockFetch as unknown as typeof fetch);

    await runner.start(
      items,
      { ...DEFAULT_SCAN_SETTINGS, concurrency: 2 },
      [],
      (result) => {
        results.push(result.bookmark.id);
      },
    );

    expect(results).toHaveLength(6);
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(runner.getState()).toBe('completed');
  });
});
