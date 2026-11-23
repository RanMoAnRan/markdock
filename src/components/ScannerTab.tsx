import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  BookmarkItem,
  CheckResult,
  CheckStatus,
  FolderNode,
  ScanSettings,
  WhitelistEntry,
} from '../types/bookmark';
import { ScanRunner, checkSingleBookmark } from '../core/checker';
import { filterBookmarksByFolder, updateBookmarkUrl } from '../core/bookmarks';
import { ConfirmDialog } from './ConfirmDialog';

type FilterBucket = 'all_issues' | CheckStatus;

interface ScannerTabProps {
  roots: chrome.bookmarks.BookmarkTreeNode[];
  bookmarks: BookmarkItem[];
  folders: FolderNode[];
  settings: ScanSettings;
  whitelist: WhitelistEntry[];
  results: CheckResult[];
  selectedFolderId: string;
  onSelectFolder: (folderId: string) => void;
  onResultsChange: (next: CheckResult[], persist?: boolean) => void;
  onDeleteBookmarks: (items: BookmarkItem[], reason: string) => Promise<void>;
  onAddWhitelist: (pattern: string, matchType: 'url' | 'domain') => Promise<void>;
  onNotify: (message: string, type?: 'success' | 'info' | 'error') => void;
  onBookmarksUpdated: () => Promise<void>;
}

const BUCKET_META: Array<{
  key: FilterBucket;
  label: string;
  shortDesc: string;
  colorClass: string;
  activeRing: string;
}> = [
  {
    key: 'all_issues',
    label: '全部异常',
    shortDesc: '不含有效与跳过',
    colorClass: 'text-slate-800 bg-slate-100',
    activeRing: 'ring-2 ring-slate-800 border-slate-800',
  },
  {
    key: 'dead_404',
    label: '确定失效 (404)',
    shortDesc: '404 / 410',
    colorClass: 'text-rose-700 bg-rose-50',
    activeRing: 'ring-2 ring-rose-500 border-rose-500',
  },
  {
    key: 'dns_network',
    label: '连接 / DNS 失败',
    shortDesc: '域名死链或断连',
    colorClass: 'text-red-700 bg-red-50',
    activeRing: 'ring-2 ring-red-500 border-red-500',
  },
  {
    key: 'timeout',
    label: '请求超时',
    shortDesc: '可单独重试',
    colorClass: 'text-amber-700 bg-amber-50',
    activeRing: 'ring-2 ring-amber-500 border-amber-500',
  },
  {
    key: 'server_5xx',
    label: '服务器错误 (5xx)',
    shortDesc: '站点临时故障',
    colorClass: 'text-orange-700 bg-orange-50',
    activeRing: 'ring-2 ring-orange-500 border-orange-500',
  },
  {
    key: 'redirect',
    label: '链接重定向',
    shortDesc: '可一键更新地址',
    colorClass: 'text-blue-700 bg-blue-50',
    activeRing: 'ring-2 ring-blue-500 border-blue-500',
  },
  {
    key: 'restricted',
    label: '受限 / 人机验证',
    shortDesc: '防误杀保护中',
    colorClass: 'text-purple-700 bg-purple-50',
    activeRing: 'ring-2 ring-purple-500 border-purple-500',
  },
  {
    key: 'valid',
    label: '正常有效',
    shortDesc: 'HTTP 2xx',
    colorClass: 'text-emerald-700 bg-emerald-50',
    activeRing: 'ring-2 ring-emerald-500 border-emerald-500',
  },
  {
    key: 'skipped',
    label: '已跳过',
    shortDesc: '本地/白名单',
    colorClass: 'text-slate-600 bg-slate-100',
    activeRing: 'ring-2 ring-slate-400 border-slate-400',
  },
];

