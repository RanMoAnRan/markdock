import type { AiSite, DockTarget } from '../types/ai';
import type {
  RecycleBinEntry,
  ScanSettings,
  ScanSnapshot,
  VisitStatsMap,
  WhitelistEntry,
} from '../types/bookmark';
import { mergeStoredAiSites } from './aiSites';
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
  aiSites: 'bcp_ai_sites',
  dockCollapsed: 'bcp_dock_collapsed',
  activeDockId: 'bcp_active_dock_id',
  lastAiId: 'bcp_last_ai_id',
  dockPosition: 'bcp_dock_position',
} as const;

export type SidebarTheme = 'system' | 'light' | 'dark';
export type DockPosition = 'auto' | 'left' | 'right';
export type EffectiveDockPosition = 'left' | 'right';

export function resolveEffectiveDockPosition(
  pref: DockPosition,
  browserSide?: 'left' | 'right' | null,
): EffectiveDockPosition {
  if (pref === 'left' || pref === 'right') {
    return pref;
  }
  return browserSide === 'left' ? 'left' : 'right';
}

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
  liveBookmarks: Map<string, string> | Set<string>,
): ScanSnapshot {
  if (liveBookmarks instanceof Map) {
    return {
      ...snapshot,
      results: snapshot.results.filter(
        (r) => liveBookmarks.get(r.bookmark.id) === r.bookmark.url,
      ),
    };
  }
  return {
    ...snapshot,
    results: snapshot.results.filter((r) => liveBookmarks.has(r.bookmark.id)),
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
  windowId?: number;
}

export async function savePendingLocateFolder(
  folderId: string | null,
  windowId?: number,
): Promise<void> {
  await storageSet<PendingLocatePayload | null>(
    KEYS.pendingLocateFolder,
    folderId ? { folderId, requestedAt: Date.now(), windowId } : null,
  );
}

export async function consumePendingLocateFolder(
  maxAgeMs = 15_000,
  currentWindowId?: number,
): Promise<string | null> {
  const payload = await storageGet<PendingLocatePayload | null>(
    KEYS.pendingLocateFolder,
    null,
  );
  if (!payload) return null;
  if (
    typeof payload.windowId === 'number' &&
    typeof currentWindowId === 'number' &&
    payload.windowId !== currentWindowId
  ) {
    return null;
  }
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

export async function loadAiSites(): Promise<AiSite[]> {
  const raw = await storageGet<AiSite[] | null>(KEYS.aiSites, null);
  return mergeStoredAiSites(raw);
}

export async function saveAiSites(sites: AiSite[]): Promise<void> {
  await storageSet(KEYS.aiSites, sites);
}

export async function loadDockCollapsed(): Promise<boolean> {
  const raw = await storageGet<boolean>(KEYS.dockCollapsed, false);
  return Boolean(raw);
}

export async function saveDockCollapsed(collapsed: boolean): Promise<void> {
  await storageSet(KEYS.dockCollapsed, collapsed);
}

export async function loadActiveDockId(): Promise<DockTarget> {
  const raw = await storageGet<string>(KEYS.activeDockId, 'bookmarks');
  return typeof raw === 'string' && raw.trim() ? raw : 'bookmarks';
}

export async function saveActiveDockId(target: DockTarget): Promise<void> {
  await storageSet(KEYS.activeDockId, target);
}

export async function loadLastAiId(): Promise<string | null> {
  const raw = await storageGet<string | null>(KEYS.lastAiId, null);
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

export async function saveLastAiId(id: string | null): Promise<void> {
  await storageSet<string | null>(KEYS.lastAiId, id);
}

export async function loadDockPosition(): Promise<DockPosition> {
  const value = await storageGet<string>(KEYS.dockPosition, 'auto');
  if (value === 'auto' || value === 'left' || value === 'right') {
    return value;
  }
  return 'auto';
}

export async function saveDockPosition(position: DockPosition): Promise<void> {
  await storageSet<DockPosition>(KEYS.dockPosition, position);
}
