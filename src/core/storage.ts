import type {
  RecycleBinEntry,
  ScanSettings,
  ScanSnapshot,
  VisitStatsMap,
  WhitelistEntry,
} from '../types/bookmark';
import { DEFAULT_SCAN_SETTINGS } from './checker';

const KEYS = {
  settings: 'bcp_settings',
  whitelist: 'bcp_whitelist',
  recycleBin: 'bcp_recycle_bin',
  snapshot: 'bcp_last_scan_snapshot',
  pinnedIds: 'bcp_pinned_ids',
  expandedFolders: 'bcp_expanded_folders',
  sidebarFontSize: 'bcp_sidebar_font_size',
  sidebarTheme: 'bcp_sidebar_theme',
  pendingLocateFolder: 'bcp_pending_locate_folder',
  visitStats: 'bcp_visit_stats',
} as const;

export type SidebarTheme = 'system' | 'light' | 'dark';

async function storageGet<T>(key: string, fallback: T): Promise<T> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const res = await chrome.storage.local.get(key);
    return (res[key] as T | undefined) ?? fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function storageSet<T>(key: string, value: T): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota fallback errors
  }
}

export async function loadSettings(): Promise<ScanSettings> {
  const stored = await storageGet<Partial<ScanSettings>>(KEYS.settings, {});
  return { ...DEFAULT_SCAN_SETTINGS, ...stored };
}

export async function saveSettings(settings: ScanSettings): Promise<void> {
  await storageSet(KEYS.settings, settings);
}

export async function loadWhitelist(): Promise<WhitelistEntry[]> {
  return await storageGet<WhitelistEntry[]>(KEYS.whitelist, []);
}

export async function saveWhitelist(list: WhitelistEntry[]): Promise<void> {
  await storageSet(KEYS.whitelist, list);
}

export async function loadRecycleBin(): Promise<RecycleBinEntry[]> {
  return await storageGet<RecycleBinEntry[]>(KEYS.recycleBin, []);
}

export async function saveRecycleBin(items: RecycleBinEntry[]): Promise<void> {
  await storageSet(KEYS.recycleBin, items);
}

export async function loadScanSnapshot(): Promise<ScanSnapshot | null> {
  return await storageGet<ScanSnapshot | null>(KEYS.snapshot, null);
}

export async function saveScanSnapshot(snapshot: ScanSnapshot | null): Promise<void> {
  await storageSet(KEYS.snapshot, snapshot);
}

export function reconcileSnapshot(
  snapshot: ScanSnapshot,
  liveBookmarkIds: Set<string>,
): ScanSnapshot {
  return {
    ...snapshot,
    results: snapshot.results.filter((r) => liveBookmarkIds.has(r.bookmark.id)),
  };
}

export async function loadPinnedIds(): Promise<string[]> {
  return await storageGet<string[]>(KEYS.pinnedIds, []);
}

export async function savePinnedIds(ids: string[]): Promise<void> {
  await storageSet(KEYS.pinnedIds, ids);
}

export async function loadExpandedFolders(): Promise<string[]> {
  return await storageGet<string[]>(KEYS.expandedFolders, ['1']);
}

export async function saveExpandedFolders(ids: string[]): Promise<void> {
  await storageSet(KEYS.expandedFolders, ids);
}

export async function loadSidebarFontSize(): Promise<number> {
  const size = await storageGet<number>(KEYS.sidebarFontSize, 13);
  return Math.max(11, Math.min(20, Number(size) || 13));
}

export async function saveSidebarFontSize(size: number): Promise<void> {
  await storageSet(KEYS.sidebarFontSize, Math.max(11, Math.min(20, size)));
}

export async function loadSidebarTheme(): Promise<SidebarTheme> {
  const value = await storageGet<string>(KEYS.sidebarTheme, 'system');
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return 'system';
}

export async function saveSidebarTheme(theme: SidebarTheme): Promise<void> {
  await storageSet(KEYS.sidebarTheme, theme);
}

interface PendingLocatePayload {
  folderId: string;
  requestedAt: number;
}

export async function savePendingLocateFolder(
  folderId: string | null,
): Promise<void> {
  await storageSet<PendingLocatePayload | null>(
    KEYS.pendingLocateFolder,
    folderId ? { folderId, requestedAt: Date.now() } : null,
  );
}

export async function consumePendingLocateFolder(
  maxAgeMs = 15_000,
): Promise<string | null> {
  const payload = await storageGet<PendingLocatePayload | null>(
    KEYS.pendingLocateFolder,
    null,
  );
  if (!payload) return null;
  await storageSet<PendingLocatePayload | null>(KEYS.pendingLocateFolder, null);
  if (Date.now() - payload.requestedAt > maxAgeMs) return null;
  return payload.folderId;
}

export async function loadVisitStats(): Promise<VisitStatsMap> {
  const raw = await storageGet<VisitStatsMap>(KEYS.visitStats, {});
  return raw && typeof raw === 'object' ? raw : {};
}

export async function saveVisitStats(stats: VisitStatsMap): Promise<void> {
  await storageSet(KEYS.visitStats, stats);
}
