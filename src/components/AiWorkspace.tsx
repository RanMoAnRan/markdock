import { useEffect, useState } from 'react';
import {
  ExternalLink,
  Loader2,
  PanelLeftOpen,
  PanelRightOpen,
  Power,
  RotateCw,
  Settings2,
} from 'lucide-react';
import type { AiSite } from '../types/ai';
import type { EffectiveDockPosition } from '../core/storage';
import { AiSiteIcon } from './DockRail';

export interface AiWorkspaceProps {
  activeSite: AiSite | null;
  mountedSites: AiSite[];
  reloadKeys: Record<string, number>;
  dockCollapsed: boolean;
  dockPosition?: EffectiveDockPosition;
  onExpandDock: () => void;
  onRefreshSite: (siteId: string) => void;
  onUnloadSite: (siteId: string) => void;
  onOpenInNewTab: (url: string) => void;
  onOpenManager: () => void;
}

export function AiWorkspace({
  activeSite,
  mountedSites,
  reloadKeys,
  dockCollapsed,
  dockPosition = 'left',
  onExpandDock,
  onRefreshSite,
  onUnloadSite,
  onOpenInNewTab,
  onOpenManager,
}: AiWorkspaceProps) {
  const [loadedKeys, setLoadedKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const activeKeys = new Set(
      mountedSites.map(
        (site) => `${site.id}-${reloadKeys[site.id] ?? 0}-${site.url}`,
      ),
    );
    setLoadedKeys((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const [k, v] of Object.entries(prev)) {
        if (activeKeys.has(k)) {
          next[k] = v;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [mountedSites, reloadKeys]);

  const activeFrameKey = activeSite
    ? `${activeSite.id}-${reloadKeys[activeSite.id] ?? 0}-${activeSite.url}`
    : null;
  const activeIsLoading =
    activeFrameKey !== null && !loadedKeys[activeFrameKey];

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-white dark:bg-slate-950">
      {/* Compact AI Toolbar */}
      {activeSite && (
        <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95 px-2.5">
          <div className="flex items-center gap-2 min-w-0">
            {dockCollapsed && dockPosition === 'left' && (
              <button
                type="button"
                onClick={onExpandDock}
                title="展开左侧栏"
                className="rounded-md p-1 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <AiSiteIcon key={activeSite.id} site={activeSite} size="sm" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
              {activeSite.name}
            </span>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => onRefreshSite(activeSite.id)}
              title="刷新当前 AI"
              className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onOpenInNewTab(activeSite.url)}
              title="在新标签页打开（首次登录 / 验证）"
              className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onUnloadSite(activeSite.id)}
              title="休眠释放内存"
              className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
            >
              <Power className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onOpenManager}
              title="管理 AI 网站"
              className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
            {dockCollapsed && dockPosition === 'right' && (
              <button
                type="button"
                onClick={onExpandDock}
                title="展开右侧栏"
                className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                <PanelRightOpen className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>
      )}

      {/* Keep-alive iframe stack */}
      <div className="relative flex-1 min-h-0 bg-white dark:bg-slate-950">
        {mountedSites.map((site) => {
          const frameKey = `${site.id}-${reloadKeys[site.id] ?? 0}-${site.url}`;
          const isActive = activeSite?.id === site.id;
          return (
            <iframe
              key={frameKey}
              src={site.url}
              title={site.name}
              allow="clipboard-read; clipboard-write; microphone"
              referrerPolicy="no-referrer-when-downgrade"
              onLoad={() =>
                setLoadedKeys((prev) =>
                  prev[frameKey] ? prev : { ...prev, [frameKey]: true },
                )
              }
              className={isActive ? 'h-full w-full border-0' : 'hidden'}
            />
          );
        })}

        {activeSite && activeIsLoading && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-white/85 dark:bg-slate-950/85 backdrop-blur-[1px]">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
              正在加载 {activeSite.name}…
            </div>
            <button
              type="button"
              onClick={() => onOpenInNewTab(activeSite.url)}
              className="pointer-events-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:border-blue-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              <ExternalLink className="h-3 w-3" />
              <span>如无法加载或需登录，在新标签页打开</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