function StatusBadge({ result }: { result: CheckResult }) {
  switch (result.status) {
    case 'dead_404':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 border border-rose-200/70">
          <AlertCircle className="h-3.5 w-3.5" />
          确定失效 {result.httpStatus ?? 404}
        </span>
      );
    case 'dns_network':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 border border-red-200/70">
          <WifiOff className="h-3.5 w-3.5" />
          连接 / DNS 失败
        </span>
      );
    case 'timeout':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 border border-amber-200/70">
          <Clock className="h-3.5 w-3.5" />
          请求超时
        </span>
      );
    case 'server_5xx':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 border border-orange-200/70">
          <AlertCircle className="h-3.5 w-3.5" />
          服务器错误 {result.httpStatus}
        </span>
      );
    case 'client_4xx':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-200/70">
          <AlertCircle className="h-3.5 w-3.5" />
          请求异常 {result.httpStatus}
        </span>
      );
    case 'redirect':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-200/70">
          <ArrowRight className="h-3.5 w-3.5" />
          {result.redirectSubType === 'http_to_https'
            ? 'HTTPS 升级'
            : result.redirectSubType === 'same_origin'
              ? '同域跳转'
              : '跨域跳转'}
        </span>
      );
    case 'restricted':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 border border-purple-200/70">
          <ShieldAlert className="h-3.5 w-3.5" />
          {result.restrictedSubType === 'bot_challenge'
            ? '人机验证 / WAF'
            : '需登录 / 受限'}
        </span>
      );
    case 'valid':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200/70">
          <CheckCircle2 className="h-3.5 w-3.5" />
          有效
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          已跳过
        </span>
      );
  }
}

