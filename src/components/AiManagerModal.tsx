import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type { AiSite } from '../types/ai';
import { AiSiteIcon } from './DockRail';

export interface AiManagerModalProps {
  open: boolean;
  sites: AiSite[];
  loadedAiIds: string[];
  onClose: () => void;
  onToggle: (id: string) => void;
  onAdd: (input: { name: string; url: string }) => string | null;
  onUpdate: (id: string, patch: { name: string; url: string }) => string | null;
  onDelete: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onResetBuiltIn: () => void;
}

function formatHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function AiManagerModal({
  open,
  sites,
  loadedAiIds,
  onClose,
  onToggle,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
  onResetBuiltIn,
}: AiManagerModalProps) {
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

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

  const loadedSet = new Set(loadedAiIds);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = onAdd({ name: newName, url: newUrl });
    if (err) {
      setAddError(err);
      return;
    }
    setNewName('');
    setNewUrl('');
    setAddError(null);
    setShowAddForm(false);
  };

  const startEdit = (site: AiSite) => {
    setEditingId(site.id);
    setEditName(site.name);
    setEditUrl(site.url);
    setEditError(null);
  };

  const handleEditSubmit = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    const err = onUpdate(id, { name: editName, url: editUrl });
    if (err) {
      setEditError(err);
      return;
    }
    setEditingId(null);
    setEditError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-[1px] p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-md flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-3.5 py-2.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              管理 AI 网站
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              开关显示、调整顺序或添加自定义 AI 网址
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Add Custom AI Form */}
        <div className="border-b border-slate-100 dark:border-slate-800 px-3.5 py-2">
          {!showAddForm ? (
            <button
              type="button"
              onClick={() => {
                setShowAddForm(true);
                setAddError(null);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>添加自定义 AI 网站</span>
            </button>
          ) : (
            <form onSubmit={handleAddSubmit} className="space-y-2 py-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  新增自定义 AI
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setAddError(null);
                  }}
                  className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  取消
                </button>
              </div>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="名称（如 Poe、OpenRouter、本地 WebUI）"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
                autoFocus
              />
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="网址（如 https://poe.com）"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
              />
              {addError && (
                <p className="text-[11px] text-red-600 dark:text-red-400">
                  {addError}
                </p>
              )}
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>添加并启用</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Site List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 px-2">
          {sites.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
              暂无 AI 网站，可点击上方添加或底部「恢复默认预设」
            </div>
          )}
          {sites.map((site, index) => {
            const isEditing = editingId === site.id;
            const isLoaded = loadedSet.has(site.id);

            if (isEditing) {
              return (
                <form
                  key={site.id}
                  onSubmit={(e) => handleEditSubmit(e, site.id)}
                  className="space-y-1.5 px-1.5 py-2.5 bg-slate-50/80 dark:bg-slate-800/50 rounded-lg my-1"
                >
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="名称"
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="网址"
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
                  />
                  {editError && (
                    <p className="text-[11px] text-red-600 dark:text-red-400">
                      {editError}
                    </p>
                  )}
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700 cursor-pointer"
                    >
                      <Check className="h-3 w-3" />
                      <span>保存</span>
                    </button>
                  </div>
                </form>
              );
            }

            return (
              <div
                key={site.id}
                className="flex items-center gap-2 px-1.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                <AiSiteIcon site={site} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                      {site.name}
                    </span>
                    {!site.builtIn && (
                      <span className="shrink-0 rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                        自定义
                      </span>
                    )}
                    {isLoaded && (
                      <span className="shrink-0 rounded bg-emerald-50 dark:bg-emerald-950/60 px-1 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        运行中
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                    {formatHost(site.url)}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onReorder(index, index - 1)}
                    title="上移"
                    className="rounded p-1 text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === sites.length - 1}
                    onClick={() => onReorder(index, index + 1)}
                    title="下移"
                    className="rounded p-1 text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(site)}
                    title="编辑"
                    className="rounded p-1 text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(site.id)}
                    title={
                      site.builtIn
                        ? '删除（可通过恢复默认预设找回）'
                        : '删除'
                    }
                    className="rounded p-1 text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/60 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>

                  {/* Enable / Disable switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={site.enabled}
                    onClick={() => onToggle(site.id)}
                    title={site.enabled ? '停用' : '启用'}
                    className={`ml-1 relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                      site.enabled
                        ? 'bg-blue-600'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                        site.enabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90 px-3.5 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onResetBuiltIn}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              title="将内置 AI 预设恢复为默认配置（保留自定义站点）"
            >
              <RotateCcw className="h-3 w-3" />
              <span>恢复默认预设</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-800 dark:bg-slate-700 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 dark:hover:bg-slate-600 cursor-pointer"
            >
              完成
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
            提示：若个别 AI 网站首次打开需登录或验证，请先点击顶栏「在新标签页打开」完成登录，再回侧边栏刷新即可。
          </p>
        </div>
      </div>
    </div>
  );
}
