import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArchiveRestore,
  Bookmark,
  Copy,
  FolderOpen,
  Radar,
  ShieldCheck,
} from 'lucide-react';
import type {
  BookmarkItem,
  CheckResult,
  RecycleBinEntry,
  ScanSettings,
  WhitelistEntry,
} from './types/bookmark';
import {
  extractFolders,
  flattenBookmarkTree,
  loadBookmarkTree,
} from './core/bookmarks';
import { DEFAULT_SCAN_SETTINGS, ScanRunner, type RunnerState } from './core/checker';
import { findDuplicateGroups } from './core/duplicates';
import { findEmptyFolders } from './core/folders';
import { triggerBookmarkHtmlDownload } from './core/exporter';
import {
  RecycleBinCapacityError,
  clearRecycleBin,
  removeRecycleBinEntries,
  restoreRecycleBinEntries,
  safeDeleteBookmarks,
} from './core/recycleBin';
import {
  loadRecycleBin,
  loadScanSnapshot,
  loadSettings,
  loadSidebarTheme,
  loadWhitelist,
  reconcileSnapshot,
  saveScanSnapshot,
  saveSettings,
  saveSidebarTheme,
  saveWhitelist,
  type SidebarTheme,
} from './core/storage';
import { createWhitelistEntry } from './core/whitelist';
import { Header } from './components/Header';
import { SettingsModal } from './components/SettingsModal';
import { ScannerTab } from './components/ScannerTab';
import { AllBookmarksTab } from './components/AllBookmarksTab';
import { DuplicatesTab } from './components/DuplicatesTab';
import { EmptyFoldersTab } from './components/EmptyFoldersTab';
import { WhitelistTab } from './components/WhitelistTab';
import { RecycleBinTab } from './components/RecycleBinTab';

