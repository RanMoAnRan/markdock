import { useEffect } from 'react';
import {
  ExternalLink,
  Keyboard,
  Minus,
  Monitor,
  Moon,
  PanelLeft,
  PanelRight,
  Plus,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import type { DockPosition, SidebarTheme } from '../core/storage';

export interface SidebarSettingsModalProps {
  open: boolean;
  themeMode: SidebarTheme;
  fontSize: number;
  dockPosition: DockPosition;
  isEdge: boolean;
  onSelectTheme: (theme: SidebarTheme) => void;
  onChangeFontSize: (size: number) => void;
  onSelectDockPosition: (position: DockPosition) => void;
  onOpenAppearanceSettings: () => void;
  onOpenShortcuts: () => void;
  onClose: () => void;
}

const THEME_OPTIONS: Array<{
  value: SidebarTheme;
  label: string;
  icon: typeof Sun;
}> = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
];

const DOCK_POSITION_OPTIONS: Array<{
  value: DockPosition;
  label: string;
  icon: typeof PanelLeft;
}> = [
  { value: 'auto', label: '自动', icon: Sparkles },
  { value: 'left', label: '左侧', icon: PanelLeft },
  { value: 'right', label: '右侧', icon: PanelRight },
];

export function SidebarSettingsModal({
  open,
  themeMode,
  fontSize,
  dockPosition,
  isEdge,
  onSelectTheme,
  onChangeFontSize,
  onSelectDockPosition,
  onOpenAppearanceSettings,
  onOpenShortcuts,
  onClose,
}: SidebarSettingsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="侧边栏设置"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-[1px] p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-3.5 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            侧边栏设置
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3.5 space-y-4">
          {/* Theme */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
              外观主题
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = themeMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onSelectTheme(opt.value)}
                    className={`inline-flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font Size */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                侧边栏字体大小
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onChangeFontSize(fontSize - 1)}
                  disabled={fontSize <= 11}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                  title="缩小字号"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-10 text-center text-xs font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                  {fontSize}px
                </span>
                <button
                  type="button"
                  onClick={() => onChangeFontSize(fontSize + 1)}
                  disabled={fontSize >= 20}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                  title="放大字号"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={11}
                max={20}
                step={1}
                value={fontSize}
                onChange={(e) => onChangeFontSize(Number(e.target.value))}
                className="flex-1 accent-blue-600 cursor-pointer"
              />
              <div className="flex items-center gap-1">
                {[12, 14, 16, 18].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChangeFontSize(preset)}
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium cursor-pointer transition-colors ${
                      fontSize === preset
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Dock Rail Position */}
          <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                AI 切换栏位置
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                自动贴外侧边缘
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
              {DOCK_POSITION_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = dockPosition === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onSelectDockPosition(opt.value)}
                    className={`inline-flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
            {isEdge ? (
              <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                Edge 原生侧边栏固定在右侧，可在此调整面板内切换栏位置。
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onOpenAppearanceSettings();
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-blue-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                <span>调整 Chrome 侧边栏左右位置</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
              </button>
            )}
          </div>

          {/* Global Shortcuts */}
          <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
              全局快捷键
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 px-2.5 py-2 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>纯净书签搜索（隐藏 AI 栏）</span>
                <kbd className="rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:text-slate-300">
                  Alt+B
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>打开并展开 AI 侧栏</span>
                <kbd className="rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:text-slate-300">
                  Alt+V
                </kbd>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onOpenShortcuts();
                onClose();
              }}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-blue-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              <span className="inline-flex items-center gap-1.5">
                <Keyboard className="h-3.5 w-3.5" />
                <span>自定义全局快捷键</span>
              </span>
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
