import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_IFRAME_RULE_ID,
  buildAiFrameRule,
  extractEnabledAiDomains,
  setupAiFrameRules,
} from '../../background/aiFrameRules';
import { DEFAULT_AI_SITES } from '../aiSites';

describe('aiFrameRules', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts unique hostnames only from enabled AI sites', () => {
    const domains = extractEnabledAiDomains(DEFAULT_AI_SITES);
    expect(domains).toEqual([
      'chatgpt.com',
      'claude.ai',
      'gemini.google.com',
      'chat.deepseek.com',
      'www.kimi.com',
      'www.doubao.com',
    ]);
  });

  it('builds a side-panel-scoped DNR rule restricted to enabled AI requestDomains', () => {
    const domains = ['chat.deepseek.com', 'chatgpt.com'];
    const rule = buildAiFrameRule(domains);
    expect(rule.id).toBe(AI_IFRAME_RULE_ID);
    expect(rule.priority).toBe(1);
    expect(rule.condition.tabIds).toEqual([-1]);
    expect(rule.condition.requestDomains).toEqual(domains);
    expect(rule.condition.resourceTypes).toEqual(['sub_frame']);
    expect(rule.action.type).toBe('modifyHeaders');

    const headers = rule.action.responseHeaders?.map((h) => ({
      header: h.header,
      operation: h.operation,
    }));
    expect(headers).toEqual([
      { header: 'x-frame-options', operation: 'remove' },
      { header: 'content-security-policy', operation: 'remove' },
      { header: 'frame-options', operation: 'remove' },
    ]);
  });

  it('registers rule idempotently via updateSessionRules and clears rule when no AI sites are enabled', async () => {
    const updateSessionRules = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      declarativeNetRequest: { updateSessionRules },
    });

    await setupAiFrameRules(DEFAULT_AI_SITES);
    expect(updateSessionRules).toHaveBeenCalledTimes(1);
    expect(updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [AI_IFRAME_RULE_ID],
      addRules: [buildAiFrameRule(extractEnabledAiDomains(DEFAULT_AI_SITES))],
    });

    updateSessionRules.mockClear();
    const allDisabled = DEFAULT_AI_SITES.map((s) => ({ ...s, enabled: false }));
    await setupAiFrameRules(allDisabled);
    expect(updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [AI_IFRAME_RULE_ID],
      addRules: [],
    });
  });

  it('safely no-ops when declarativeNetRequest is unavailable or throws', async () => {
    vi.stubGlobal('chrome', undefined);
    await expect(setupAiFrameRules(DEFAULT_AI_SITES)).resolves.toBeUndefined();

    vi.stubGlobal('chrome', {
      declarativeNetRequest: {
        updateSessionRules: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });
    await expect(setupAiFrameRules(DEFAULT_AI_SITES)).resolves.toBeUndefined();
  });
});
