import { useEffect, useRef, useState } from 'react';
import { FolderOpen, LocateFixed, Trash2 } from 'lucide-react';
import type { EmptyFolderItem } from '../types/bookmark';
import { removeEmptyFolders } from '../core/folders';
import { locateNodeInSidebar } from '../core/locate';
import { ConfirmDialog } from './ConfirmDialog';

interface EmptyFoldersTabProps {
  emptyFolders: EmptyFolderItem[];
  onRefresh: () => Promise<void>;
  onNotify: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export function EmptyFoldersTab({
  emptyFolders,
  onRefresh,
  onNotify,
}: EmptyFoldersTabProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const currentWindowIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.windows?.getCurrent) {
      chrome.windows
        .getCurrent()
        .then((win) => {
          currentWindowIdRef.current = win.id;
        })
        .catch(() => {
          // Ignore if windows API unavailable
        });
    }
  }, []);

  const handleLocateInSidebar = async (folder: EmptyFolderItem) => {
    await locateNodeInSidebar(folder.id, currentWindowIdRef.current);
    onNotify(`已在侧边栏定位「${folder.title}」`, 'info');
  };

  const handleDelete = async (targets: EmptyFolderItem[]) => {
    const removed = await removeEmptyFolders(targets);
    await onRefresh();
    onNotify(`已清理 ${removed.length} 个空文件夹`, 'success');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            空文件夹检测（共 {emptyFolders.length} 个）
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            包含完全为空的文件夹以及仅包含空子目录的文件夹（已自动保护书签栏、其他书签等根容器）。
          </p>
        </div>

        <button
          type="button"
          disabled={emptyFolders.length === 0}
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Trash2 className="h-4 w-4" />
          <span>一键清理全部空文件夹</span>
        </button>
      </div>

      {emptyFolders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-16 text-center text-slate-400 dark:text-slate-500">
          <FolderOpen className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm">当前没有空文件夹，书签目录很整洁！</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs divide-y divide-slate-100 dark:divide-slate-800">
          {emptyFolders.map((folder) => (
            <div
              key={folder.id}
              onClick={() => void handleLocateInSidebar(folder)}
              className="group flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-blue-50/50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
              title="点击在侧边栏定位该文件夹"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-400 truncate transition-colors">
                    {folder.title}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
                    {folder.path.join(' / ')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleLocateInSidebar(folder);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-blue-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
                  title="在侧边栏定位"
                >
                  <LocateFixed className="h-3.5 w-3.5" />
                  <span>定位</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete([folder]);
                  }}
                  className="rounded-lg border border-rose-200 dark:border-rose-800 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`确定清理全部 ${emptyFolders.length} 个空文件夹？`}
        description="将按从深到浅顺序删除所有不含书签的空目录。"
        confirmText="确认清理"
        onConfirm={async () => {
          setConfirmOpen(false);
          await handleDelete(emptyFolders);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
