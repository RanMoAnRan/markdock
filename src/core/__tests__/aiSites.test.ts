import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_SITES,
  addCustomAiSite,
  deleteAiSite,
  getAiBadgeText,
  mergeStoredAiSites,
  normalizeAiUrl,
  pruneLoadedAiIds,
  reorderAiSites,
  resetBuiltInAiSites,
  resolveActiveDockTarget,
  resolvePreferredAiSiteId,
  toggleAiSite,
  updateAiSite,
} from '../aiSites';
import type { AiSite } from '../../types/ai';

describe('DEFAULT_AI_SITES', () => {
  it('defines 10 built-in presets with first 6 enabled and 4 disabled', () => {
    expect(DEFAULT_AI_SITES).toHaveLength(10);
    const enabledIds = DEFAULT_AI_SITES.filter((s) => s.enabled).map((s) => s.id);
    const disabledIds = DEFAULT_AI_SITES.filter((s) => !s.enabled).map((s) => s.id);

    expect(enabledIds).toEqual([
      'chatgpt',
      'claude',
      'gemini',
      'deepseek',
      'kimi',
      'doubao',
    ]);
    expect(disabledIds).toEqual(['qwen', 'perplexity', 'grok', 'yuanbao']);

    for (const site of DEFAULT_AI_SITES) {
      expect(site.builtIn).toBe(true);
      expect(site.badgeText && site.badgeText.length > 0).toBe(true);
      expect(site.accentColor && site.accentColor.length > 0).toBe(true);
      expect(normalizeAiUrl(site.url)).not.toBeNull();
    }
  });
});

describe('normalizeAiUrl', () => {
  it('accepts http and https URLs and prepends https:// for bare domains', () => {
    expect(normalizeAiUrl('https://chat.deepseek.com')).toBe(
      'https://chat.deepseek.com/',
    );
    expect(normalizeAiUrl('http://localhost:3000/chat')).toBe(
      'http://localhost:3000/chat',
    );
    expect(normalizeAiUrl('  perplexity.ai  ')).toBe('https://perplexity.ai/');
  });

  it('rejects empty, dangerous, or malformed URLs', () => {
    expect(normalizeAiUrl('')).toBeNull();
    expect(normalizeAiUrl('   ')).toBeNull();
    expect(normalizeAiUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeAiUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeAiUrl('ftp://example.com')).toBeNull();
    expect(normalizeAiUrl('not a url')).toBeNull();
    expect(normalizeAiUrl('https://')).toBeNull();
  });
});

describe('getAiBadgeText', () => {
  it('uses explicit badgeText or falls back to first visible character', () => {
    expect(getAiBadgeText({ name: 'DeepSeek', badgeText: 'DS' })).toBe('DS');
    expect(getAiBadgeText({ name: '  claude  ' })).toBe('C');
    expect(getAiBadgeText({ name: '豆包' })).toBe('豆');
    expect(getAiBadgeText({ name: '' })).toBe('AI');
  });
});

describe('mergeStoredAiSites', () => {
  it('returns cloned defaults when stored is null or undefined', () => {
    const merged = mergeStoredAiSites(null);
    expect(merged).toHaveLength(DEFAULT_AI_SITES.length);
    expect(merged).not.toBe(DEFAULT_AI_SITES);
    expect(merged[0]).not.toBe(DEFAULT_AI_SITES[0]);
  });

  it('preserves user order, edits, deletions, and custom sites while dropping corrupted entries', () => {
    const stored = [
      {
        id: 'custom-1',
        name: 'My Local LLM',
        url: 'http://localhost:8080',
        enabled: true,
        builtIn: false,
      },
      {
        id: 'deepseek',
        name: 'DeepSeek Pro',
        url: 'https://chat.deepseek.com/',
        enabled: false,
        builtIn: true,
      },
      { id: '', name: 'Broken', url: '', enabled: true, builtIn: false },
    ] as AiSite[];

    const merged = mergeStoredAiSites(stored);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('custom-1');
    expect(merged[1].id).toBe('deepseek');
    expect(merged[1].name).toBe('DeepSeek Pro');
    expect(merged[1].enabled).toBe(false);
    expect(merged[1].badgeText).toBe('DS'); // hydrated from built-in defaults
    // Deleted built-ins stay deleted (not resurrected)
    expect(merged.some((s) => s.id === 'chatgpt')).toBe(false);
    // Corrupted entry dropped
    expect(merged.some((s) => s.name === 'Broken')).toBe(false);
    // Explicitly empty list stays empty
    expect(mergeStoredAiSites([])).toEqual([]);
  });
});

