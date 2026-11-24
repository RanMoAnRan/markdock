import { useMemo, useState } from 'react';
import { ArchiveRestore, ExternalLink, RotateCcw, Search, Trash2 } from 'lucide-react';
import type { RecycleBinEntry } from '../types/bookmark';
import { ConfirmDialog } from './ConfirmDialog';

interface RecycleBinTabProps {
  entries: RecycleBinEntry[];
  onRestore: (items: RecycleBinEntry[]) => Promise<void>;
  onRemoveEntries: (entryIds: string[]) => Promise<void>;
  onClearAll: () => Promise<void>;
}

export function RecycleBinTab({
  entries,
  onRestore,
  onRemoveEntries,
  onClearAll,
}: RecycleBinTabProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.url.toLowerCase().includes(q) ||
        e.folderPath.join(' / ').toLowerCase().includes(q) ||
        e.reason.toLowerCase().includes(q),
    );
  }, [entries, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedEntries = useMemo(
    () => filteredEntries.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredEntries, safePage, pageSize],
  );

  const allPageSelected =
    pagedEntries.length > 0 &&
    pagedEntries.every((e) => selectedIds.has(e.id));

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const e of pagedEntries) next.delete(e.id);
      } else {
        for (const e of pagedEntries) next.add(e.id);
      }
      return next;
    });
  };

  const handleBatchRestore = async () => {
    const targets = entries.filter((e) => selectedIds.has(e.id));
    if (targets.length === 0) return;
    await onRestore(targets);
    setSelectedIds(new Set());
  };

  const handleBatchPermanentDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    await onRemoveEntries(ids);
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            本地回收站（共 {entries.length} 条备份记录）
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            所有通过本插件删除的书签都会先保存在这里（最多保留最近 2000 条），可一键还原回原文件夹。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="搜索标题、链接、目录或原因..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1.5 pl-9 pr-3 text-xs text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
            />
          </div>

          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={() => void handleBatchRestore()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>还原选中 ({selectedIds.size})</span>
          </button>

          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={() => void handleBatchPermanentDelete()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-rose-200 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>移除选中 ({selectedIds.size})</span>
          </button>

          <button
            type="button"
            disabled={entries.length === 0}
            onClick={() => setConfirmClearOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>清空回收站</span>
          </button>
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-16 text-center text-slate-400 dark:text-slate-500">
          <ArchiveRestore className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm">
            {entries.length === 0 ? '回收站目前是空的。' : '没有找到匹配的回收站记录。'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 px-5 py-2.5 text-xs text-slate-600 dark:text-slate-300">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allPageSelected}
                onChange={toggleSelectPage}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>全选当前页 ({pagedEntries.length})</span>
            </label>
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                取消选择
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pagedEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(entry.id)}
                    onChange={() => toggle(entry.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {entry.title}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>原目录：{entry.folderPath.join(' / ') || '根目录'}</span>
                      <span>原因：{entry.reason}</span>
                      <span>
                        删除于：{new Date(entry.deletedAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline max-w-xl truncate"
                    >
                      <span className="truncate">{entry.url}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void onRestore([entry])}
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>还原</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onRemoveEntries([entry.id])}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-400 hover:border-rose-200 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                    title="从回收站彻底移除此条"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filteredEntries.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <span>共 {filteredEntries.length} 条</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
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
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
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
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmClearOpen}
        title="确定清空回收站？"
        description="清空后将无法再通过本插件恢复已删除的书签记录（不影响浏览器现有书签）。"
        confirmText="确认清空"
        onConfirm={async () => {
          setConfirmClearOpen(false);
          await onClearAll();
          setSelectedIds(new Set());
        }}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
}