export function ScannerTab({
  roots,
  bookmarks,
  folders,
  settings,
  whitelist,
  results,
  selectedFolderId,
  onSelectFolder,
  onResultsChange,
  onDeleteBookmarks,
  onAddWhitelist,
  onNotify,
  onBookmarksUpdated,
}: ScannerTabProps) {
  const runnerRef = useRef<ScanRunner | null>(null);
  const resultsMapRef = useRef<Map<string, CheckResult>>(new Map());

  const [scanState, setScanState] = useState<'idle' | 'running' | 'paused' | 'stopped' | 'completed'>('idle');
  const [scanTotal, setScanTotal] = useState(0);
  const [scanChecked, setScanChecked] = useState(0);

  const [activeBucket, setActiveBucket] = useState<FilterBucket>('all_issues');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState('');
  const [recheckingId, setRecheckingId] = useState<string | null>(null);

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: '', description: '', onConfirm: () => {} });

  const scopedBookmarks = useMemo(
    () => filterBookmarksByFolder(bookmarks, roots, selectedFolderId),
    [bookmarks, roots, selectedFolderId],
  );

  const counts = useMemo(() => {
    const map: Record<FilterBucket, number> = {
      all_issues: 0,
      dead_404: 0,
      dns_network: 0,
      timeout: 0,
      server_5xx: 0,
      client_4xx: 0,
      redirect: 0,
      restricted: 0,
      valid: 0,
      skipped: 0,
    };
    for (const r of results) {
      map[r.status] = (map[r.status] ?? 0) + 1;
      if (r.status !== 'valid' && r.status !== 'skipped') {
        map.all_issues++;
      }
    }
    return map;
  }, [results]);

  const filteredResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return results.filter((r) => {
      const bucketMatch =
        activeBucket === 'all_issues'
          ? r.status !== 'valid' && r.status !== 'skipped'
          : r.status === activeBucket;
      if (!bucketMatch) return false;
      if (!q) return true;
      return (
        r.bookmark.title.toLowerCase().includes(q) ||
        r.bookmark.url.toLowerCase().includes(q) ||
        r.bookmark.folderPath.join(' / ').toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
      );
    });
  }, [results, activeBucket, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedResults = useMemo(
    () => filteredResults.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredResults, safePage, pageSize],
  );

  const confirmedDeadItems = useMemo(
    () =>
      results
        .filter((r) => r.status === 'dead_404' || r.status === 'dns_network')
        .map((r) => r.bookmark),
    [results],
  );

  const activeBucketMeta = useMemo(
    () => BUCKET_META.find((b) => b.key === activeBucket),
    [activeBucket],
  );

  const canBatchDeleteCurrentBucket =
    activeBucket !== 'all_issues' &&
    activeBucket !== 'valid' &&
    activeBucket !== 'skipped';

  const currentBucketAllItems = useMemo(
    () =>
      results
        .filter((r) =>
          activeBucket === 'all_issues'
            ? r.status !== 'valid' && r.status !== 'skipped'
            : r.status === activeBucket,
        )
        .map((r) => r.bookmark),
    [results, activeBucket],
  );

  const currentBucketItems = useMemo(
    () =>
      canBatchDeleteCurrentBucket ? currentBucketAllItems : [],
    [currentBucketAllItems, canBatchDeleteCurrentBucket],
  );

  const retryableItems = useMemo(
    () =>
      results
        .filter(
          (r) =>
            r.status === 'timeout' ||
            r.status === 'dns_network' ||
            r.status === 'server_5xx',
        )
        .map((r) => r.bookmark),
    [results],
  );

  const selectedRedirects = useMemo(
    () =>
      results.filter(
        (r) =>
          selectedIds.has(r.bookmark.id) &&
          r.status === 'redirect' &&
          Boolean(r.finalUrl),
      ),
    [results, selectedIds],
  );

  const runBatchScan = async (targets: BookmarkItem[], preserveExisting: boolean) => {
    if (targets.length === 0) {
      onNotify('当前范围内没有可检测的书签', 'info');
      return;
    }

    const runner = new ScanRunner();
    runnerRef.current = runner;
    setScanState('running');
    setScanTotal(targets.length);
    setScanChecked(0);

    const map = new Map<string, CheckResult>();
    if (preserveExisting) {
      for (const r of results) {
        map.set(r.bookmark.id, r);
      }
    }
    resultsMapRef.current = map;

    if (!preserveExisting) {
      setSelectedIds(new Set());
      onResultsChange([], false);
    }

    let checked = 0;
    await runner.start(targets, settings, whitelist, (res) => {
      checked++;
      map.set(res.bookmark.id, res);
      setScanChecked(checked);
      onResultsChange([...map.values()], false);
    });

    const finalState = runner.getState();
    setScanState(finalState);
    onResultsChange([...map.values()], true);
    if (finalState === 'completed') {
      onNotify(`检测完成，共扫描 ${targets.length} 条书签`, 'success');
    }
  };

  const handlePause = () => {
    runnerRef.current?.pause();
    setScanState('paused');
  };

  const handleResume = () => {
    runnerRef.current?.resume();
    setScanState('running');
  };

  const handleStop = () => {
    runnerRef.current?.stop();
    setScanState('stopped');
    onResultsChange([...resultsMapRef.current.values()], true);
    onNotify('已停止检测并保存当前结果快照', 'info');
  };

  const handleReset = () => {
    runnerRef.current?.stop();
    setScanState('idle');
    setScanTotal(0);
    setScanChecked(0);
    setSelectedIds(new Set());
    onResultsChange([], true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allPageSelected =
    pagedResults.length > 0 &&
    pagedResults.every((r) => selectedIds.has(r.bookmark.id));

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const r of pagedResults) next.delete(r.bookmark.id);
      } else {
        for (const r of pagedResults) next.add(r.bookmark.id);
      }
      return next;
    });
  };

  const performDelete = async (items: BookmarkItem[], reason: string) => {
    await onDeleteBookmarks(items, reason);
    const removedSet = new Set(items.map((i) => i.id));
    onResultsChange(
      results.filter((r) => !removedSet.has(r.bookmark.id)),
      true,
    );
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of removedSet) next.delete(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    const items = results
      .filter((r) => selectedIds.has(r.bookmark.id))
      .map((r) => r.bookmark);
    if (items.length === 0) return;

    setConfirmState({
      open: true,
      title: `确定清理选中的 ${items.length} 条书签？`,
      description:
        '删除前会自动备份到本地「回收站」，你可以随时一键还原回原文件夹。',
      onConfirm: async () => {
        setConfirmState((s) => ({ ...s, open: false }));
        await performDelete(items, '批量勾选清理');
      },
    });
  };

  const handleCleanConfirmedDead = () => {
    if (confirmedDeadItems.length === 0) return;
    setConfirmState({
      open: true,
      title: `一键清理 ${confirmedDeadItems.length} 条确定失效书签？`,
      description:
        '仅清理「确定失效 (404/410)」与「连接/DNS 失败」书签。\n「受限/人机验证」「超时」「重定向」不会被删除，且所有已删项均会进入本地回收站。',
      onConfirm: async () => {
        setConfirmState((s) => ({ ...s, open: false }));
        await performDelete(confirmedDeadItems, '一键清理确定失效');
      },
    });
  };

  const handleDeleteCurrentBucket = () => {
    if (currentBucketItems.length === 0 || !activeBucketMeta) return;
    const extraWarn =
      activeBucket === 'restricted'
        ? '\n注意：该分类包含人机验证、403 防爬或需登录站点，可能并非真正失效，请确认后再清理。'
        : '';
    setConfirmState({
      open: true,
      title: `一键删除全部「${activeBucketMeta.label}」(${currentBucketItems.length} 条)？`,
      description: `将删除当前分类下的所有 ${currentBucketItems.length} 条书签。\n所有已删除书签均会先备份到本地「回收站」，可随时一键还原。${extraWarn}`,
      onConfirm: async () => {
        setConfirmState((s) => ({ ...s, open: false }));
        await performDelete(
          currentBucketItems,
          `按类型一键清理：${activeBucketMeta.label}`,
        );
      },
    });
  };

  const handleUpdateRedirect = async (targets: CheckResult[]) => {
    let updatedCount = 0;
    const updatedMap = new Map(results.map((r) => [r.bookmark.id, r]));

    for (const item of targets) {
      if (!item.finalUrl) continue;
      await updateBookmarkUrl(item.bookmark.id, item.finalUrl);
      updatedMap.set(item.bookmark.id, {
        ...item,
        bookmark: { ...item.bookmark, url: item.finalUrl },
        status: 'valid',
        reason: '已更新为重定向目标地址',
        finalUrl: undefined,
        redirectSubType: undefined,
        checkedAt: Date.now(),
      });
      updatedCount++;
    }

    onResultsChange([...updatedMap.values()], true);
    await onBookmarksUpdated();
    onNotify(`已更新 ${updatedCount} 条重定向书签为新地址`, 'success');
  };

  const handleSingleRecheck = async (item: BookmarkItem) => {
    setRecheckingId(item.id);
    try {
      const fresh = await checkSingleBookmark(item, settings, whitelist);
      onResultsChange(
        results.map((r) => (r.bookmark.id === item.id ? fresh : r)),
        true,
      );
      onNotify(`已重新检测：${fresh.reason}`, 'info');
    } finally {
      setRecheckingId(null);
    }
  };

  const handleSaveInlineUrl = async (item: BookmarkItem) => {
    const nextUrl = editingUrl.trim();
    if (!nextUrl) {
      onNotify('链接不能为空', 'error');
      return;
    }
    setEditingId(null);
    setRecheckingId(item.id);
    try {
      await updateBookmarkUrl(item.id, nextUrl);
      const updatedBookmark = { ...item, url: nextUrl };
      const fresh = await checkSingleBookmark(updatedBookmark, settings, whitelist);
      onResultsChange(
        results.map((r) => (r.bookmark.id === item.id ? fresh : r)),
        true,
      );
      await onBookmarksUpdated();
      onNotify(`已更新并重测：${fresh.reason}`, fresh.status === 'valid' ? 'success' : 'info');
    } finally {
      setRecheckingId(null);
    }
  };

  const handleIgnoreToWhitelist = async (result: CheckResult) => {
    await onAddWhitelist(result.bookmark.url, 'url');
    onResultsChange(
      results.map((r) =>
        r.bookmark.id === result.bookmark.id
          ? { ...r, status: 'skipped', reason: '已加入白名单' }
          : r,
      ),
      true,
    );
  };

  const progressPct =
    scanTotal > 0 ? Math.min(100, Math.round((scanChecked / scanTotal) * 100)) : 0;

  return (
    <div className="space-y-5">
      {/* Control Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-slate-700">扫描范围</label>
            <select
              value={selectedFolderId}
              disabled={scanState === 'running' || scanState === 'paused'}
              onChange={(e) => onSelectFolder(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none min-w-[220px]"
            >
              <option value="all">全部书签 ({bookmarks.length})</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.path.join(' / ')} ({folder.bookmarkCount})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {scanState !== 'running' && scanState !== 'paused' && (
              <button
                type="button"
                onClick={() => runBatchScan(scopedBookmarks, false)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-blue-700 transition-colors cursor-pointer"
              >
                <Play className="h-4 w-4" />
                <span>开始检测 ({scopedBookmarks.length})</span>
              </button>
            )}

            {scanState === 'running' && (
              <button
                type="button"
                onClick={handlePause}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors cursor-pointer"
              >
                <Pause className="h-4 w-4" />
                <span>暂停</span>
              </button>
            )}

            {scanState === 'paused' && (
              <button
                type="button"
                onClick={handleResume}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer"
              >
                <Play className="h-4 w-4" />
                <span>继续检测</span>
              </button>
            )}

            {(scanState === 'running' || scanState === 'paused') && (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
              >
                <Square className="h-3.5 w-3.5" />
                <span>停止</span>
              </button>
            )}

            {results.length > 0 && scanState !== 'running' && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>清空结果</span>
              </button>
            )}
          </div>
        </div>

        {(scanState === 'running' || scanState === 'paused' || scanTotal > 0) && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
              <span>
                {scanState === 'running'
                  ? '正在检测中...'
                  : scanState === 'paused'
                    ? '检测已暂停'
                    : scanState === 'stopped'
                      ? '已手动停止'
                      : '检测完成'}
              </span>
              <span className="font-medium tabular-nums">
                {scanChecked} / {scanTotal} ({progressPct}%)
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  scanState === 'paused' ? 'bg-amber-500' : 'bg-blue-600'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Category Summary Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2.5">
        {BUCKET_META.map((bucket) => {
          const isActive = activeBucket === bucket.key;
          const count = counts[bucket.key] ?? 0;
          return (
            <button
              key={bucket.key}
              type="button"
              onClick={() => {
                setActiveBucket(bucket.key);
                setPage(1);
              }}
              className={`flex flex-col items-start rounded-xl border bg-white p-3 text-left transition-all cursor-pointer hover:shadow-xs ${
                isActive ? bucket.activeRing : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <span className="text-xs font-medium text-slate-500 truncate w-full">
                {bucket.label}
              </span>
              <span className={`mt-1.5 inline-flex rounded-md px-2 py-0.5 text-lg font-bold tabular-nums ${bucket.colorClass}`}>
                {count}
              </span>
              <span className="mt-1 text-[11px] text-slate-400 truncate w-full">
                {bucket.shortDesc}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bulk Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="搜索标题、链接、文件夹路径或错误原因..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentBucketAllItems.length > 0 &&
            activeBucketMeta &&
            scanState !== 'running' &&
            scanState !== 'paused' && (
              <button
                type="button"
                onClick={() => runBatchScan(currentBucketAllItems, true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                title={`重新检测「${activeBucketMeta.label}」下的全部书签`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>重测本类型 ({currentBucketAllItems.length})</span>
              </button>
            )}

          {activeBucket === 'all_issues' &&
            retryableItems.length > 0 &&
            scanState !== 'running' &&
            scanState !== 'paused' && (
              <button
                type="button"
                onClick={() => runBatchScan(retryableItems, true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>重试超时/网络异常 ({retryableItems.length})</span>
              </button>
            )}

          {selectedRedirects.length > 0 && (
            <button
              type="button"
              onClick={() => handleUpdateRedirect(selectedRedirects)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              <span>一键更新选中重定向 ({selectedRedirects.length})</span>
            </button>
          )}

          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={handleDeleteSelected}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>清理选中 ({selectedIds.size})</span>
          </button>

          {canBatchDeleteCurrentBucket && activeBucketMeta && (
            <button
              type="button"
              disabled={currentBucketItems.length === 0}
              onClick={handleDeleteCurrentBucket}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title={`一键删除当前选中分类「${activeBucketMeta.label}」下的全部书签`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>
                一键删除本类型 ({currentBucketItems.length})
              </span>
            </button>
          )}

          <button
            type="button"
            disabled={confirmedDeadItems.length === 0}
            onClick={handleCleanConfirmedDead}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="仅清理 404/410 和 DNS/连接失败，绝不误删人机验证/受限链接"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>一键清理确定失效 ({confirmedDeadItems.length})</span>
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                <th className="w-12 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectPage}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    aria-label="全选当前页"
                  />
                </th>
                <th className="px-4 py-3 min-w-[220px]">书签与目录路径</th>
                <th className="px-4 py-3 min-w-[280px]">链接地址</th>
                <th className="px-4 py-3 min-w-[220px]">检测状态与原因</th>
                <th className="px-4 py-3 text-right min-w-[150px]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {pagedResults.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                    {results.length === 0
                      ? '点击上方「开始检测」扫描你的书签，结果将按错误类型自动分类展示。'
                      : '当前筛选条件下没有匹配的书签。'}
                  </td>
                </tr>
              ) : (
                pagedResults.map((result) => {
                  const { bookmark } = result;
                  const isEditing = editingId === bookmark.id;
                  const isRechecking = recheckingId === bookmark.id;

                  return (
                    <tr
                      key={bookmark.id}
                      className="hover:bg-slate-50/70 transition-colors align-top"
                    >
                      <td className="px-4 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(bookmark.id)}
                          onChange={() => toggleSelect(bookmark.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-900 line-clamp-1">
                          {bookmark.title}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400 line-clamp-1">
                          {bookmark.folderPath.join(' / ') || '根目录'}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 max-w-md">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="url"
                              value={editingUrl}
                              autoFocus
                              onChange={(e) => setEditingUrl(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveInlineUrl(bookmark);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="w-full rounded-md border border-blue-400 px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveInlineUrl(bookmark)}
                              className="rounded-md bg-blue-600 p-1.5 text-white hover:bg-blue-700 cursor-pointer"
                              title="保存并重新检测"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
                              title="取消"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <a
                                href={bookmark.url}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate text-xs text-blue-600 hover:underline max-w-[320px]"
                                title={bookmark.url}
                              >
                                {bookmark.url}
                              </a>
                              <a
                                href={bookmark.url}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 text-slate-400 hover:text-blue-600"
                                title="在新标签页打开核对"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(bookmark.id);
                                  setEditingUrl(bookmark.url);
                                }}
                                className="shrink-0 text-slate-400 hover:text-slate-700 cursor-pointer"
                                title="编辑链接（回车保存并重测）"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {result.finalUrl && result.finalUrl !== bookmark.url && (
                              <div className="flex items-center gap-1 text-[11px] text-slate-500 truncate max-w-[360px]">
                                <ArrowRight className="h-3 w-3 shrink-0 text-blue-500" />
                                <span className="truncate" title={result.finalUrl}>
                                  {result.finalUrl}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge result={result} />
                        <div className="mt-1 text-xs text-slate-500 line-clamp-2">
                          {result.reason}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {result.status === 'redirect' && result.finalUrl && (
                            <button
                              type="button"
                              onClick={() => handleUpdateRedirect([result])}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 cursor-pointer"
                              title="将书签更新为目标新地址"
                            >
                              更新
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isRechecking}
                            onClick={() => handleSingleRecheck(bookmark)}
                            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 cursor-pointer"
                            title="重新检测此条"
                          >
                            <RotateCcw
                              className={`h-3.5 w-3.5 ${isRechecking ? 'animate-spin' : ''}`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleIgnoreToWhitelist(result)}
                            className="rounded-lg border border-emerald-200 p-1.5 text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                            title="忽略并加入白名单"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmState({
                                open: true,
                                title: '确定删除该书签？',
                                description: `${bookmark.title}\n${bookmark.url}\n\n删除后会存入本地回收站，可随时还原。`,
                                onConfirm: async () => {
                                  setConfirmState((s) => ({ ...s, open: false }));
                                  await performDelete([bookmark], result.reason);
                                },
                              })
                            }
                            className="rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="删除到回收站"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredResults.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>共 {filteredResults.length} 条</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <option value={20}>20 条/页</option>
                <option value={50}>50 条/页</option>
                <option value={100}>100 条/页</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                上一页
              </button>
              <span className="tabular-nums">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmText="确认清理"
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}