describe('CRUD & reorder operations', () => {
  it('adds custom AI site with normalized URL and rejects invalid inputs', () => {
    const res = addCustomAiSite(DEFAULT_AI_SITES, {
      name: 'Poe',
      url: 'poe.com',
    });
    expect('error' in res).toBe(false);
    if (!('error' in res)) {
      expect(res.created.builtIn).toBe(false);
      expect(res.created.enabled).toBe(true);
      expect(res.created.url).toBe('https://poe.com/');
      expect(res.sites).toHaveLength(DEFAULT_AI_SITES.length + 1);
    }

    expect(
      'error' in addCustomAiSite(DEFAULT_AI_SITES, { name: '  ', url: 'https://poe.com' }),
    ).toBe(true);
    expect(
      'error' in addCustomAiSite(DEFAULT_AI_SITES, { name: 'Bad', url: 'javascript:void(0)' }),
    ).toBe(true);
  });

  it('updates both built-in and custom sites and validates input', () => {
    const updated = updateAiSite(DEFAULT_AI_SITES, 'deepseek', {
      name: 'DeepSeek V3',
      url: 'chat.deepseek.com/a',
    });
    expect('error' in updated).toBe(false);
    if (!('error' in updated)) {
      const target = updated.sites.find((s) => s.id === 'deepseek');
      expect(target?.name).toBe('DeepSeek V3');
      expect(target?.url).toBe('https://chat.deepseek.com/a');
    }

    expect(
      'error' in updateAiSite(DEFAULT_AI_SITES, 'deepseek', { name: '', url: 'https://a.com' }),
    ).toBe(true);
    expect(
      'error' in updateAiSite(DEFAULT_AI_SITES, 'deepseek', { name: 'X', url: 'file:///a' }),
    ).toBe(true);
  });

  it('deletes both built-in and custom sites', () => {
    const added = addCustomAiSite(DEFAULT_AI_SITES, {
      name: 'Poe',
      url: 'https://poe.com',
    });
    if ('error' in added) throw new Error(added.error);

    const afterBuiltInDelete = deleteAiSite(added.sites, 'chatgpt');
    expect(afterBuiltInDelete).toHaveLength(added.sites.length - 1);
    expect(afterBuiltInDelete.some((s) => s.id === 'chatgpt')).toBe(false);

    const afterCustomDelete = deleteAiSite(afterBuiltInDelete, added.created.id);
    expect(afterCustomDelete).toHaveLength(DEFAULT_AI_SITES.length - 1);
    expect(afterCustomDelete.some((s) => s.id === added.created.id)).toBe(false);
  });

  it('toggles enabled state and reorders sites safely', () => {
    const toggled = toggleAiSite(DEFAULT_AI_SITES, 'qwen');
    expect(toggled.find((s) => s.id === 'qwen')?.enabled).toBe(true);

    const reordered = reorderAiSites(DEFAULT_AI_SITES, 3, 0);
    expect(reordered[0].id).toBe('deepseek');
    expect(reordered[1].id).toBe('chatgpt');

    // Out-of-bounds is a no-op
    expect(reorderAiSites(DEFAULT_AI_SITES, -1, 2)).toEqual(DEFAULT_AI_SITES);
    expect(reorderAiSites(DEFAULT_AI_SITES, 0, 99)).toEqual(DEFAULT_AI_SITES);
  });

  it('resets built-in presets while preserving custom sites', () => {
    let list = toggleAiSite(DEFAULT_AI_SITES, 'chatgpt', false);
    const updated = updateAiSite(list, 'deepseek', {
      name: 'Renamed',
      url: 'https://example.com',
    });
    if ('error' in updated) throw new Error(updated.error);
    const added = addCustomAiSite(updated.sites, {
      name: 'Custom AI',
      url: 'https://custom.ai',
    });
    if ('error' in added) throw new Error(added.error);
    list = added.sites;

    const reset = resetBuiltInAiSites(list);
    expect(reset.find((s) => s.id === 'chatgpt')?.enabled).toBe(true);
    expect(reset.find((s) => s.id === 'deepseek')?.name).toBe('DeepSeek');
    expect(reset.find((s) => s.id === 'deepseek')?.url).toBe(
      'https://chat.deepseek.com',
    );
    expect(reset.some((s) => s.name === 'Custom AI' && !s.builtIn)).toBe(true);
  });
});

describe('resolveActiveDockTarget & pruneLoadedAiIds', () => {
  it('falls back to bookmarks when target is disabled or deleted, and prunes loaded IDs', () => {
    expect(resolveActiveDockTarget('bookmarks', DEFAULT_AI_SITES)).toBe(
      'bookmarks',
    );
    expect(resolveActiveDockTarget('deepseek', DEFAULT_AI_SITES)).toBe('deepseek');
    expect(resolveActiveDockTarget('qwen', DEFAULT_AI_SITES)).toBe('bookmarks');
    expect(resolveActiveDockTarget('non-existent', DEFAULT_AI_SITES)).toBe(
      'bookmarks',
    );

    expect(
      pruneLoadedAiIds(['chatgpt', 'qwen', 'deleted', 'deepseek'], DEFAULT_AI_SITES),
    ).toEqual(['chatgpt', 'deepseek']);
  });

  it('resolves preferred AI site id from last used or falls back to first enabled', () => {
    expect(resolvePreferredAiSiteId('deepseek', DEFAULT_AI_SITES)).toBe('deepseek');
    expect(resolvePreferredAiSiteId('qwen', DEFAULT_AI_SITES)).toBe('chatgpt');
    expect(resolvePreferredAiSiteId(null, DEFAULT_AI_SITES)).toBe('chatgpt');
    const allDisabled = DEFAULT_AI_SITES.map((s) => ({ ...s, enabled: false }));
    expect(resolvePreferredAiSiteId('chatgpt', allDisabled)).toBeNull();
  });
});
