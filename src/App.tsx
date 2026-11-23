import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { DEFAULT_SCAN_SETTINGS } from './core/checker';
import { findDuplicateGroups } from './core/duplicates';
import { findEmptyFolders } from './core/folders';
import { triggerBookmarkHtmlDownload } from './core/exporter';
import {
  restoreRecycleBinEntry,
  safeDeleteBookmarks,
} from './core/recycleBin';
import {
  loadRecycleBin,
  loadScanSnapshot,
  loadSettings,
  loadWhitelist,
  reconcileSnapshot,
  saveRecycleBin,
  saveScanSnapshot,
  saveSettings,
  saveWhitelist,
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
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

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

  const refreshBookmarks = useCallback(async () => {
    const tree = await loadBookmarkTree();
    setRoots(tree);
    const liveIds = new Set(flattenBookmarkTree(tree).map((b) => b.id));
    setScanResults((prev) => {
      if (prev.length === 0) return prev;
      const filtered = prev.filter((r) => liveIds.has(r.bookmark.id));
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
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const [tree, loadedSettings, loadedWhitelist, loadedBin, loadedSnapshot] =
        await Promise.all([
          loadBookmarkTree(),
          loadSettings(),
          loadWhitelist(),
          loadRecycleBin(),
          loadScanSnapshot(),
        ]);

      setRoots(tree);
      setSettings(loadedSettings);
      setWhitelist(loadedWhitelist);
      setRecycleBin(loadedBin);

      if (loadedSnapshot) {
        const liveIds = new Set(flattenBookmarkTree(tree).map((b) => b.id));
        const reconciled = reconcileSnapshot(loadedSnapshot, liveIds);
        setSelectedFolderId(reconciled.folderId || 'all');
        setScanResults(reconciled.results);
      }
    })();
  }, []);

  const bookmarks = useMemo(() => flattenBookmarkTree(roots), [roots]);
  const folders = useMemo(() => extractFolders(roots), [roots]);
  const emptyFolders = useMemo(() => findEmptyFolders(roots), [roots]);
  const duplicateCount = useMemo(
    () =>
      findDuplicateGroups(bookmarks, 'normalized').reduce(
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

  const handleSaveSettings = async (next: ScanSettings) => {
    setSettings(next);
    await saveSettings(next);
    notify('检测设置已保存', 'success');
  };

  const handleDeleteBookmarks = async (
    items: BookmarkItem[],
    reason: string,
  ) => {
    const updatedBin = await safeDeleteBookmarks(items, reason);
    setRecycleBin(updatedBin);
    const removedSet = new Set(items.map((i) => i.id));
    setScanResults((prev) => {
      const next = prev.filter((r) => !removedSet.has(r.bookmark.id));
      void saveScanSnapshot(
        next.length > 0
          ? { savedAt: Date.now(), folderId: selectedFolderId, results: next }
          : null,
      );
      return next;
    });
    await refreshBookmarks();
    notify(`已清理 ${items.length} 条书签（已备份至回收站）`, 'success');
  };

  const handleAddWhitelist = async (
    pattern: string,
    matchType: 'url' | 'domain',
  ) => {
    const entry = createWhitelistEntry(pattern, matchType);
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
    let restored = 0;
    const restoredIds = new Set<string>();
    for (const entry of items) {
      try {
        await restoreRecycleBinEntry(entry);
        restoredIds.add(entry.id);
        restored++;
      } catch {
        // Continue restoring remaining items
      }
    }
    const remaining = recycleBin.filter((e) => !restoredIds.has(e.id));
    setRecycleBin(remaining);
    await saveRecycleBin(remaining);
    await refreshBookmarks();
    notify(`已还原 ${restored} 条书签至原目录`, 'success');
  };

  const handleClearRecycleBin = async () => {
    setRecycleBin([]);
    await saveRecycleBin([]);
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
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      <Header
        totalBookmarks={bookmarks.length}
        onExportBackup={handleExportBackup}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefreshBookmarks={async () => {
          await refreshBookmarks();
          notify('已重新同步浏览器书签', 'info');
        }}
      />

      <main className="mx-auto max-w-7xl px-6 pt-6">
        {/* Navigation Tabs */}
        <nav className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
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
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-700'
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
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
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
                  : 'bg-slate-800'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
