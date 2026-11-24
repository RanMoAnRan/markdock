import { useMemo, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, LocateFixed, Trash2 } from 'lucide-react';
import type { BookmarkItem, DuplicateGroup } from '../types/bookmark';
import { flattenBookmarkTree, loadBookmarkTree } from '../core/bookmarks';
import {
  type DuplicateKeepStrategy,
  computeSafeRemovableDuplicates,
  findDuplicateGroups,
} from '../core/duplicates';
import { locateNodeInSidebar } from '../core/locate';
import { ConfirmDialog } from './ConfirmDialog';

interface DuplicatesTabProps {
  bookmarks: BookmarkItem[];
  onDeleteBookmarks: (items: BookmarkItem[], reason: string) => Promise<string[]>;
  onNotify?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export function DuplicatesTab({
  bookmarks,
  onDeleteBookmarks,
  onNotify,
}: DuplicatesTabProps) {
  const [mode, setMode] = useState<'exact' | 'normalized'>('exact');
  const [keepStrategy, setKeepStrategy] = useState<DuplicateKeepStrategy>('newest');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const groups = useMemo(
    () => findDuplicateGroups(bookmarks, mode, undefined, keepStrategy),
    [bookmarks, mode, keepStrategy],
  );

  const removableItems = useMemo(
    () => groups.flatMap((g) => g.items.slice(1)),
    [groups],
  );

  const formatDate = (ts?: number) => {
    if (!ts) return '未知时间';
    return new Date(ts).toLocaleDateString('zh-CN');
  };

  const handleKeepOnlyOne = async (group: DuplicateGroup, keepItem: BookmarkItem) => {
    const others = group.items.filter((item) => item.id !== keepItem.id);
    if (others.length === 0) return;
    await onDeleteBookmarks(others, `同组去重：仅保留「${keepItem.title}」`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setMode('exact')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                mode === 'exact'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              严格 URL 相同（推荐批量）
            </button>
            <button
              type="button"
              onClick={() => setMode('normalized')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                mode === 'normalized'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              规范化匹配（忽略参数/斜杠）
            </button>
          </div>

          <select
            value={keepStrategy}
            onChange={(e) => setKeepStrategy(e.target.value as DuplicateKeepStrategy)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            <option value="newest">保留策略：每组保留最新添加</option>
            <option value="oldest">保留策略：每组保留最早添加</option>
          </select>

          <span className="text-xs text-slate-500 dark:text-slate-400">
            发现 <strong className="text-slate-800 dark:text-slate-100">{groups.length}</strong> 组
            {mode === 'exact' ? '重复' : '规范化重复'}（共{' '}
            <strong className="text-rose-600 dark:text-rose-400">{removableItems.length}</strong> 条冗余）
          </span>
        </div>

        <button
          type="button"
          disabled={removableItems.length === 0}
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Trash2 className="h-4 w-4" />
          <span>
            一键去重（每组保留{keepStrategy === 'newest' ? '最新' : '最早'} 1 条）
          </span>
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-16 text-center text-slate-400 dark:text-slate-500">
          <Copy className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm">太棒了，当前模式下没有发现重复书签！</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div
              key={group.key}
              className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 px-5 py-2.5">
                <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-300 max-w-2xl" title={group.key}>
                  {group.key}
                </span>
                <span className="rounded-full bg-amber-50 dark:bg-amber-950/60 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  共 {group.items.length} 条重复
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {idx === 0 && (
                          <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800">
                            推荐保留（{keepStrategy === 'newest' ? '最新' : '最早'}）
                          </span>
                        )}
                        <span className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
                          {item.title}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>目录：{item.folderPath.join(' / ') || '根目录'}</span>
                        <span>添加于：{formatDate(item.dateAdded)}</span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline truncate max-w-sm"
                        >
                          <span className="truncate">{item.url}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          await locateNodeInSidebar(item.id);
                          onNotify?.(`已在侧边栏定位「${item.title}」`, 'info');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-blue-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                        title="在侧边栏定位"
                      >
                        <LocateFixed className="h-3.5 w-3.5" />
                        <span>定位</span>
                      </button>
                      {group.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => void handleKeepOnlyOne(group, item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer"
                          title="保留此条，删除同组其余重复项"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>仅保留此条</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteBookmarks([item], '重复书签清理')}
                        className="rounded-lg border border-rose-200 dark:border-rose-800 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                      >
                        删除此条
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`一键清理 ${removableItems.length} 条${mode === 'normalized' ? '规范化' : ''}重复书签？`}
        description={
          mode === 'normalized'
            ? `当前为「规范化匹配」模式（忽略 utm 参数、末尾斜杠与页内锚点）。\n每组将保留${keepStrategy === 'newest' ? '最新' : '最早'}添加的 1 条，其余副本均会先备份到本地回收站后再删除。`
            : `每组重复书签将保留${keepStrategy === 'newest' ? '最新' : '最早'}添加的 1 条，其余副本均会先备份到本地回收站后再删除。`
        }
        confirmText="确认去重"
        onConfirm={async () => {
          setConfirmOpen(false);
          const latestTree = await loadBookmarkTree();
          const liveBookmarks = flattenBookmarkTree(latestTree);
          const targetKeys = new Set(groups.map((g) => g.key));
          const safeRemovable = computeSafeRemovableDuplicates(
            liveBookmarks,
            mode,
            targetKeys,
            undefined,
            keepStrategy,
          );
          if (safeRemovable.length > 0) {
            await onDeleteBookmarks(safeRemovable, '一键重复书签去重');
          }
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
