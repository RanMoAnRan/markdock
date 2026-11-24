import { useEffect, useState } from 'react';
import {
  Bookmark,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Settings2,
} from 'lucide-react';
import type { AiSite, DockTarget } from '../types/ai';
import type { EffectiveDockPosition } from '../core/storage';
import { getAiBadgeText } from '../core/aiSites';
import { getFaviconUrl } from '../core/bookmarks';

function getBuiltInAiIconUrl(id: string): string {
  const rel = `ai-icons/${id}.png`;
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(rel);
  }
  return `/${rel}`;
}

export function AiSiteIcon({
  site,
  size = 'md',
}: {
  site: AiSite;
  size?: 'sm' | 'md';
}) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [site.id, site.url, site.builtIn]);

  const dimClass = size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-7 w-7 text-[11px]';
  const imgClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const badgeText = getAiBadgeText(site);
  const bgColor = site.accentColor || '#4f46e5';

  if (!imgFailed) {
    const src = site.builtIn
      ? getBuiltInAiIconUrl(site.id)
      : getFaviconUrl(site.url, 32);

    if (src) {
      return (
        <span
          className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200/80 dark:border-slate-700/80 shadow-2xs overflow-hidden ${dimClass}`}
        >
          <img
            src={src}
            alt={site.name}
            className={`${imgClass} rounded-sm object-contain`}
            onError={() => setImgFailed(true)}
          />
        </span>
      );
    }
  }

  return (
    <span
      style={{ backgroundColor: bgColor }}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-bold tracking-tight text-white shadow-xs ${dimClass}`}
    >
      {badgeText}
    </span>
  );
}

export interface DockRailProps {
  sites: AiSite[];
  activeTarget: DockTarget;
  loadedAiIds: string[];
  position?: EffectiveDockPosition;
  onSelectTarget: (target: DockTarget) => void;
  onSiteContextMenu: (e: React.MouseEvent, site: AiSite) => void;
  onAddCurrentTab: () => void;
  onOpenManager: () => void;
  onCollapse: () => void;
}

export function DockRail({
  sites,
  activeTarget,
  loadedAiIds,
  position = 'left',
  onSelectTarget,
  onSiteContextMenu,
  onAddCurrentTab,
  onOpenManager,
  onCollapse,
}: DockRailProps) {
  const enabledSites = sites.filter((s) => s.enabled);
  const loadedSet = new Set(loadedAiIds);
  const bookmarksActive = activeTarget === 'bookmarks';
  const isRight = position === 'right';
  const CollapseIcon = isRight ? PanelRightClose : PanelLeftClose;

  return (
    <nav
      aria-label="MarkDock 侧边切换栏"
      className={`flex w-11 shrink-0 flex-col items-center ${
        isRight ? 'border-l' : 'border-r'
      } border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900 py-2 select-none`}
    >
      {/* Top: Bookmarks entry */}
      <button
        type="button"
        onClick={() => onSelectTarget('bookmarks')}
        title="书签"
        className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
          bookmarksActive
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
        }`}
      >
        {bookmarksActive && (
          <span
            className={`absolute h-4 w-1 bg-blue-600 dark:bg-blue-400 ${
              isRight ? '-right-1.5 rounded-l-full' : '-left-1.5 rounded-r-full'
            }`}
          />
        )}
        <Bookmark className="h-4 w-4" />
      </button>

      <div className="my-2 h-px w-6 bg-slate-200 dark:bg-slate-800" />

      {/* Middle: Enabled AI sites */}
      <div className="flex flex-1 w-full flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden py-0.5">
        {enabledSites.map((site) => {
          const isActive = activeTarget === site.id;
          const isLoaded = loadedSet.has(site.id);
          return (
            <button
              key={site.id}
              type="button"
              onClick={() => onSelectTarget(site.id)}
              onContextMenu={(e) => onSiteContextMenu(e, site)}
              title={isLoaded ? `${site.name}（运行中，右键管理）` : `${site.name}（右键管理）`}
              className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-950/70 ring-[1.5px] ring-blue-500/70 dark:ring-blue-400/70'
                  : 'hover:bg-slate-200/70 dark:hover:bg-slate-800 opacity-85 hover:opacity-100'
              }`}
            >
              {isActive && (
                <span
                  className={`absolute h-4 w-1 bg-blue-600 dark:bg-blue-400 ${
                    isRight ? '-right-[3px] rounded-l-full' : '-left-[3px] rounded-r-full'
                  }`}
                />
              )}
              <AiSiteIcon site={site} size="md" />
              {isLoaded && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-[1.5px] ring-slate-50 dark:ring-slate-900"
                />
              )}
            </button>
          );
        })}

        {/* Quick add current webpage into AI Dock */}
        <button
          type="button"
          onClick={onAddCurrentTab}
          title="将当前网页添加到 AI 侧栏"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-blue-400 hover:bg-blue-50/70 dark:hover:bg-blue-950/50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer mt-0.5"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Bottom: Manage & Collapse */}
      <div className="mt-1 flex flex-col items-center gap-1 border-t border-slate-200 dark:border-slate-800 pt-2">
        <button
          type="button"
          onClick={onOpenManager}
          title="管理 AI 网站"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
        >
          <Settings2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onCollapse}
          title={isRight ? '收起右侧栏' : '收起左侧栏'}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
        >
          <CollapseIcon className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
