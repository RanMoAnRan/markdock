import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadActiveDockId,
  loadAiSites,
  loadDockCollapsed,
  loadDockPosition,
  loadLastAiId,
  resolveEffectiveDockPosition,
  saveActiveDockId,
  saveAiSites,
  saveDockCollapsed,
  saveDockPosition,
  saveLastAiId,
} from '../storage';
import { DEFAULT_AI_SITES, deleteAiSite, toggleAiSite } from '../aiSites';

describe('AI Hub storage persistence', () => {
  const store = new Map<string, unknown>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: store.get(key) })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) {
              store.set(k, v);
            }
          }),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads default AI sites when empty and persists custom changes', async () => {
    const initial = await loadAiSites();
    expect(initial).toHaveLength(DEFAULT_AI_SITES.length);

    const updated = toggleAiSite(initial, 'qwen', true);
    await saveAiSites(updated);

    const reloaded = await loadAiSites();
    expect(reloaded.find((s) => s.id === 'qwen')?.enabled).toBe(true);

    const afterDelete = deleteAiSite(reloaded, 'grok');
    await saveAiSites(afterDelete);
    const reloadedAfterDelete = await loadAiSites();
    expect(reloadedAfterDelete.some((s) => s.id === 'grok')).toBe(false);
  });

  it('persists dock collapsed state with false default', async () => {
    expect(await loadDockCollapsed()).toBe(false);
    await saveDockCollapsed(true);
    expect(await loadDockCollapsed()).toBe(true);
  });

  it('persists active dock target with bookmarks default', async () => {
    expect(await loadActiveDockId()).toBe('bookmarks');
    await saveActiveDockId('deepseek');
    expect(await loadActiveDockId()).toBe('deepseek');
  });

  it('persists last used AI site id with null default', async () => {
    expect(await loadLastAiId()).toBeNull();
    await saveLastAiId('claude');
    expect(await loadLastAiId()).toBe('claude');
    await saveLastAiId(null);
    expect(await loadLastAiId()).toBeNull();
  });

  it('persists dock position with auto default and sanitizes invalid values', async () => {
    expect(await loadDockPosition()).toBe('auto');

    await saveDockPosition('left');
    expect(await loadDockPosition()).toBe('left');

    await saveDockPosition('right');
    expect(await loadDockPosition()).toBe('right');

    store.set('bcp_dock_position', 'unexpected-value');
    expect(await loadDockPosition()).toBe('auto');
  });

  it('resolves effective dock position from preference and browser side', () => {
    expect(resolveEffectiveDockPosition('left', 'right')).toBe('left');
    expect(resolveEffectiveDockPosition('left', 'left')).toBe('left');
    expect(resolveEffectiveDockPosition('right', 'left')).toBe('right');
    expect(resolveEffectiveDockPosition('right', 'right')).toBe('right');
    expect(resolveEffectiveDockPosition('auto', 'left')).toBe('left');
    expect(resolveEffectiveDockPosition('auto', 'right')).toBe('right');
    expect(resolveEffectiveDockPosition('auto', null)).toBe('right');
    expect(resolveEffectiveDockPosition('auto', undefined)).toBe('right');
  });
});
