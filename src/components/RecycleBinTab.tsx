import { useState } from 'react';
import { ArchiveRestore, ExternalLink, RotateCcw, Trash2 } from 'lucide-react';
import type { RecycleBinEntry } from '../types/bookmark';
import { ConfirmDialog } from './ConfirmDialog';

interface RecycleBinTabProps {
  entries: RecycleBinEntry[];
  onRestore: (items: RecycleBinEntry[]) => Promise<void>;
  onClearAll: () => Promise<void>;
}

export function RecycleBinTab({
  entries,
  onRestore,
  onClearAll,
}: RecycleBinTabProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchRestore = async () => {
    const targets = entries.filter((e) => selectedIds.has(e.id));
    if (targets.length === 0) return;
    await onRestore(targets);
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            本地回收站（共 {entries.length} 条备份记录）
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            所有通过本插件删除的书签都会先保存在这里（最多保留最近 2000 条），可一键还原回原文件夹。
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={handleBatchRestore}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>还原选中 ({selectedIds.size})</span>
          </button>
          <button
            type="button"
            disabled={entries.length === 0}
            onClick={() => setConfirmClearOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>清空回收站</span>
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-400">
          <ArchiveRestore className="mx-auto h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm">回收站目前是空的。</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs divide-y divide-slate-100">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50/70"
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={selectedIds.has(entry.id)}
                  onChange={() => toggle(entry.id)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {entry.title}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
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
                    className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline max-w-xl truncate"
                  >
                    <span className="truncate">{entry.url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRestore([entry])}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>还原</span>
              </button>
            </div>
          ))}
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