type TabKey =
  | 'scanner'
  | 'all_bookmarks'
  | 'duplicates'
  | 'folders'
  | 'whitelist'
  | 'recycle';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'info' | 'error';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('scanner');
  const [roots, setRoots] = useState<chrome.bookmarks.BookmarkTreeNode[]>([]);
  const [settings, setSettings] = useState<ScanSettings>(DEFAULT_SCAN_SETTINGS);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [recycleBin, setRecycleBin] = useState<RecycleBinEntry[]>([]);
  const [scanResults, setScanResults] = useState<CheckResult[]>([]);
  const scanResultsRef = useRef<CheckResult[]>(scanResults);
  scanResultsRef.current = scanResults;
  const [scanState, setScanState] = useState<RunnerState>('idle');
  const [scanTotal, setScanTotal] = useState(0);
  const [scanChecked, setScanChecked] = useState(0);
  const scanRunnerRef = useRef<ScanRunner | null>(null);
  const scanRunIdRef = useRef(0);
  const scanResultsMapRef = useRef<Map<string, CheckResult>>(new Map());
  const scanFlushTimerRef = useRef<number | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [themeMode, setThemeMode] = useState<SidebarTheme>('system');
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Warn before accidental tab close while a scan is actively running or paused
  useEffect(() => {
    if (scanState !== 'running' && scanState !== 'paused') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [scanState]);

  const notify = useCallback(
    (message: string, type: 'success' | 'info' | 'error' = 'info') => {
      const id = Date.now();
      setToast({ id, message, type });
      setTimeout(() => {
        setToast((prev) => (prev?.id === id ? null : prev));
      }, 3200);
    },
    [],
  );

  const handleCycleTheme = async () => {
    const next: SidebarTheme =
      themeMode === 'system'
        ? 'light'
        : themeMode === 'light'
          ? 'dark'
          : 'system';
    setThemeMode(next);
    await saveSidebarTheme(next);
  };

  const refreshBookmarks = useCallback(async () => {
    const tree = await loadBookmarkTree();
    setRoots(tree);
    const liveUrlMap = new Map(
      flattenBookmarkTree(tree).map((b) => [b.id, b.url]),
    );
    setScanResults((prev) => {
      if (prev.length === 0) return prev;
      const filtered = prev.filter(
        (r) => liveUrlMap.get(r.bookmark.id) === r.bookmark.url,
      );
      if (filtered.length === prev.length) return prev;
      void saveScanSnapshot(
        filtered.length > 0
          ? { savedAt: Date.now(), folderId: selectedFolderId, results: filtered }
          : null,
      );
      return filtered;
    });
    return tree;
  }, [selectedFolderId]);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.bookmarks) return;
    let timer: number | null = null;
    const scheduleRefresh = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void refreshBookmarks();
      }, 80);
    };
    chrome.bookmarks.onCreated?.addListener(scheduleRefresh);
    chrome.bookmarks.onRemoved?.addListener(scheduleRefresh);
    chrome.bookmarks.onChanged?.addListener(scheduleRefresh);
    chrome.bookmarks.onMoved?.addListener(scheduleRefresh);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      chrome.bookmarks.onCreated?.removeListener(scheduleRefresh);
      chrome.bookmarks.onRemoved?.removeListener(scheduleRefresh);
      chrome.bookmarks.onChanged?.removeListener(scheduleRefresh);
      chrome.bookmarks.onMoved?.removeListener(scheduleRefresh);
    };
  }, [refreshBookmarks]);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      if (changes.bcp_recycle_bin) {
        setRecycleBin(
          (changes.bcp_recycle_bin.newValue as RecycleBinEntry[] | undefined) ??
            [],
        );
      }
      if (changes.bcp_sidebar_theme) {
        const nextTheme = changes.bcp_sidebar_theme.newValue;
        if (
          nextTheme === 'light' ||
          nextTheme === 'dark' ||
          nextTheme === 'system'
        ) {
          setThemeMode(nextTheme);
        }
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const [
        tree,
        loadedSettings,
        loadedWhitelist,
        loadedBin,
        loadedSnapshot,
        loadedTheme,
      ] = await Promise.all([
        loadBookmarkTree(),
        loadSettings(),
        loadWhitelist(),
        loadRecycleBin(),
        loadScanSnapshot(),
        loadSidebarTheme(),
      ]);

      setRoots(tree);
      setSettings(loadedSettings);
      setWhitelist(loadedWhitelist);
      setRecycleBin(loadedBin);
      setThemeMode(loadedTheme);

      if (loadedSnapshot) {
        const liveUrlMap = new Map(
          flattenBookmarkTree(tree).map((b) => [b.id, b.url]),
        );
        const reconciled = reconcileSnapshot(loadedSnapshot, liveUrlMap);
        setSelectedFolderId(reconciled.folderId || 'all');
        setScanResults(reconciled.results);
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      scanRunIdRef.current += 1;
      scanRunnerRef.current?.stop();
      if (scanFlushTimerRef.current !== null) {
        window.clearTimeout(scanFlushTimerRef.current);
      }
    };
  }, []);

  const bookmarks = useMemo(() => flattenBookmarkTree(roots), [roots]);
  const folders = useMemo(() => extractFolders(roots), [roots]);
  const emptyFolders = useMemo(() => findEmptyFolders(roots), [roots]);
  const duplicateCount = useMemo(
    () =>
      findDuplicateGroups(bookmarks, 'exact').reduce(
        (acc, g) => acc + (g.items.length - 1),
        0,
      ),
    [bookmarks],
  );
  const issueCount = useMemo(
    () =>
      scanResults.filter((r) => r.status !== 'valid' && r.status !== 'skipped')
        .length,
    [scanResults],
  );

  const handleResultsChange = useCallback(
    (next: CheckResult[], persist = false) => {
      setScanResults(next);
      if (persist) {
        void saveScanSnapshot(
          next.length > 0
            ? { savedAt: Date.now(), folderId: selectedFolderId, results: next }
            : null,
        );
      }
    },
    [selectedFolderId],
  );

  const clearScanFlushTimer = useCallback(() => {
    if (scanFlushTimerRef.current !== null) {
      window.clearTimeout(scanFlushTimerRef.current);
      scanFlushTimerRef.current = null;
    }
  }, []);

  const handleStartScan = useCallback(
    async (targets: BookmarkItem[], preserveExisting: boolean) => {
      if (targets.length === 0) {
        notify('当前范围内没有可检测的书签', 'info');
        return;
      }

      const runId = ++scanRunIdRef.current;
      scanRunnerRef.current?.stop();
      clearScanFlushTimer();

      const runner = new ScanRunner();
      scanRunnerRef.current = runner;
      setScanState('running');
      setScanTotal(targets.length);
      setScanChecked(0);

      const map = new Map<string, CheckResult>();
      if (preserveExisting) {
        for (const r of scanResultsRef.current) {
          map.set(r.bookmark.id, r);
        }
      }
      scanResultsMapRef.current = map;

      if (!preserveExisting) {
        handleResultsChange([], false);
      }

      let checked = 0;
      let lastPersistedAtCount = 0;
      const flushProgress = () => {
        scanFlushTimerRef.current = null;
        if (scanRunIdRef.current !== runId) return;
        setScanChecked(checked);
        const shouldCheckpoint = checked - lastPersistedAtCount >= 25;
        if (shouldCheckpoint) {
          lastPersistedAtCount = checked;
        }
        handleResultsChange([...map.values()], shouldCheckpoint);
      };

      await runner.start(targets, settings, whitelist, (res) => {
        if (scanRunIdRef.current !== runId) return;
        checked++;
        map.set(res.bookmark.id, res);
        if (scanFlushTimerRef.current === null) {
          scanFlushTimerRef.current = window.setTimeout(flushProgress, 120);
        }
      });

      if (scanRunIdRef.current !== runId) return;
      clearScanFlushTimer();
      const finalState = runner.getState();
      setScanChecked(checked);
      setScanState(finalState);
      handleResultsChange([...map.values()], true);
      if (finalState === 'completed') {
        notify(`检测完成，共扫描 ${targets.length} 条书签`, 'success');
      }
    },
    [clearScanFlushTimer, handleResultsChange, notify, settings, whitelist],
  );

  const handlePauseScan = useCallback(() => {
    scanRunnerRef.current?.pause();
    setScanState('paused');
    handleResultsChange([...scanResultsMapRef.current.values()], true);
  }, [handleResultsChange]);

  const handleResumeScan = useCallback(() => {
    scanRunnerRef.current?.resume();
    setScanState('running');
  }, []);

  const handleStopScan = useCallback(() => {
    scanRunIdRef.current += 1;
    clearScanFlushTimer();
    scanRunnerRef.current?.stop();
    setScanState('stopped');
    handleResultsChange([...scanResultsMapRef.current.values()], true);
    notify('已停止检测并保存当前结果快照', 'info');
  }, [clearScanFlushTimer, handleResultsChange, notify]);

  const handleResetScan = useCallback(() => {
    scanRunIdRef.current += 1;
    clearScanFlushTimer();
    scanRunnerRef.current?.stop();
    scanResultsMapRef.current = new Map();
    setScanState('idle');
    setScanTotal(0);
    setScanChecked(0);
    handleResultsChange([], true);
  }, [clearScanFlushTimer, handleResultsChange]);

  const handleSaveSettings = async (next: ScanSettings) => {
    setSettings(next);
    await saveSettings(next);
    notify('检测设置已保存', 'success');
  };

  const handleDeleteBookmarks = async (
    items: BookmarkItem[],
    reason: string,
  ): Promise<string[]> => {
    // Re-verify live bookmark ID + URL before deleting to avoid stale-snapshot accidental deletes
    const latestTree = await loadBookmarkTree();
    const liveUrlMap = new Map(
      flattenBookmarkTree(latestTree).map((b) => [b.id, b.url]),
    );
    const verifiedItems = items.filter(
      (item) => liveUrlMap.get(item.id) === item.url,
    );
    const skippedCount = items.length - verifiedItems.length;

    if (verifiedItems.length === 0) {
      await refreshBookmarks();
      notify('待删除书签已变更或不存在，已跳过删除', 'info');
      return [];
    }

    try {
      const result = await safeDeleteBookmarks(verifiedItems, reason);
      setRecycleBin(result.entries);
      const actuallyGoneIds = [...result.deletedIds, ...result.missingIds];
      const removedSet = new Set(actuallyGoneIds);
      if (removedSet.size > 0) {
        setScanResults((prev) => {
          const next = prev.filter((r) => !removedSet.has(r.bookmark.id));
          void saveScanSnapshot(
            next.length > 0
              ? { savedAt: Date.now(), folderId: selectedFolderId, results: next }
              : null,
          );
          return next;
        });
      }
      await refreshBookmarks();

      if (result.failedIds.length > 0 && result.deletedIds.length === 0) {
        notify(
          `未能删除 ${result.failedIds.length} 条书签（可能受浏览器策略保护）`,
          'error',
        );
      } else if (result.failedIds.length > 0) {
        notify(
          `已清理 ${result.deletedIds.length} 条书签（已备份至回收站）；${result.failedIds.length} 条因浏览器拒绝删除未能清理`,
          'info',
        );
      } else if (result.deletedIds.length > 0) {
        notify(
          skippedCount > 0
            ? `已清理 ${result.deletedIds.length} 条书签（已备份至回收站；${skippedCount} 条因 URL 已变更被跳过）`
            : `已清理 ${result.deletedIds.length} 条书签（已备份至回收站）`,
          'success',
        );
      } else {
        notify('待删除书签已不存在', 'info');
      }

      return actuallyGoneIds;
    } catch (err) {
      notify(
        err instanceof RecycleBinCapacityError
          ? err.message
          : '清理失败，请稍后重试',
        'error',
      );
      return [];
    }
  };

  const handleAddWhitelist = async (
    pattern: string,
    matchType: 'url' | 'domain',
  ) => {
    const entry = createWhitelistEntry(pattern, matchType);
    if (!entry.pattern) {
      notify('请输入有效的域名或 URL', 'error');
      return;
    }
    const exists = whitelist.some(
      (e) => e.matchType === entry.matchType && e.pattern === entry.pattern,
    );
    if (exists) {
      notify('该规则已在白名单中', 'info');
      return;
    }
    const next = [entry, ...whitelist];
    setWhitelist(next);
    await saveWhitelist(next);
    notify('已加入白名单', 'success');
  };

  const handleRemoveWhitelist = async (id: string) => {
    const next = whitelist.filter((e) => e.id !== id);
    setWhitelist(next);
    await saveWhitelist(next);
    notify('已从白名单移除', 'info');
  };

  const handleRestoreEntries = async (items: RecycleBinEntry[]) => {
    const res = await restoreRecycleBinEntries(items.map((e) => e.id));
    setRecycleBin(res.entries);
    await refreshBookmarks();
    notify(`已还原 ${res.restoredIds.length} 条书签至原目录`, 'success');
  };

  const handleRemoveRecycleEntries = async (entryIds: string[]) => {
    const remaining = await removeRecycleBinEntries(entryIds);
    setRecycleBin(remaining);
    notify(`已从回收站移除 ${entryIds.length} 条记录`, 'info');
  };

  const handleClearRecycleBin = async () => {
    const cleared = await clearRecycleBin();
    setRecycleBin(cleared);
    notify('回收站已清空', 'info');
  };

  const handleExportBackup = () => {
    triggerBookmarkHtmlDownload(roots);
    notify('已导出标准浏览器书签 HTML 备份文件', 'success');
  };

  const tabs: Array<{
    key: TabKey;
    label: string;
    icon: typeof Radar;
    badge?: number;
  }> = [
    { key: 'scanner', label: '失效检测', icon: Radar, badge: issueCount },
    {
      key: 'all_bookmarks',
      label: '全部书签',
      icon: Bookmark,
      badge: bookmarks.length,
    },
    { key: 'duplicates', label: '重复书签', icon: Copy, badge: duplicateCount },
    {
      key: 'folders',
      label: '空文件夹',
      icon: FolderOpen,
      badge: emptyFolders.length,
    },
    {
      key: 'whitelist',
      label: '白名单',
      icon: ShieldCheck,
      badge: whitelist.length,
    },
    {
      key: 'recycle',
      label: '回收站',
      icon: ArchiveRestore,
      badge: recycleBin.length,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-16 transition-colors">
      <Header
        totalBookmarks={bookmarks.length}
        themeMode={themeMode}
        onCycleTheme={() => void handleCycleTheme()}
        onExportBackup={handleExportBackup}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefreshBookmarks={async () => {
          await refreshBookmarks();
          notify('已重新同步浏览器书签', 'info');
        }}
      />

      <main className="mx-auto max-w-7xl px-6 pt-6">
        {/* Navigation Tabs */}
        <nav className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {activeTab === 'scanner' && (
          <ScannerTab
            roots={roots}
            bookmarks={bookmarks}
            folders={folders}
            settings={settings}
            whitelist={whitelist}
            results={scanResults}
            scanState={scanState}
            scanTotal={scanTotal}
            scanChecked={scanChecked}
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
            onStartScan={handleStartScan}
            onPauseScan={handlePauseScan}
            onResumeScan={handleResumeScan}
            onStopScan={handleStopScan}
            onResetScan={handleResetScan}
            onResultsChange={handleResultsChange}
            onDeleteBookmarks={handleDeleteBookmarks}
            onAddWhitelist={handleAddWhitelist}
            onNotify={notify}
            onBookmarksUpdated={async () => {
              await refreshBookmarks();
            }}
          />
        )}

        {activeTab === 'all_bookmarks' && (
          <AllBookmarksTab
            roots={roots}
            bookmarks={bookmarks}
            folders={folders}
            scanResults={scanResults}
            whitelist={whitelist}
            onDeleteBookmarks={handleDeleteBookmarks}
            onAddWhitelist={handleAddWhitelist}
            onBookmarksUpdated={async () => {
              await refreshBookmarks();
            }}
            onNotify={notify}
          />
        )}

        {activeTab === 'duplicates' && (
          <DuplicatesTab
            bookmarks={bookmarks}
            onDeleteBookmarks={handleDeleteBookmarks}
            onNotify={notify}
          />
        )}

        {activeTab === 'folders' && (
          <EmptyFoldersTab
            emptyFolders={emptyFolders}
            onRefresh={async () => {
              await refreshBookmarks();
            }}
            onNotify={notify}
          />
        )}

        {activeTab === 'whitelist' && (
          <WhitelistTab
            entries={whitelist}
            onAdd={handleAddWhitelist}
            onRemove={handleRemoveWhitelist}
          />
        )}

        {activeTab === 'recycle' && (
          <RecycleBinTab
            entries={recycleBin}
            onRestore={handleRestoreEntries}
            onRemoveEntries={handleRemoveRecycleEntries}
            onClearAll={handleClearRecycleBin}
          />
        )}
      </main>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
        onClose={() => setSettingsOpen(false)}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
              toast.type === 'success'
                ? 'bg-emerald-600'
                : toast.type === 'error'
                  ? 'bg-rose-600'
                  : 'bg-slate-800 dark:bg-slate-700'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
