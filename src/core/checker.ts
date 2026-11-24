import type {
  BookmarkItem,
  CheckResult,
  RedirectSubType,
  ScanSettings,
  WhitelistEntry,
} from '../types/bookmark';
import { isWhitelisted } from './whitelist';

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  concurrency: 8,
  timeoutSeconds: 10,
  skipLocal: true,
  includeCredentials: true,
};

const MAX_SNIPPET_BYTES = 16 * 1024;

const LOGOUT_PATH_REGEX = /\/(logout|signout|sign-out|logoff)(\/|$|\?)/i;

const LOGIN_PATH_REGEX =
  /\/(login|signin|sign-in|auth|passport|sso|oauth|session\/new|account\/login)(\/|$|\?)/i;

const BOT_HTML_MARKERS = [
  /just a moment\.\.\./i,
  /cf-turnstile/i,
  /challenge-platform/i,
  /g-recaptcha/i,
  /h-captcha/i,
  /attention required!\s*\|\s*cloudflare/i,
  /verify you are human/i,
  /checking your browser/i,
  /人机验证/,
  /安全验证/,
  /行为验证/,
];

function isPrivateOrLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '[::1]' ||
    lower.endsWith('.local')
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  const match172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(lower);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function shouldSkipUrl(
  url: string,
  settings: ScanSettings,
  whitelist: WhitelistEntry[],
): { skip: boolean; reason?: string } {
  if (!url || !url.trim()) {
    return { skip: true, reason: '空链接' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { skip: true, reason: '非标准 URL 格式' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { skip: true, reason: `非网页协议 (${parsed.protocol})` };
  }

  if (settings.skipLocal && isPrivateOrLocalHost(parsed.hostname)) {
    return { skip: true, reason: '本地或内网地址' };
  }

  if (LOGOUT_PATH_REGEX.test(parsed.pathname)) {
    return { skip: true, reason: '跳过登出类链接（防误触发）' };
  }

  if (isWhitelisted(url, whitelist)) {
    return { skip: true, reason: '命中白名单' };
  }

  return { skip: false };
}

function getMeaningfulRedirect(
  originalUrl: string,
  finalUrl: string,
): { meaningful: boolean; subType?: RedirectSubType } {
  if (!finalUrl || originalUrl === finalUrl) {
    return { meaningful: false };
  }

  try {
    const orig = new URL(originalUrl);
    const fin = new URL(finalUrl);

    const origTrimPath = orig.pathname.replace(/\/+$/, '') || '/';
    const finTrimPath = fin.pathname.replace(/\/+$/, '') || '/';

    // Ignore trivial trailing-slash-only differences
    if (
      orig.protocol === fin.protocol &&
      orig.host.toLowerCase() === fin.host.toLowerCase() &&
      origTrimPath === finTrimPath &&
      orig.search === fin.search
    ) {
      return { meaningful: false };
    }

    if (
      orig.protocol === 'http:' &&
      fin.protocol === 'https:' &&
      orig.host.toLowerCase() === fin.host.toLowerCase() &&
      origTrimPath === finTrimPath &&
      orig.search === fin.search
    ) {
      return { meaningful: true, subType: 'http_to_https' };
    }

    if (orig.origin.toLowerCase() === fin.origin.toLowerCase()) {
      return { meaningful: true, subType: 'same_origin' };
    }

    return { meaningful: true, subType: 'cross_origin' };
  } catch {
    return { meaningful: originalUrl !== finalUrl, subType: 'cross_origin' };
  }
}

export function classifyResponse(input: {
  originalUrl: string;
  finalUrl: string;
  redirected: boolean;
  status: number;
  headers: Headers;
  bodySnippet?: string;
}): Omit<CheckResult, 'bookmark' | 'checkedAt'> {
  const { originalUrl, finalUrl, redirected, status, headers, bodySnippet = '' } = input;

  // 1. Bot challenge / WAF / CAPTCHA detection (highest priority)
  const cfMitigated = (headers.get('cf-mitigated') ?? '').toLowerCase();
  const server = (headers.get('server') ?? '').toLowerCase();
  const hasCloudflareChallengeHeader =
    cfMitigated.includes('challenge') ||
    (server.includes('cloudflare') && (status === 403 || status === 503));
  const hasBotHtml =
    bodySnippet.length > 0 &&
    BOT_HTML_MARKERS.some((pattern) => pattern.test(bodySnippet));

  if (hasCloudflareChallengeHeader || hasBotHtml) {
    return {
      status: 'restricted',
      httpStatus: status,
      restrictedSubType: 'bot_challenge',
      finalUrl: redirected ? finalUrl : undefined,
      reason: `触发人机验证 / 反爬防护 (HTTP ${status})`,
    };
  }

  // 2. Auth / Access restricted (401/403/429 or redirected to login page)
  if (status === 401 || status === 403 || status === 429) {
    const label =
      status === 401
        ? '需要登录认证 (HTTP 401)'
        : status === 429
          ? '请求频率受限 (HTTP 429)'
          : '访问受限或防爬拦截 (HTTP 403)';
    return {
      status: 'restricted',
      httpStatus: status,
      restrictedSubType: 'auth_required',
      finalUrl: redirected ? finalUrl : undefined,
      reason: label,
    };
  }

  if (redirected && finalUrl) {
    try {
      const fin = new URL(finalUrl);
      const orig = new URL(originalUrl);
      if (
        LOGIN_PATH_REGEX.test(fin.pathname) &&
        !LOGIN_PATH_REGEX.test(orig.pathname)
      ) {
        return {
          status: 'restricted',
          httpStatus: status,
          restrictedSubType: 'auth_required',
          finalUrl,
          reason: '跳转至登录 / 鉴权页面',
        };
      }
    } catch {
      // Ignore parse failure
    }
  }

  // 3. Confirmed dead (404 / 410)
  if (status === 404 || status === 410) {
    return {
      status: 'dead_404',
      httpStatus: status,
      reason: status === 410 ? '资源已永久移除 (HTTP 410)' : '页面不存在 (HTTP 404)',
    };
  }

  // 4. Server error (5xx)
  if (status >= 500 && status <= 599) {
    return {
      status: 'server_5xx',
      httpStatus: status,
      reason: `服务器错误 (HTTP ${status})`,
    };
  }

  // 5. Other 4xx
  if (status >= 400 && status <= 499) {
    return {
      status: 'client_4xx',
      httpStatus: status,
      reason: `客户端请求异常 (HTTP ${status})`,
    };
  }

  // 6. Meaningful redirect
  if (redirected && finalUrl) {
    const redir = getMeaningfulRedirect(originalUrl, finalUrl);
    if (redir.meaningful && redir.subType) {
      const labelMap: Record<RedirectSubType, string> = {
        http_to_https: 'HTTP → HTTPS 升级跳转',
        same_origin: '同域名路径重定向',
        cross_origin: '跨域名重定向',
      };
      return {
        status: 'redirect',
        httpStatus: status,
        redirectSubType: redir.subType,
        finalUrl,
        reason: labelMap[redir.subType],
      };
    }
  }

  // 7. Valid 2xx
  return {
    status: 'valid',
    httpStatus: status,
    reason: `正常可访问 (HTTP ${status})`,
  };
}

async function readBodySnippet(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let collected = '';
  let bytesRead = 0;

  try {
    while (bytesRead < MAX_SNIPPET_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      bytesRead += value.byteLength;
      collected += decoder.decode(value, { stream: true });
    }
    collected += decoder.decode();
  } catch {
    // Ignore stream cancellation / partial read errors
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore cancel errors
    }
  }
  return collected;
}

function shouldFallbackToGet(response: Response): boolean {
  const status = response.status;
  if (
    status === 400 ||
    status === 403 ||
    status === 404 ||
    status === 405 ||
    status === 410 ||
    status === 501 ||
    status === 503
  ) {
    return true;
  }
  const server = (response.headers.get('server') ?? '').toLowerCase();
  if (server.includes('cloudflare') && status !== 200) {
    return true;
  }
  return false;
}

export async function checkSingleBookmark(
  bookmark: BookmarkItem,
  settings: ScanSettings,
  whitelist: WhitelistEntry[],
  fetchImpl: typeof fetch = fetch,
  externalSignal?: AbortSignal,
): Promise<CheckResult> {
  const skipCheck = shouldSkipUrl(bookmark.url, settings, whitelist);
  if (skipCheck.skip) {
    return {
      bookmark,
      status: 'skipped',
      reason: skipCheck.reason ?? '已跳过',
      checkedAt: Date.now(),
    };
  }

  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(50, settings.timeoutSeconds * 1000));

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  const credentials: RequestCredentials = settings.includeCredentials
    ? 'include'
    : 'omit';

  const performGet = async (
    creds: RequestCredentials,
  ): Promise<CheckResult> => {
    const getResponse = await fetchImpl(bookmark.url, {
      method: 'GET',
      redirect: 'follow',
      credentials: creds,
      signal: controller.signal,
    });

    const contentType = (getResponse.headers.get('content-type') ?? '').toLowerCase();
    const shouldReadBody =
      !contentType ||
      contentType.includes('text/html') ||
      contentType.includes('text/plain') ||
      contentType.includes('application/xhtml');
    const bodySnippet = shouldReadBody ? await readBodySnippet(getResponse) : '';

    const classified = classifyResponse({
      originalUrl: bookmark.url,
      finalUrl: getResponse.url || bookmark.url,
      redirected: getResponse.redirected,
      status: getResponse.status,
      headers: getResponse.headers,
      bodySnippet,
    });

    return {
      bookmark,
      ...classified,
      checkedAt: Date.now(),
    };
  };

  try {
    // Stage 1: Lightweight HEAD probe (if HEAD is dropped/reset by server/WAF, fall through to GET)
    try {
      const headResponse = await fetchImpl(bookmark.url, {
        method: 'HEAD',
        redirect: 'follow',
        credentials,
        signal: controller.signal,
      });

      if (!shouldFallbackToGet(headResponse)) {
        const classified = classifyResponse({
          originalUrl: bookmark.url,
          finalUrl: headResponse.url || bookmark.url,
          redirected: headResponse.redirected,
          status: headResponse.status,
          headers: headResponse.headers,
        });
        return {
          bookmark,
          ...classified,
          checkedAt: Date.now(),
        };
      }
    } catch (headErr) {
      if (timedOut || externalSignal?.aborted) {
        throw headErr;
      }
      // Server/WAF may reset or reject HEAD requests; fall through to GET
    }

    // Stage 2: Controlled GET probe (16KB capped read)
    try {
      return await performGet(credentials);
    } catch (getErr) {
      if (timedOut || externalSignal?.aborted) {
        throw getErr;
      }

      // Stage 3a: Retry GET without credentials if credentialed fetch was rejected
      if (credentials === 'include') {
        try {
          return await performGet('omit');
        } catch (omitErr) {
          if (timedOut || externalSignal?.aborted) {
            throw omitErr;
          }
        }
      }

      // Stage 3b: Reachability probe via no-cors to distinguish CORS/Origin blocks from true DNS/connection failure
      try {
        await fetchImpl(bookmark.url, {
          method: 'GET',
          mode: 'no-cors',
          credentials: 'omit',
          redirect: 'follow',
          signal: controller.signal,
        });
        return {
          bookmark,
          status: 'restricted',
          restrictedSubType: 'auth_required',
          reason: '站点可访问，但拒绝扩展跨域探测（CORS / Origin 限制）',
          checkedAt: Date.now(),
        };
      } catch (probeErr) {
        throw probeErr;
      }
    }
  } catch (error) {
    if (timedOut) {
      return {
        bookmark,
        status: 'timeout',
        reason: `请求超时（超过 ${settings.timeoutSeconds} 秒）`,
        checkedAt: Date.now(),
      };
    }
    if (externalSignal?.aborted) {
      return {
        bookmark,
        status: 'skipped',
        reason: '检测已中止',
        checkedAt: Date.now(),
      };
    }
    const msg = error instanceof Error ? error.message : '网络连接失败';
    return {
      bookmark,
      status: 'dns_network',
      reason: `无法连接 / DNS 失败 (${msg})`,
      checkedAt: Date.now(),
    };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

export type RunnerState = 'idle' | 'running' | 'paused' | 'stopped' | 'completed';

export class ScanRunner {
  private state: RunnerState = 'idle';
  private abortController: AbortController | null = null;
  private pauseWaiters: Array<() => void> = [];
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  getState(): RunnerState {
    return this.state;
  }

  pause(): void {
    if (this.state === 'running') {
      this.state = 'paused';
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'running';
      const waiters = this.pauseWaiters.splice(0);
      for (const resolve of waiters) resolve();
    }
  }

  stop(): void {
    if (this.state === 'running' || this.state === 'paused') {
      this.state = 'stopped';
      this.abortController?.abort();
      const waiters = this.pauseWaiters.splice(0);
      for (const resolve of waiters) resolve();
    }
  }

  private async waitIfPaused(): Promise<void> {
    while (this.state === 'paused') {
      await new Promise<void>((resolve) => {
        this.pauseWaiters.push(resolve);
      });
    }
  }

  async start(
    bookmarks: BookmarkItem[],
    settings: ScanSettings,
    whitelist: WhitelistEntry[],
    onResult: (result: CheckResult) => void,
  ): Promise<void> {
    this.stop();
    this.state = 'running';
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const concurrency = Math.max(1, Math.min(20, settings.concurrency));
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        await this.waitIfPaused();
        if (this.state !== 'running' || signal.aborted) {
          return;
        }
        const index = cursor++;
        if (index >= bookmarks.length) {
          return;
        }
        const bookmark = bookmarks[index];
        const result = await checkSingleBookmark(
          bookmark,
          settings,
          whitelist,
          this.fetchImpl,
          signal,
        );
        if (this.getState() === 'stopped' || signal.aborted) {
          return;
        }
        onResult(result);
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, Math.max(1, bookmarks.length)) },
      () => worker(),
    );
    await Promise.all(workers);

    if (this.state === 'running') {
      this.state = 'completed';
    }
  }
}
