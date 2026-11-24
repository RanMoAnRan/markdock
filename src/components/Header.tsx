import {
  BookmarkCheck,
  Download,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react';

interface HeaderProps {
  totalBookmarks: number;
  onExportBackup: () => void;
  onOpenSettings: () => void;
  onRefreshBookmarks: () => void;
  onClosePage: () => void;
}

export function Header({
  totalBookmarks,
  onExportBackup,
  onOpenSettings,
  onRefreshBookmarks,
  onClosePage,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
            <BookmarkCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                MarkDock
              </h1>
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                共 {totalBookmarks} 条书签
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              精准分桶死链检测 · 人机验证防误杀 · 本地回收站保护
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onRefreshBookmarks}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title="重新读取浏览器书签"
          >
            <RefreshCw className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span>刷新书签</span>
          </button>
          <button
            type="button"
            onClick={onExportBackup}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/60 px-3.5 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100/80 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>导出 HTML 备份</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <Settings className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span>设置</span>
          </button>
          <button
            type="button"
            onClick={onClosePage}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-rose-200 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
            title="关闭清理页面"
          >
            <X className="h-4 w-4" />
            <span>关闭</span>
          </button>
        </div>
      </div>
    </header>
  );
}
