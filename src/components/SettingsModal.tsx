import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { ScanSettings } from '../types/bookmark';

interface SettingsModalProps {
  open: boolean;
  settings: ScanSettings;
  onSave: (next: ScanSettings) => void;
  onClose: () => void;
}

export function SettingsModal({
  open,
  settings,
  onSave,
  onClose,
}: SettingsModalProps) {
  const [draft, setDraft] = useState<ScanSettings>(settings);

  useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

  if (!open) return null;

  const handleSave = () => {
    const clamped: ScanSettings = {
      concurrency: Math.max(1, Math.min(20, Math.round(draft.concurrency || 8))),
      timeoutSeconds: Math.max(3, Math.min(60, Math.round(draft.timeoutSeconds || 10))),
      skipLocal: draft.skipLocal,
      includeCredentials: draft.includeCredentials,
    };
    onSave(clamped);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">检测设置</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
            aria-label="关闭设置"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                并发请求数（1–20）
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={draft.concurrency}
                onChange={(e) =>
                  setDraft({ ...draft, concurrency: Number(e.target.value) })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <p className="mt-1 text-xs text-slate-500">
                建议 6–10，过高容易触发站点限流 (429)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                单条超时时间（3–60 秒）
              </label>
              <input
                type="number"
                min={3}
                max={60}
                value={draft.timeoutSeconds}
                onChange={(e) =>
                  setDraft({ ...draft, timeoutSeconds: Number(e.target.value) })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <p className="mt-1 text-xs text-slate-500">
                海外或代理站点较慢时可适当调大
              </p>
            </div>
          </div>

          <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50/70 transition-colors">
            <div>
              <div className="text-sm font-medium text-slate-900">
                检测时携带浏览器登录态（Cookie）
              </div>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                推荐开启。可避免 GitHub 私有仓库、私有文档和已登录系统返回 404 或跳转登录页而造成误判；插件会自动跳过 /logout 等登出链接。
              </p>
            </div>
            <input
              type="checkbox"
              checked={draft.includeCredentials}
              onChange={(e) =>
                setDraft({ ...draft, includeCredentials: e.target.checked })
              }
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          </label>

          <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50/70 transition-colors">
            <div>
              <div className="text-sm font-medium text-slate-900">
                自动跳过本地与内网地址
              </div>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                跳过 localhost、127.0.0.1、192.168.x.x、10.x.x.x 及 *.local 书签，避免本地服务未启动时被误报失效。
              </p>
            </div>
            <input
              type="checkbox"
              checked={draft.skipLocal}
              onChange={(e) => setDraft({ ...draft, skipLocal: e.target.checked })}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2.5 bg-slate-50 px-6 py-3.5 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
