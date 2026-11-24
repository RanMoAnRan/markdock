import type { AiSite, DockTarget } from '../types/ai';

const CUSTOM_ACCENT_PALETTE = [
  '#2563eb',
  '#7c3aed',
  '#0891b2',
  '#059669',
  '#d97706',
  '#dc2626',
  '#db2777',
  '#4f46e5',
];

export const DEFAULT_AI_SITES: AiSite[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    enabled: true,
    builtIn: true,
    badgeText: 'GP',
    accentColor: '#10a37f',
  },
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai',
    enabled: true,
    builtIn: true,
    badgeText: 'Cl',
    accentColor: '#d97757',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com',
    enabled: true,
    builtIn: true,
    badgeText: '✦',
    accentColor: '#4285f4',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    enabled: true,
    builtIn: true,
    badgeText: 'DS',
    accentColor: '#4d6bfe',
  },
  {
    id: 'kimi',
    name: 'Kimi',
    url: 'https://www.kimi.com',
    enabled: true,
    builtIn: true,
    badgeText: 'K',
    accentColor: '#1e293b',
  },
  {
    id: 'doubao',
    name: '豆包',
    url: 'https://www.doubao.com/chat/',
    enabled: true,
    builtIn: true,
    badgeText: '豆',
    accentColor: '#3b82f6',
  },
  {
    id: 'qwen',
    name: '通义千问',
    url: 'https://chat.qwen.ai',
    enabled: false,
    builtIn: true,
    badgeText: '千',
    accentColor: '#6366f1',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    enabled: false,
    builtIn: true,
    badgeText: 'Px',
    accentColor: '#0e7490',
  },
  {
    id: 'grok',
    name: 'Grok',
    url: 'https://grok.com',
    enabled: false,
    builtIn: true,
    badgeText: 'Gk',
    accentColor: '#0f172a',
  },
  {
    id: 'yuanbao',
    name: '腾讯元宝',
    url: 'https://yuanbao.tencent.com',
    enabled: false,
    builtIn: true,
    badgeText: '元',
    accentColor: '#059669',
  },
];

function cloneDefaultSites(): AiSite[] {
  return DEFAULT_AI_SITES.map((s) => ({ ...s }));
}

function pickAccentColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return CUSTOM_ACCENT_PALETTE[hash % CUSTOM_ACCENT_PALETTE.length];
}

export function normalizeAiUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function getAiBadgeText(site: Pick<AiSite, 'name' | 'badgeText'>): string {
  const explicit = site.badgeText?.trim();
  if (explicit) return explicit;
  const trimmedName = site.name.trim();
  if (!trimmedName) return 'AI';
  const firstChar = Array.from(trimmedName)[0] ?? 'A';
  return firstChar.toUpperCase();
}

export function mergeStoredAiSites(
  stored: AiSite[] | null | undefined,
): AiSite[] {
  if (!Array.isArray(stored)) {
    return cloneDefaultSites();
  }

  const defaultById = new Map(DEFAULT_AI_SITES.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const result: AiSite[] = [];

  for (const item of stored) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id.trim() ||
      typeof item.url !== 'string' ||
      !normalizeAiUrl(item.url)
    ) {
      continue;
    }
    if (seen.has(item.id)) continue;
    seen.add(item.id);

    const preset = defaultById.get(item.id);
    if (preset) {
      result.push({
        id: preset.id,
        name:
          typeof item.name === 'string' && item.name.trim()
            ? item.name.trim()
            : preset.name,
        url: item.url.trim(),
        enabled: typeof item.enabled === 'boolean' ? item.enabled : preset.enabled,
        builtIn: true,
        badgeText: item.badgeText || preset.badgeText,
        accentColor: item.accentColor || preset.accentColor,
      });
    } else {
      const name =
        typeof item.name === 'string' && item.name.trim()
          ? item.name.trim()
          : item.url.trim();
      result.push({
        id: item.id,
        name,
        url: item.url.trim(),
        enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
        builtIn: false,
        badgeText: item.badgeText,
        accentColor: item.accentColor || pickAccentColor(name),
      });
    }
  }

  return result;
}

export function addCustomAiSite(
  sites: AiSite[],
  input: { name: string; url: string },
): { sites: AiSite[]; created: AiSite } | { error: string } {
  const name = input.name.trim();
  if (!name) {
    return { error: '请输入 AI 网站名称' };
  }
  const normalizedUrl = normalizeAiUrl(input.url);
  if (!normalizedUrl) {
    return { error: '请输入有效的 http:// 或 https:// 网址' };
  }

  const created: AiSite = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    url: normalizedUrl,
    enabled: true,
    builtIn: false,
    accentColor: pickAccentColor(name),
  };

  return { sites: [...sites, created], created };
}

export function updateAiSite(
  sites: AiSite[],
  id: string,
  patch: { name: string; url: string },
): { sites: AiSite[] } | { error: string } {
  const name = patch.name.trim();
  if (!name) {
    return { error: '请输入 AI 网站名称' };
  }
  const normalizedUrl = normalizeAiUrl(patch.url);
  if (!normalizedUrl) {
    return { error: '请输入有效的 http:// 或 https:// 网址' };
  }

  return {
    sites: sites.map((site) =>
      site.id === id ? { ...site, name, url: normalizedUrl } : site,
    ),
  };
}

export function deleteAiSite(sites: AiSite[], id: string): AiSite[] {
  return sites.filter((site) => site.id !== id);
}

export function toggleAiSite(
  sites: AiSite[],
  id: string,
  enabled?: boolean,
): AiSite[] {
  return sites.map((site) =>
    site.id === id
      ? { ...site, enabled: enabled !== undefined ? enabled : !site.enabled }
      : site,
  );
}

export function reorderAiSites(
  sites: AiSite[],
  fromIndex: number,
  toIndex: number,
): AiSite[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= sites.length ||
    toIndex >= sites.length
  ) {
    return sites;
  }
  const next = [...sites];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function resetBuiltInAiSites(sites: AiSite[]): AiSite[] {
  const customSites = sites.filter((site) => !site.builtIn).map((s) => ({ ...s }));
  return [...cloneDefaultSites(), ...customSites];
}

export function resolveActiveDockTarget(
  target: DockTarget,
  sites: AiSite[],
): DockTarget {
  if (target === 'bookmarks') return 'bookmarks';
  const existsAndEnabled = sites.some((s) => s.id === target && s.enabled);
  return existsAndEnabled ? target : 'bookmarks';
}

export function pruneLoadedAiIds(loadedIds: string[], sites: AiSite[]): string[] {
  const enabledIds = new Set(sites.filter((s) => s.enabled).map((s) => s.id));
  return loadedIds.filter((id) => enabledIds.has(id));
}

export function resolvePreferredAiSiteId(
  lastAiId: string | null | undefined,
  sites: AiSite[],
): string | null {
  if (lastAiId && sites.some((s) => s.id === lastAiId && s.enabled)) {
    return lastAiId;
  }
  const firstEnabled = sites.find((s) => s.enabled);
  return firstEnabled ? firstEnabled.id : null;
}
