import { useMemo, useState } from 'react';
import { Copy, ExternalLink, Trash2 } from 'lucide-react';
import type { BookmarkItem } from '../types/bookmark';
import { findDuplicateGroups } from '../core/duplicates';
import { ConfirmDialog } from './ConfirmDialog';

interface DuplicatesTabProps {
  bookmarks: BookmarkItem[];
  onDeleteBookmarks: (items: BookmarkItem[], reason: string) => Promise<void>;
}

export function DuplicatesTab({
  bookmarks,
  onDeleteBookmarks,
}: DuplicatesTabProps) {
  const [mode, setMode] = useState<'normalized' | 'exact'>('normalized');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const groups = useMemo(
    () => findDuplicateGroups(bookmarks, mode),
    [bookmarks, mode],
  );

  const removableItems = useMemo(
    () => groups.flatMap((g) => g.items.slice(1)),
    [groups],
  );

  const formatDate = (ts?: number) => {
    if (!ts) return '未知时间';
    return new Date(ts).toLocaleDateString('zh-CN');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode('normalized')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                mode === 'normalized'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              规范化匹配（推荐）
            </button>
            <button
              type="button"
              onClick={() => setMode('exact')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                mode === 'exact'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              严格 URL 相同
            </button>
          </div>
          <span className="text-xs text-slate-500">
            发现 <strong className="text-slate-800">{groups.length}</strong> 组重复（可清理{' '}
            <strong className="text-rose-600">{removableItems.length}</strong> 条冗余）
          </span>
        </div>

        <button
          type="button"
          disabled={removableItems.length === 0}
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Trash2 className="h-4 w-4" />
          <span>一键去重（每组保留最新 1 条）</span>
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-400">
          <Copy className="mx-auto h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm">太棒了，当前模式下没有发现重复书签！</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div
              key={group.key}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-2.5">
                <span className="truncate text-xs font-medium text-slate-700 max-w-2xl" title={group.key}>
                  {group.key}
                </span>
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  共 {group.items.length} 条重复
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {group.items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {idx === 0 && (
                          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/70">
                            推荐保留（最新）
                          </span>
                        )}
                        <span className="font-medium text-sm text-slate-900 truncate">
                          {item.title}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span>目录：{item.folderPath.join(' / ') || '根目录'}</span>
                        <span>添加于：{formatDate(item.dateAdded)}</span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline truncate max-w-sm"
                        >
                          <span className="truncate">{item.url}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteBookmarks([item], '重复书签清理')}
                      className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      删除此条
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`一键清理 ${removableItems.length} 条重复书签？`}
        description="每组重复书签将保留最新添加的 1 条，其余副本均会先备份到本地回收站后再删除。"
        confirmText="确认去重"
        onConfirm={async () => {
          setConfirmOpen(false);
          await onDeleteBookmarks(removableItems, '一键重复书签去重');
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
