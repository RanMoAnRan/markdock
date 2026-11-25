import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  AppWindow,
  ArrowUp,
  Bookmark,
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Copy,
  EyeOff,
  ExternalLink,
  Flame,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderTree,
  LocateFixed,
  PanelLeftOpen,
  PanelRightOpen,
  Pencil,
  Pin,
  PinOff,
  Power,
  Radar,
  RotateCcw,
  RotateCw,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import type { AiSite, DockTarget } from '../types/ai';
import type {
  BookmarkItem,
  RecycleBinEntry,
  VisitStatsMap,
} from '../types/bookmark';
import {
  DEFAULT_AI_SITES,
  addCustomAiSite,
  deleteAiSite,
  normalizeAiUrl,
  pruneLoadedAiIds,
  reorderAiSites,
  resetBuiltInAiSites,
  resolveActiveDockTarget,
  resolvePreferredAiSiteId,
  toggleAiSite,
  updateAiSite,
} from '../core/aiSites';
import {
  computeBookmarkMoveTarget,
  createBookmarkItem,
  type DropPosition,
  filterBookmarksByFolder,
  flattenBookmarkTree,
  getAncestorFolderIds,
  getFaviconUrl,
  loadBookmarkTree,
  moveBookmarkItem,
  reorderIdList,
  updateBookmark,
} from '../core/bookmarks';
import { findMatchingBookmarksByUrl } from '../core/duplicates';
import {
  RecycleBinCapacityError,
  restoreRecycleBinEntries,
  safeDeleteBookmarks,
  safeDeleteFolderTree,
} from '../core/recycleBin';
import { highlightSegments, searchBookmarks } from '../core/search';
import {
  consumePendingLocateFolder,
  loadActiveDockId,
  loadAiSites,
  loadDockCollapsed,
  loadDockPosition,
  loadExpandedFolders,
  loadLastAiId,
  loadPinnedIds,
  loadSidebarFontSize,
  loadSidebarTheme,
  loadVisitStats,
  resolveEffectiveDockPosition,
  saveActiveDockId,
  saveAiSites,
  saveDockCollapsed,
  saveDockPosition,
  saveExpandedFolders,
  saveLastAiId,
  savePendingLocateFolder,
  savePinnedIds,
  saveSidebarFontSize,
  saveSidebarTheme,
  saveVisitStats,
  type DockPosition,
  type SidebarTheme,
} from '../core/storage';
import {
  getFrequentBookmarks,
  getRecentBookmarks,
  prunePinnedIds,
  pruneVisitStats,
  recordBookmarkVisit,
} from '../core/views';
import { AiManagerModal } from '../components/AiManagerModal';
import { AiWorkspace } from '../components/AiWorkspace';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DockRail } from '../components/DockRail';
import { FolderTreePicker } from '../components/FolderTreePicker';
import { SidebarSettingsModal } from '../components/SidebarSettingsModal';

type SidebarView = 'tree' | 'recent' | 'frequent';

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return '';
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

type ModalState =
  | null
  | {
      mode: 'add_bookmark';
      title: string;
      url: string;
      parentId: string;
    }
  | {
      mode: 'edit_bookmark';
      id: string;
      title: string;
      url: string;
    }
  | {
      mode: 'add_folder';
      parentId: string;
      title: string;
    }
  | {
      mode: 'rename_folder';
      id: string;
      title: string;
    }
  | {
      mode: 'add_ai_site';
      title: string;
      url: string;
    };

type ContextMenuState =
  | null
  | {
      kind: 'bookmark';
      x: number;
      y: number;
      bookmark: BookmarkItem;
    }
  | {
      kind: 'folder';
      x: number;
      y: number;
      node: chrome.bookmarks.BookmarkTreeNode;
      isProtectedRoot: boolean;
    }
  | {
      kind: 'ai_site';
      x: number;
      y: number;
      site: AiSite;
    };

function HighlightText({ text, query }: { text: string; query: string }) {
  const segments = highlightSegments(text, query);
  return (
    <>
      {segments.map((seg, idx) =>
        seg.match ? (
          <mark
            key={idx}
            className="rounded-xs bg-amber-200/80 dark:bg-amber-500/35 px-0.5 text-slate-900 dark:text-amber-100 font-semibold"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={idx}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function SiteFavicon({ url, sizePx }: { url: string; sizePx: number }) {
  const [failed, setFailed] = useState(false);
  const src = getFaviconUrl(url, 32);

  if (!src || failed) {
    return (
      <Bookmark
        style={{ width: sizePx, height: sizePx }}
        className="shrink-0 text-slate-400"
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      style={{ width: sizePx, height: sizePx }}
      className="shrink-0 rounded-xs"
      onError={() => setFailed(true)}
    />
  );
}

function collectSubfolderIds(node: chrome.bookmarks.BookmarkTreeNode): string[] {
  const ids: string[] = [];
  const walk = (n: chrome.bookmarks.BookmarkTreeNode) => {
    if (typeof n.url !== 'string') {
      ids.push(n.id);
      if (n.children) {
        for (const child of n.children) walk(child);
      }
    }
  };
  walk(node);
  return ids;
}

export default function SidePanelApp() {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const nodeRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const highlightTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const autoExpandTimerRef = useRef<{ folderId: string; timer: number } | null>(
    null,
  );
  const rootsRef = useRef<chrome.bookmarks.BookmarkTreeNode[]>([]);

  const [roots, setRoots] = useState<chrome.bookmarks.BookmarkTreeNode[]>([]);
  rootsRef.current = roots;
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['1']));
  const [activeView, setActiveView] = useState<SidebarView>('tree');
  const [visitStats, setVisitStats] = useState<VisitStatsMap>({});
  const [fontSize, setFontSize] = useState<number>(13);
  const [themeMode, setThemeMode] = useState<SidebarTheme>('system');
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingLocateId, setPendingLocateId] = useState<string | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(
    null,
  );

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [dragItem, setDragItem] = useState<{
    source: 'tree' | 'pinned';
    id: string;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    source: 'tree' | 'pinned';
    id: string;
    position: DropPosition;
  } | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const contextMenuOpenRef = useRef(false);
  contextMenuOpenRef.current = contextMenu !== null;
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: '', description: '', onConfirm: () => {} });
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    undoEntry?: RecycleBinEntry;
  } | null>(null);

  // AI Hub Dock state
  const [aiSites, setAiSites] = useState<AiSite[]>(() => DEFAULT_AI_SITES);
  const aiSitesRef = useRef<AiSite[]>(aiSites);
  aiSitesRef.current = aiSites;
  const [activeDockId, setActiveDockId] = useState<DockTarget>('bookmarks');
  const activeDockIdRef = useRef<DockTarget>(activeDockId);
  activeDockIdRef.current = activeDockId;
  const [dockCollapsed, setDockCollapsed] = useState(true);
  const dockCollapsedRef = useRef<boolean>(dockCollapsed);
  dockCollapsedRef.current = dockCollapsed;
  const [dockHydrated, setDockHydrated] = useState(false);
  const [dockPosition, setDockPosition] = useState<DockPosition>('auto');
  const [browserSidePanelSide, setBrowserSidePanelSide] = useState<
    'left' | 'right' | null
  >(null);
  const isEdge = useMemo(
    () =>
      typeof navigator !== 'undefined' && navigator.userAgent.includes('Edg/'),
    [],
  );
  const effectiveDockPosition = resolveEffectiveDockPosition(
    dockPosition,
    browserSidePanelSide,
  );
  const [loadedAiIds, setLoadedAiIds] = useState<string[]>([]);
  const [reloadKeys, setReloadKeys] = useState<Record<string, number>>({});
  const [aiManagerOpen, setAiManagerOpen] = useState(false);
  const aiManagerOpenRef = useRef<boolean>(aiManagerOpen);
  aiManagerOpenRef.current = aiManagerOpen;
  const dockOverriddenRef = useRef(false);
  const lastAiIdRef = useRef<string | null>(null);
  const mountedAtRef = useRef<number>(Date.now());
  const currentWindowIdRef = useRef<number | undefined>(undefined);
  const aiConfigLoadedRef = useRef(false);
  const pendingCommandRef = useRef<'FOCUS_SEARCH' | 'OPEN_AI' | null>(null);
  const messageHandlerRef = useRef<
    (message: { type?: string; folderId?: string; targetWindowId?: number }) => void
  >(() => {});

  const showToast = useCallback(
    (message: string, undoEntry?: RecycleBinEntry) => {
      const id = Date.now();
      setToast({ id, message, undoEntry });
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = window.setTimeout(
        () => {
          setToast((prev) => (prev?.id === id ? null : prev));
          toastTimerRef.current = null;
        },
        undoEntry ? 4500 : 2200,
      );
    },
    [],
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const focusSearch = useCallback(() => {
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    setShowScrollTop((el?.scrollTop ?? 0) > 240);
  }, [activeView, query]);

  const refreshTree = useCallback(async () => {
    const tree = await loadBookmarkTree();
    setRoots(tree);
    const liveIds = new Set(flattenBookmarkTree(tree).map((b) => b.id));
    setPinnedIds((prev) => {
      const cleaned = prunePinnedIds(prev, liveIds);
      if (cleaned.length !== prev.length) {
        void savePinnedIds(cleaned);
        return cleaned;
      }
      return prev;
    });
  }, []);

  const locateNode = useCallback(
    (nodeId: string, treeOverride?: chrome.bookmarks.BookmarkTreeNode[]) => {
      const tree = treeOverride ?? rootsRef.current;
      const ancestors = getAncestorFolderIds(tree, nodeId);

      setQuery('');
      setActiveView('tree');
      setContextMenu(null);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const id of ancestors) next.add(id);
        void saveExpandedFolders([...next]);
        return next;
      });
      setPendingLocateId(nodeId);
      setHighlightedNodeId(nodeId);

      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedNodeId((prev) => (prev === nodeId ? null : prev));
        highlightTimerRef.current = null;
      }, 2600);
    },
    [],
  );

  useEffect(() => {
    (async () => {
      let currentWinId: number | undefined = currentWindowIdRef.current;
      if (
        currentWinId === undefined &&
        typeof chrome !== 'undefined' &&
        chrome.windows?.getCurrent
      ) {
        try {
          const win = await chrome.windows.getCurrent();
          if (typeof win.id === 'number') {
            currentWinId = win.id;
            currentWindowIdRef.current = win.id;
          }
        } catch {
          // Ignore outside extension context
        }
      }

      // Start bookmark tree loading in parallel so it never delays initial AI/Dock view switch
      const bookmarkDataPromise = Promise.all([
        loadBookmarkTree(),
        loadPinnedIds(),
        loadExpandedFolders(),
        loadVisitStats(),
      ]);

      const sidePanelLayoutPromise = (async (): Promise<'left' | 'right' | null> => {
        try {
          const sidePanelApi =
            typeof chrome !== 'undefined'
              ? (chrome.sidePanel as
                  | { getLayout?: () => Promise<{ side?: 'left' | 'right' }> }
                  | undefined)
              : undefined;
          if (sidePanelApi?.getLayout) {
            const layout = await sidePanelApi.getLayout();
            if (layout?.side === 'left' || layout?.side === 'right') {
              return layout.side;
            }
          }
        } catch {
          // Ignore when getLayout is unsupported
        }
        return null;
      })();

      let pendingLocate: string | null = null;
      try {
        const [
          savedFontSize,
          savedTheme,
          loadedPendingLocate,
          savedAiSites,
          savedDockCollapsed,
          savedDockPosition,
          savedActiveDockId,
          savedLastAiId,
          detectedSide,
        ] = await Promise.all([
          loadSidebarFontSize(),
          loadSidebarTheme(),
          consumePendingLocateFolder(15_000, currentWinId),
          loadAiSites(),
          loadDockCollapsed(),
          loadDockPosition(),
          loadActiveDockId(),
          loadLastAiId(),
          sidePanelLayoutPromise,
        ]);

        pendingLocate = loadedPendingLocate;
        if (detectedSide) {
          setBrowserSidePanelSide(detectedSide);
        }
        setDockPosition(savedDockPosition);
        setFontSize(savedFontSize);
        setThemeMode(savedTheme);
        setAiSites(savedAiSites);
        aiSitesRef.current = savedAiSites;
        aiConfigLoadedRef.current = true;
        if (!lastAiIdRef.current && savedLastAiId) {
          lastAiIdRef.current = savedLastAiId;
        }

        const resolvedDock: DockTarget = pendingLocate
          ? 'bookmarks'
          : resolveActiveDockTarget(savedActiveDockId, savedAiSites);

        const deferredCmd = pendingCommandRef.current;
        pendingCommandRef.current = null;

        if (deferredCmd === 'OPEN_AI') {
          const targetAiId = resolvePreferredAiSiteId(
            lastAiIdRef.current,
            savedAiSites,
          );
          setDockCollapsed(false);
          void saveDockCollapsed(false);
          if (targetAiId) {
            setAiManagerOpen(false);
            lastAiIdRef.current = targetAiId;
            setActiveDockId(targetAiId);
            setLoadedAiIds((prev) =>
              prev.includes(targetAiId) ? prev : [...prev, targetAiId],
            );
            void saveActiveDockId(targetAiId);
            void saveLastAiId(targetAiId);
          } else {
            setActiveDockId('bookmarks');
            void saveActiveDockId('bookmarks');
            setAiManagerOpen(true);
          }
        } else if (deferredCmd === 'FOCUS_SEARCH') {
          setAiManagerOpen(false);
          setDockCollapsed(true);
          setActiveDockId('bookmarks');
          void saveDockCollapsed(true);
          void saveActiveDockId('bookmarks');
          requestAnimationFrame(() => focusSearch());
        } else if (!dockOverriddenRef.current) {
          setDockCollapsed(savedDockCollapsed);
          setActiveDockId(resolvedDock);
          if (resolvedDock !== 'bookmarks') {
            lastAiIdRef.current = resolvedDock;
            setLoadedAiIds((prev) =>
              prev.includes(resolvedDock) ? prev : [...prev, resolvedDock],
            );
          }
          if (resolvedDock !== savedActiveDockId) {
            void saveActiveDockId(resolvedDock);
          }
          if (!pendingLocate && resolvedDock === 'bookmarks') {
            requestAnimationFrame(() => focusSearch());
          }
        } else {
          // Revalidate activeDockId against loaded AI config so we never leave a blank view
          setActiveDockId((prev) => {
            const valid = resolveActiveDockTarget(prev, savedAiSites);
            if (valid !== prev) void saveActiveDockId(valid);
            return valid;
          });
          if (!pendingLocate && activeDockIdRef.current === 'bookmarks') {
            requestAnimationFrame(() => focusSearch());
          }
        }
      } finally {
        setDockHydrated(true);
      }

      const [tree, pinned, expanded, savedVisitStats] = await bookmarkDataPromise;
      const liveIds = new Set(flattenBookmarkTree(tree).map((b) => b.id));
      const cleanedStats = pruneVisitStats(savedVisitStats, liveIds);
      if (Object.keys(cleanedStats).length !== Object.keys(savedVisitStats).length) {
        void saveVisitStats(cleanedStats);
      }
      const cleanedPinned = prunePinnedIds(pinned, liveIds);
      if (cleanedPinned.length !== pinned.length) {
        void savePinnedIds(cleanedPinned);
      }
      setRoots(tree);
      setPinnedIds(cleanedPinned);
      setExpandedIds(new Set(expanded));
      setVisitStats(cleanedStats);

      if (pendingLocate) {
        locateNode(pendingLocate, tree);
      }
    })();
  }, [focusSearch, locateNode]);

  useEffect(() => {
    if (!pendingLocateId || query.trim() || activeView !== 'tree') return;
    const raf = requestAnimationFrame(() => {
      const el = nodeRowRefs.current.get(pendingLocateId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setPendingLocateId(null);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingLocateId, expandedIds, query, roots, activeView]);

  // Register open side-panel presence with service worker for shortcut toggle-close
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.connect) return;
    let port: chrome.runtime.Port | null = null;
    try {
      port = chrome.runtime.connect({ name: 'sidepanel' });
      port.onMessage.addListener(
        (msg: { type?: string; folderId?: string; targetWindowId?: number }) => {
          messageHandlerRef.current(msg);
        },
      );
      port.onDisconnect.addListener(() => {
        // Consume runtime.lastError so Chrome/Edge never logs
        // "Unchecked runtime.lastError" when the service worker sleeps or reloads.
        void chrome.runtime.lastError;
        port = null;
      });
      if (chrome.windows?.getCurrent) {
        void chrome.windows
          .getCurrent()
          .then((win) => {
            if (typeof win.id === 'number') {
              currentWindowIdRef.current = win.id;
              if (port) {
                try {
                  port.postMessage({ type: 'PANEL_READY', windowId: win.id });
                } catch {
                  // Ignore if port already disconnected
                }
              }
            }
          })
          .catch(() => {});
      }
    } catch {
      // Ignore outside extension context
    }
    return () => {
      try {
        port?.disconnect();
      } catch {
        // Ignore disconnect error
      }
    };
  }, []);

  // Auto-focus search on window focus, visibility change, and shortcut message
  useEffect(() => {
    const isBookmarksActive =
      activeDockId === 'bookmarks' && !aiManagerOpen && !settingsOpen;
    const onFocus = () => {
      if (isBookmarksActive) focusSearch();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && isBookmarksActive) {
        focusSearch();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && contextMenu) {
        setContextMenu(null);
        return;
      }
      if (!isBookmarksActive) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        focusSearch();
      } else if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !modal
      ) {
        e.preventDefault();
        focusSearch();
      }
    };
    const onMessage = (message: {
      type?: string;
      folderId?: string;
      targetWindowId?: number;
    }) => {
      // Ignore messages targeted at a different browser window
      if (
        typeof message?.targetWindowId === 'number' &&
        typeof currentWindowIdRef.current === 'number' &&
        message.targetWindowId !== currentWindowIdRef.current
      ) {
        return;
      }

      const canToggleClose = Date.now() - mountedAtRef.current >= 600;

      if (message?.type === 'FOCUS_SEARCH') {
        if (
          canToggleClose &&
          activeDockIdRef.current === 'bookmarks' &&
          dockCollapsedRef.current &&
          !aiManagerOpenRef.current
        ) {
          window.close();
          return;
        }
        if (!aiConfigLoadedRef.current) {
          pendingCommandRef.current = 'FOCUS_SEARCH';
        }
        dockOverriddenRef.current = true;
        setAiManagerOpen(false);
        setDockCollapsed(true);
        setActiveDockId('bookmarks');
        void saveDockCollapsed(true);
        void saveActiveDockId('bookmarks');
        requestAnimationFrame(() => focusSearch());
      } else if (message?.type === 'OPEN_AI') {
        if (
          canToggleClose &&
          !dockCollapsedRef.current &&
          (activeDockIdRef.current !== 'bookmarks' || aiManagerOpenRef.current)
        ) {
          window.close();
          return;
        }
        if (!aiConfigLoadedRef.current) {
          // Wait for saved AI sites to load before selecting target AI
          pendingCommandRef.current = 'OPEN_AI';
          dockOverriddenRef.current = true;
          setDockCollapsed(false);
          return;
        }
        dockOverriddenRef.current = true;
        setContextMenu(null);
        setDockCollapsed(false);
        void saveDockCollapsed(false);
        const targetAiId = resolvePreferredAiSiteId(
          lastAiIdRef.current,
          aiSitesRef.current,
        );
        if (targetAiId) {
          setAiManagerOpen(false);
          lastAiIdRef.current = targetAiId;
          setActiveDockId(targetAiId);
          setLoadedAiIds((prev) =>
            prev.includes(targetAiId) ? prev : [...prev, targetAiId],
          );
          void saveActiveDockId(targetAiId);
          void saveLastAiId(targetAiId);
        } else {
          setActiveDockId('bookmarks');
          void saveActiveDockId('bookmarks');
          setAiManagerOpen(true);
        }
      } else if (
        message?.type === 'LOCATE_FOLDER' &&
        typeof message.folderId === 'string'
      ) {
        dockOverriddenRef.current = true;
        setAiManagerOpen(false);
        setActiveDockId('bookmarks');
        void saveActiveDockId('bookmarks');
        void savePendingLocateFolder(null);
        locateNode(message.folderId);
      }
    };
    messageHandlerRef.current = onMessage;
    const onPointerDown = (e: MouseEvent) => {
      // Ignore right-click here; capture-phase contextmenu handler closes it cleanly
      if (e.button === 2) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const onWindowContextMenu = (e: MouseEvent) => {
      if (contextMenuOpenRef.current) {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu(null);
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('contextmenu', onWindowContextMenu, true);
    chrome.runtime?.onMessage?.addListener(onMessage);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('contextmenu', onWindowContextMenu, true);
      chrome.runtime?.onMessage?.removeListener(onMessage);
    };
  }, [focusSearch, locateNode, modal, contextMenu, activeDockId, aiManagerOpen, settingsOpen]);

  // Live sync with browser bookmark events (80ms debounce to coalesce batch operations)
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.bookmarks) return;
    let timer: number | null = null;
    const scheduleRefresh = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void refreshTree();
      }, 80);
    };
    chrome.bookmarks.onCreated?.addListener(scheduleRefresh);
    chrome.bookmarks.onRemoved?.addListener(scheduleRefresh);
    chrome.bookmarks.onChanged?.addListener(scheduleRefresh);
    chrome.bookmarks.onMoved?.addListener(scheduleRefresh);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      chrome.bookmarks.onCreated?.removeListener(scheduleRefresh);
      chrome.bookmarks.onRemoved?.removeListener(scheduleRefresh);
      chrome.bookmarks.onChanged?.removeListener(scheduleRefresh);
      chrome.bookmarks.onMoved?.removeListener(scheduleRefresh);
    };
  }, [refreshTree]);

  const allBookmarks = useMemo(() => flattenBookmarkTree(roots), [roots]);
  const bookmarkById = useMemo(
    () => new Map(allBookmarks.map((b) => [b.id, b])),
    [allBookmarks],
  );

  const pinnedBookmarks = useMemo(
    () =>
      pinnedIds
        .map((id) => bookmarkById.get(id))
        .filter((b): b is BookmarkItem => Boolean(b)),
    [pinnedIds, bookmarkById],
  );

  const searchResults = useMemo(
    () => searchBookmarks(allBookmarks, query, 80),
    [allBookmarks, query],
  );

  const recentBookmarks = useMemo(
    () => getRecentBookmarks(allBookmarks, 60),
    [allBookmarks],
  );

  const frequentBookmarks = useMemo(
    () => getFrequentBookmarks(allBookmarks, visitStats, 60),
    [allBookmarks, visitStats],
  );

  const duplicateMatches = useMemo(() => {
    if (modal?.mode !== 'add_bookmark') return [];
    return findMatchingBookmarksByUrl(allBookmarks, modal.url);
  }, [modal, allBookmarks]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const updateFontSize = async (next: number) => {
    const clamped = Math.max(11, Math.min(20, next));
    setFontSize(clamped);
    await saveSidebarFontSize(clamped);
  };

  const handleSelectTheme = async (next: SidebarTheme) => {
    setThemeMode(next);
    await saveSidebarTheme(next);
    const label =
      next === 'dark'
        ? '深色模式'
        : next === 'light'
          ? '浅色模式'
          : '跟随系统';
    showToast(`外观已切换为：${label}`);
  };

  const handleSelectDockPosition = async (next: DockPosition) => {
    setDockPosition(next);
    await saveDockPosition(next);
    const label =
      next === 'left'
        ? '左侧'
        : next === 'right'
          ? '右侧'
          : '自动（贴外侧边缘）';
    showToast(`AI 切换栏已设为：${label}`);
  };

  const handleMiddleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
    }
  };

  const trackBookmarkVisit = useCallback((bookmarkId?: string) => {
    if (!bookmarkId) return;
    setVisitStats((prev) => {
      const next = recordBookmarkVisit(prev, bookmarkId);
      void saveVisitStats(next);
      return next;
    });
  }, []);

  const handleBookmarkAuxClick = (
    e: React.MouseEvent,
    url: string,
    bookmarkId?: string,
  ) => {
    if (e.button === 1) {
      e.preventDefault();
      void openUrl(url, 'new_tab_bg', bookmarkId);
    }
  };

  const openUrl = async (
    url: string,
    mode: 'current' | 'new_tab_active' | 'new_tab_bg' | 'new_window' | 'incognito',
    bookmarkId?: string,
  ) => {
    trackBookmarkVisit(bookmarkId);
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      if (mode === 'new_tab_active') {
        await chrome.tabs.create({ url, active: true });
      } else if (mode === 'new_tab_bg') {
        await chrome.tabs.create({ url, active: false });
      } else if (mode === 'new_window') {
        await chrome.windows.create({ url });
      } else if (mode === 'incognito') {
        try {
          await chrome.windows.create({ url, incognito: true });
        } catch {
          showToast('请先在扩展设置中允许在无痕模式下运行');
        }
      } else {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.id !== undefined) {
          await chrome.tabs.update(tab.id, { url });
        } else {
          await chrome.tabs.create({ url });
        }
      }
    } else {
      window.open(url, '_blank');
    }
  };

  const openContextMenu = (
    e: React.MouseEvent,
    payload:
      | { kind: 'bookmark'; bookmark: BookmarkItem }
      | {
          kind: 'folder';
          node: chrome.bookmarks.BookmarkTreeNode;
          isProtectedRoot: boolean;
        },
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 200;
    const menuHeight = payload.kind === 'bookmark' ? 320 : 270;
    const x = Math.min(e.clientX, Math.max(8, window.innerWidth - menuWidth - 8));
    const y = Math.min(e.clientY, Math.max(8, window.innerHeight - menuHeight - 8));
    if (payload.kind === 'bookmark') {
      setContextMenu({ kind: 'bookmark', x, y, bookmark: payload.bookmark });
    } else {
      setContextMenu({
        kind: 'folder',
        x,
        y,
        node: payload.node,
        isProtectedRoot: payload.isProtectedRoot,
      });
    }
  };

  const handleOpenCleanerWorkbench = async () => {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.runtime?.getURL) {
      return;
    }
    const workbenchUrl = chrome.runtime.getURL('index.html');
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const workbenchTabs = tabs.filter(
      (t) => (t.url ?? t.pendingUrl)?.startsWith(workbenchUrl) && t.id !== undefined,
    );
    const activeWorkbenchTab = workbenchTabs.find((t) => t.active);

    if (activeWorkbenchTab?.id !== undefined) {
      await chrome.tabs.remove(activeWorkbenchTab.id);
    } else if (workbenchTabs[0]?.id !== undefined) {
      await chrome.tabs.update(workbenchTabs[0].id, { active: true });
    } else {
      await chrome.tabs.create({ url: workbenchUrl });
    }
  };

  const handleOpenShortcutsPage = async () => {
    const url = isEdge
      ? 'edge://extensions/shortcuts'
      : 'chrome://extensions/shortcuts';
    await chrome.tabs.create({ url });
  };

  const handleOpenAppearanceSettings = async () => {
    await chrome.tabs.create({ url: 'chrome://settings/appearance' });
  };

  const handleBookmarkCurrentTab = async (parentId = '1') => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      setModal({
        mode: 'add_bookmark',
        title: tab?.title ?? '',
        url: tab?.url ?? '',
        parentId,
      });
    } catch {
      setModal({
        mode: 'add_bookmark',
        title: '',
        url: '',
        parentId,
      });
    }
  };

  const togglePin = async (id: string) => {
    const exists = pinnedIds.includes(id);
    const next = exists
      ? pinnedIds.filter((item) => item !== id)
      : [id, ...pinnedIds];
    setPinnedIds(next);
    await savePinnedIds(next);
    showToast(exists ? '已取消置顶' : '已置顶到顶部');
  };

  const toggleExpand = async (folderId: string) => {
    const next = new Set(expandedIds);
    if (next.has(folderId)) next.delete(folderId);
    else next.add(folderId);
    setExpandedIds(next);
    await saveExpandedFolders([...next]);
  };

  const expandOrCollapseSubtree = async (
    node: chrome.bookmarks.BookmarkTreeNode,
    expand: boolean,
  ) => {
    const ids = collectSubfolderIds(node);
    const next = new Set(expandedIds);
    for (const id of ids) {
      if (expand) next.add(id);
      else next.delete(id);
    }
    setExpandedIds(next);
    await saveExpandedFolders([...next]);
  };

  const allFolderIds = useMemo(() => {
    const ids: string[] = [];
    for (const root of roots) {
      for (const id of collectSubfolderIds(root)) {
        if (id !== '0') ids.push(id);
      }
    }
    return ids;
  }, [roots]);

  const isAllFoldersExpanded = useMemo(
    () =>
      allFolderIds.length > 0 &&
      allFolderIds.every((id) => expandedIds.has(id)),
    [allFolderIds, expandedIds],
  );

  const handleExpandAllFolders = async () => {
    const next = new Set(allFolderIds);
    setExpandedIds(next);
    await saveExpandedFolders([...next]);
  };

  const handleCollapseAllFolders = async () => {
    setExpandedIds(new Set());
    await saveExpandedFolders([]);
  };

  const handleToggleExpandAllFolders = async () => {
    if (isAllFoldersExpanded) {
      await handleCollapseAllFolders();
    } else {
      await handleExpandAllFolders();
    }
  };

  const handleUndoDelete = async (entry: RecycleBinEntry) => {
    try {
      const res = await restoreRecycleBinEntries([entry.id]);
      if (res.restoredIds.length > 0) {
        await refreshTree();
        showToast('已撤销删除');
      } else {
        showToast('撤销失败，可在回收站手动还原');
      }
    } catch {
      showToast('撤销失败，可在回收站手动还原');
    }
  };

  const handleDeleteBookmark = async (bookmark: BookmarkItem) => {
    try {
      const result = await safeDeleteBookmarks([bookmark], '侧边栏删除');
      await refreshTree();
      if (result.failedIds.length > 0) {
        showToast('删除失败（该书签可能受浏览器策略保护）');
      } else if (result.deletedIds.length > 0) {
        showToast('已移入本地回收站', result.createdEntries[0]);
      } else {
        showToast('该书签已不存在');
      }
    } catch (err) {
      showToast(
        err instanceof RecycleBinCapacityError
          ? err.message
          : '删除失败，请稍后重试',
      );
    }
  };

  const handleDeleteFolderTree = (node: chrome.bookmarks.BookmarkTreeNode) => {
    const childBookmarks = filterBookmarksByFolder(allBookmarks, roots, node.id);
    setConfirmState({
      open: true,
      title: `确定删除文件夹「${node.title || '未命名文件夹'}」？`,
      description:
        childBookmarks.length > 0
          ? `该文件夹内包含 ${childBookmarks.length} 条书签。\n删除前会重新读取最新内容并全部备份到本地「回收站」，可随时一键还原。`
          : '该文件夹为空，将直接删除。',
      onConfirm: async () => {
        setConfirmState((s) => ({ ...s, open: false }));
        try {
          const outcome = await safeDeleteFolderTree(
            node.id,
            `侧边栏删除文件夹：${node.title}`,
          );
          await refreshTree();
          showToast(
            outcome.remainingNonEmpty
              ? '已备份删除原有书签；检测到新增书签，已保留非空目录'
              : '文件夹已删除',
          );
        } catch (err) {
          showToast(
            err instanceof RecycleBinCapacityError
              ? err.message
              : '删除文件夹失败，请稍后重试',
          );
        }
      },
    });
  };

  const handleOpenAllInFolder = async (folderId: string) => {
    const items = filterBookmarksByFolder(allBookmarks, roots, folderId);
    if (items.length === 0) {
      showToast('该文件夹下没有书签');
      return;
    }
    const openNow = async () => {
      for (const item of items) {
        await chrome.tabs.create({ url: item.url, active: false });
      }
      showToast(`已在后台打开 ${items.length} 个标签页`);
    };

    if (items.length > 10) {
      setConfirmState({
        open: true,
        title: `确定同时打开 ${items.length} 个书签？`,
        description: '一次性打开较多标签页可能会占用较高内存，确认继续吗？',
        onConfirm: async () => {
          setConfirmState((s) => ({ ...s, open: false }));
          await openNow();
        },
      });
    } else {
      await openNow();
    }
  };

  const clearAutoExpandTimer = () => {
    if (autoExpandTimerRef.current !== null) {
      window.clearTimeout(autoExpandTimerRef.current.timer);
      autoExpandTimerRef.current = null;
    }
  };

  const scheduleAutoExpand = (folderId: string) => {
    if (expandedIds.has(folderId)) {
      clearAutoExpandTimer();
      return;
    }
    if (autoExpandTimerRef.current?.folderId === folderId) return;
    clearAutoExpandTimer();
    const timer = window.setTimeout(() => {
      autoExpandTimerRef.current = null;
      setExpandedIds((prev) => {
        if (prev.has(folderId)) return prev;
        const next = new Set(prev);
        next.add(folderId);
        void saveExpandedFolders([...next]);
        return next;
      });
    }, 500);
    autoExpandTimerRef.current = { folderId, timer };
  };

  const clearDragState = () => {
    clearAutoExpandTimer();
    setDragItem(null);
    setDropTarget(null);
  };

  const getDropPosition = (
    e: React.DragEvent<HTMLElement>,
    kind: 'bookmark' | 'folder' | 'root_folder' | 'pinned',
  ): DropPosition => {
    if (kind === 'root_folder') return 'inside';
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5;
    if (kind === 'folder') {
      if (ratio < 0.25) return 'before';
      if (ratio > 0.75) return 'after';
      return 'inside';
    }
    return ratio < 0.5 ? 'before' : 'after';
  };

  const handleTreeDrop = async (targetId: string, position: DropPosition) => {
    const activeDrag = dragItem;
    clearDragState();
    if (!activeDrag || activeDrag.source !== 'tree') return;

    const moveTarget = computeBookmarkMoveTarget(
      roots,
      activeDrag.id,
      targetId,
      position,
    );
    if (!moveTarget) return;

    await moveBookmarkItem(activeDrag.id, moveTarget.parentId, moveTarget.index);
    await refreshTree();
    showToast(position === 'inside' ? '已移入文件夹' : '已调整顺序');
  };

  const handlePinnedDrop = async (
    targetId: string,
    position: 'before' | 'after',
  ) => {
    const activeDrag = dragItem;
    clearDragState();
    if (!activeDrag || activeDrag.source !== 'pinned') return;

    const next = reorderIdList(pinnedIds, activeDrag.id, targetId, position);
    if (!next) return;
    setPinnedIds(next);
    await savePinnedIds(next);
    showToast('已调整置顶顺序');
  };

  const handleSearchKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Escape') {
      if (query) setQuery('');
      return;
    }
    if (searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % searchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(
        (prev) => (prev - 1 + searchResults.length) % searchResults.length,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = searchResults[activeIndex];
      if (target) {
        await openUrl(
          target.url,
          e.metaKey || e.ctrlKey ? 'new_tab_bg' : 'current',
          target.id,
        );
      }
    }
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal) return;

    if (modal.mode === 'add_bookmark') {
      if (!modal.url.trim()) return;
      await createBookmarkItem({
        parentId: modal.parentId,
        title: modal.title.trim() || modal.url.trim(),
        url: modal.url.trim(),
      });
      showToast('已收藏书签');
    } else if (modal.mode === 'edit_bookmark') {
      if (!modal.url.trim()) return;
      await updateBookmark(modal.id, {
        title: modal.title.trim() || modal.url.trim(),
        url: modal.url.trim(),
      });
      showToast('书签已更新');
    } else if (modal.mode === 'add_folder') {
      if (!modal.title.trim()) return;
      await createBookmarkItem({
        parentId: modal.parentId,
        title: modal.title.trim(),
      });
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(modal.parentId);
        void saveExpandedFolders([...next]);
        return next;
      });
      showToast('已新建文件夹');
    } else if (modal.mode === 'rename_folder') {
      if (!modal.title.trim()) return;
      await updateBookmark(modal.id, { title: modal.title.trim() });
      showToast('文件夹已重命名');
    } else if (modal.mode === 'add_ai_site') {
      const res = addCustomAiSite(aiSites, {
        name: modal.title,
        url: modal.url,
      });
      if ('error' in res) {
        showToast(res.error);
        return;
      }
      applyAiSitesUpdate(res.sites);
      handleSetDockCollapsed(false);
      handleSelectDockTarget(res.created.id);
      setModal(null);
      showToast(`已将「${res.created.name}」添加到 AI 侧栏`);
      return;
    }

    setModal(null);
    await refreshTree();
  };

  const iconSize = Math.max(14, Math.round(fontSize * 1.12));
  const subFontSize = Math.max(10, fontSize - 2);

  const renderTreeNodes = (
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    depth: number,
  ): React.ReactNode => {
    return nodes.map((node) => {
      if (node.id === '0' && node.children) {
        return renderTreeNodes(node.children, depth);
      }

      if (typeof node.url === 'string') {
        const item = bookmarkById.get(node.id);
        if (!item) return null;
        const isPinned = pinnedIds.includes(item.id);
        const isDragging = dragItem?.source === 'tree' && dragItem.id === item.id;
        const isHighlighted = highlightedNodeId === item.id;
        const activeDrop =
          dropTarget?.source === 'tree' && dropTarget.id === item.id
            ? dropTarget.position
            : null;
        return (
          <div
            key={item.id}
            ref={(el) => {
              if (el) nodeRowRefs.current.set(item.id, el);
              else nodeRowRefs.current.delete(item.id);
            }}
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', item.id);
              setDragItem({ source: 'tree', id: item.id });
            }}
            onDragEnd={clearDragState}
            onDragOver={(e) => {
              if (!dragItem || dragItem.source !== 'tree') return;
              clearAutoExpandTimer();
              const pos = getDropPosition(e, 'bookmark');
              if (!computeBookmarkMoveTarget(roots, dragItem.id, item.id, pos)) {
                if (dropTarget?.id === item.id) setDropTarget(null);
                return;
              }
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (
                dropTarget?.source !== 'tree' ||
                dropTarget.id !== item.id ||
                dropTarget.position !== pos
              ) {
                setDropTarget({ source: 'tree', id: item.id, position: pos });
              }
            }}
            onDragLeave={() => {
              if (dropTarget?.source === 'tree' && dropTarget.id === item.id) {
                setDropTarget(null);
              }
            }}
            onDrop={(e) => {
              if (!dragItem || dragItem.source !== 'tree') return;
              e.preventDefault();
              const pos = getDropPosition(e, 'bookmark');
              void handleTreeDrop(item.id, pos);
            }}
            onMouseDown={handleMiddleMouseDown}
            onAuxClick={(e) => handleBookmarkAuxClick(e, item.url, item.id)}
            onContextMenu={(e) =>
              openContextMenu(e, { kind: 'bookmark', bookmark: item })
            }
            style={{
              paddingLeft: `${depth * 14 + 10}px`,
              fontSize: `${fontSize}px`,
            }}
            className={`relative group flex items-center gap-2 rounded-lg pr-2 py-1.5 transition-colors cursor-pointer ${
              isDragging ? 'opacity-40 ' : ''
            }${
              isHighlighted
                ? 'bg-amber-100 dark:bg-amber-500/25 ring-2 ring-amber-400'
                : 'hover:bg-slate-100/90 dark:hover:bg-slate-800/80'
            }`}
            onClick={(e) =>
              openUrl(
                item.url,
                e.metaKey || e.ctrlKey ? 'new_tab_bg' : 'current',
                item.id,
              )
            }
            title={`${item.title}\n${item.url}`}
          >
            {activeDrop === 'before' && (
              <div
                style={{ left: `${depth * 14 + 8}px` }}
                className="pointer-events-none absolute right-2 top-0 h-0.5 rounded-full bg-blue-500 before:absolute before:-left-1 before:-top-[3px] before:h-2 before:w-2 before:rounded-full before:bg-blue-500"
              />
            )}
            {activeDrop === 'after' && (
              <div
                style={{ left: `${depth * 14 + 8}px` }}
                className="pointer-events-none absolute right-2 bottom-0 h-0.5 rounded-full bg-blue-500 before:absolute before:-left-1 before:-top-[3px] before:h-2 before:w-2 before:rounded-full before:bg-blue-500"
              />
            )}
            <SiteFavicon url={item.url} sizePx={iconSize} />
            <span className="flex-1 truncate text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white">
              {item.title}
            </span>
            <div
              className="hidden group-hover:flex items-center gap-0.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => togglePin(item.id)}
                className={`rounded p-1 hover:bg-white dark:hover:bg-slate-700 ${
                  isPinned
                    ? 'text-amber-500'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                title={isPinned ? '取消置顶' : '置顶'}
              >
                {isPinned ? (
                  <PinOff className="h-3.5 w-3.5" />
                ) : (
                  <Pin className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() =>
                  setModal({
                    mode: 'edit_bookmark',
                    id: item.id,
                    title: item.title,
                    url: item.url,
                  })
                }
                className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
                title="编辑"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBookmark(item)}
                className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-rose-600 dark:hover:text-rose-400"
                title="删除到回收站"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      }

      const isExpanded = expandedIds.has(node.id);
      const isProtectedRoot =
        !node.parentId || node.parentId === '0' || Boolean(node.unmodifiable);
      const isDraggingFolder =
        dragItem?.source === 'tree' && dragItem.id === node.id;
      const folderDrop =
        dropTarget?.source === 'tree' && dropTarget.id === node.id
          ? dropTarget.position
          : null;
      const isDragOverInside = folderDrop === 'inside';
      const isHighlighted = highlightedNodeId === node.id;

      return (
        <div key={node.id}>
          <div
            ref={(el) => {
              if (el) nodeRowRefs.current.set(node.id, el);
              else nodeRowRefs.current.delete(node.id);
            }}
            draggable={!isProtectedRoot}
            onDragStart={(e) => {
              if (isProtectedRoot) return;
              e.stopPropagation();
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', node.id);
              setDragItem({ source: 'tree', id: node.id });
            }}
            onDragEnd={clearDragState}
            style={{
              paddingLeft: `${depth * 14 + 6}px`,
              fontSize: `${fontSize}px`,
            }}
            onContextMenu={(e) =>
              openContextMenu(e, { kind: 'folder', node, isProtectedRoot })
            }
            onDragOver={(e) => {
              if (!dragItem || dragItem.source !== 'tree') return;
              const pos = getDropPosition(
                e,
                isProtectedRoot ? 'root_folder' : 'folder',
              );
              if (!computeBookmarkMoveTarget(roots, dragItem.id, node.id, pos)) {
                if (dropTarget?.id === node.id) setDropTarget(null);
                clearAutoExpandTimer();
                return;
              }
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (pos === 'inside') {
                scheduleAutoExpand(node.id);
              } else {
                clearAutoExpandTimer();
              }
              if (
                dropTarget?.source !== 'tree' ||
                dropTarget.id !== node.id ||
                dropTarget.position !== pos
              ) {
                setDropTarget({ source: 'tree', id: node.id, position: pos });
              }
            }}
            onDragLeave={() => {
              if (dropTarget?.source === 'tree' && dropTarget.id === node.id) {
                setDropTarget(null);
              }
              if (autoExpandTimerRef.current?.folderId === node.id) {
                clearAutoExpandTimer();
              }
            }}
            onDrop={(e) => {
              if (!dragItem || dragItem.source !== 'tree') return;
              e.preventDefault();
              const pos = getDropPosition(
                e,
                isProtectedRoot ? 'root_folder' : 'folder',
              );
              void handleTreeDrop(node.id, pos);
            }}
            onClick={() => toggleExpand(node.id)}
            className={`relative group flex items-center gap-1.5 rounded-lg pr-2 py-1.5 font-medium cursor-pointer transition-colors ${
              isDraggingFolder ? 'opacity-40 ' : ''
            }${
              isDragOverInside
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 ring-1 ring-blue-400'
                : isHighlighted
                  ? 'bg-amber-100 dark:bg-amber-500/25 text-amber-950 dark:text-amber-100 ring-2 ring-amber-400'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100/90 dark:hover:bg-slate-800/80'
            }`}
          >
            {folderDrop === 'before' && (
              <div
                style={{ left: `${depth * 14 + 6}px` }}
                className="pointer-events-none absolute right-2 top-0 h-0.5 rounded-full bg-blue-500 before:absolute before:-left-1 before:-top-[3px] before:h-2 before:w-2 before:rounded-full before:bg-blue-500"
              />
            )}
            {folderDrop === 'after' && (
              <div
                style={{ left: `${depth * 14 + 6}px` }}
                className="pointer-events-none absolute right-2 bottom-0 h-0.5 rounded-full bg-blue-500 before:absolute before:-left-1 before:-top-[3px] before:h-2 before:w-2 before:rounded-full before:bg-blue-500"
              />
            )}
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            )}
            {isExpanded ? (
              <FolderOpen
                style={{ width: iconSize, height: iconSize }}
                className="shrink-0 text-amber-500"
              />
            ) : (
              <Folder
                style={{ width: iconSize, height: iconSize }}
                className="shrink-0 text-amber-500"
              />
            )}
            <span className="flex-1 truncate">{node.title || '未命名文件夹'}</span>
            <span
              style={{ fontSize: `${subFontSize}px` }}
              className="text-slate-400 dark:text-slate-500 tabular-nums group-hover:hidden"
            >
              {node.children?.length ?? 0}
            </span>
            <div
              className="hidden group-hover:flex items-center gap-0.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() =>
                  setModal({ mode: 'add_folder', parentId: node.id, title: '' })
                }
                className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400"
                title="新建子文件夹"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              {!isProtectedRoot && (
                <button
                  type="button"
                  onClick={() =>
                    setModal({
                      mode: 'rename_folder',
                      id: node.id,
                      title: node.title,
                    })
                  }
                  className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
                  title="重命名文件夹"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {isExpanded && node.children && node.children.length > 0 && (
            <div>{renderTreeNodes(node.children, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  const applyAiSitesUpdate = (nextSites: AiSite[]) => {
    setAiSites(nextSites);
    void saveAiSites(nextSites);
    setLoadedAiIds((prev) => pruneLoadedAiIds(prev, nextSites));
    setActiveDockId((prev) => {
      const resolved = resolveActiveDockTarget(prev, nextSites);
      if (resolved !== prev) {
        void saveActiveDockId(resolved);
      }
      return resolved;
    });
  };

  const handleSelectDockTarget = (target: DockTarget) => {
    dockOverriddenRef.current = true;
    setContextMenu(null);
    setActiveDockId(target);
    void saveActiveDockId(target);
    if (target !== 'bookmarks') {
      lastAiIdRef.current = target;
      void saveLastAiId(target);
      setLoadedAiIds((prev) => (prev.includes(target) ? prev : [...prev, target]));
    }
  };

  const handleSetDockCollapsed = (collapsed: boolean) => {
    setDockCollapsed(collapsed);
    void saveDockCollapsed(collapsed);
  };

  const handleRefreshAiSite = (siteId: string) => {
    setReloadKeys((prev) => ({ ...prev, [siteId]: (prev[siteId] ?? 0) + 1 }));
  };

  const handleUnloadAiSite = (siteId: string) => {
    setLoadedAiIds((prev) => prev.filter((id) => id !== siteId));
    setReloadKeys((prev) => ({ ...prev, [siteId]: (prev[siteId] ?? 0) + 1 }));
    if (activeDockId === siteId) {
      dockOverriddenRef.current = true;
      setActiveDockId('bookmarks');
      void saveActiveDockId('bookmarks');
    }
    showToast('已休眠并释放该 AI 页面内存');
  };

  const handleOpenAiInNewTab = (url: string) => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      void chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleToggleAiSite = (id: string) => {
    applyAiSitesUpdate(toggleAiSite(aiSites, id));
  };

  const handleAddAiSite = (input: { name: string; url: string }): string | null => {
    const res = addCustomAiSite(aiSites, input);
    if ('error' in res) return res.error;
    applyAiSitesUpdate(res.sites);
    showToast(`已添加「${res.created.name}」`);
    return null;
  };

  const handleUpdateAiSite = (
    id: string,
    patch: { name: string; url: string },
  ): string | null => {
    const res = updateAiSite(aiSites, id, patch);
    if ('error' in res) return res.error;
    applyAiSitesUpdate(res.sites);
    showToast('已更新 AI 站点');
    return null;
  };

  const handleDeleteAiSite = (id: string) => {
    applyAiSitesUpdate(deleteAiSite(aiSites, id));
    showToast('已删除 AI 站点');
  };

  const handleReorderAiSites = (fromIndex: number, toIndex: number) => {
    applyAiSitesUpdate(reorderAiSites(aiSites, fromIndex, toIndex));
  };

  const handleResetBuiltInAiSites = () => {
    applyAiSitesUpdate(resetBuiltInAiSites(aiSites));
    showToast('已恢复默认 AI 预设');
  };

  const handleAddCurrentTabToAi = async () => {
    let tabTitle = '';
    let tabUrl = '';
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      tabTitle = activeTab?.title?.trim() ?? '';
      tabUrl = activeTab?.url?.trim() ?? '';
    }

    const normalized = normalizeAiUrl(tabUrl);
    if (!normalized) {
      showToast('当前页面不支持添加到 AI 侧栏');
      return;
    }

    const existing = aiSites.find((s) => normalizeAiUrl(s.url) === normalized);
    if (existing) {
      if (!existing.enabled) {
        const nextSites = toggleAiSite(aiSites, existing.id, true);
        applyAiSitesUpdate(nextSites);
        handleSelectDockTarget(existing.id);
        showToast(`已重新启用「${existing.name}」`);
      } else {
        handleSelectDockTarget(existing.id);
        showToast(`「${existing.name}」已在 AI 侧栏中`);
      }
      return;
    }

    setModal({
      mode: 'add_ai_site',
      title: tabTitle || new URL(normalized).hostname,
      url: normalized,
    });
  };

  const handleOpenAiSiteContextMenu = (e: React.MouseEvent, site: AiSite) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 196;
    const menuHeight = 180;
    const x = Math.min(e.clientX, Math.max(8, window.innerWidth - menuWidth - 8));
    const y = Math.min(e.clientY, Math.max(8, window.innerHeight - menuHeight - 8));
    setContextMenu({ kind: 'ai_site', x, y, site });
  };

  const activeAiSite =
    activeDockId === 'bookmarks'
      ? null
      : (aiSites.find((s) => s.id === activeDockId && s.enabled) ?? null);

  const mountedAiSites = useMemo(() => {
    const loadedSet = new Set(loadedAiIds);
    return aiSites.filter((s) => s.enabled && loadedSet.has(s.id));
  }, [aiSites, loadedAiIds]);

  if (!dockHydrated) {
    return (
      <div className="flex h-screen bg-white dark:bg-slate-950 select-none overflow-hidden" />
    );
  }

  return (
    <div
      className={`flex h-screen ${
        effectiveDockPosition === 'right' ? 'flex-row-reverse' : 'flex-row'
      } bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none overflow-hidden`}
    >
      {!dockCollapsed && (
        <DockRail
          sites={aiSites}
          activeTarget={activeDockId}
          loadedAiIds={loadedAiIds}
          position={effectiveDockPosition}
          onSelectTarget={handleSelectDockTarget}
          onSiteContextMenu={handleOpenAiSiteContextMenu}
          onAddCurrentTab={() => void handleAddCurrentTabToAi()}
          onOpenManager={() => setAiManagerOpen(true)}
          onCollapse={() => handleSetDockCollapsed(true)}
        />
      )}

      <div className="flex flex-1 min-w-0 flex-col h-full overflow-hidden">
        {(mountedAiSites.length > 0 || activeAiSite !== null) && (
          <div
            className={
              activeAiSite !== null
                ? 'flex flex-1 min-h-0 flex-col'
                : 'hidden'
            }
          >
            <AiWorkspace
              activeSite={activeAiSite}
              mountedSites={mountedAiSites}
              reloadKeys={reloadKeys}
              dockCollapsed={dockCollapsed}
              dockPosition={effectiveDockPosition}
              onExpandDock={() => handleSetDockCollapsed(false)}
              onRefreshSite={handleRefreshAiSite}
              onUnloadSite={handleUnloadAiSite}
              onOpenInNewTab={handleOpenAiInNewTab}
              onOpenManager={() => setAiManagerOpen(true)}
            />
          </div>
        )}

        <div
          className={
            activeAiSite === null
              ? 'relative flex flex-1 min-h-0 flex-col'
              : 'hidden'
          }
        >
      {/* Compact Top Bar */}
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 px-3 py-2.5 bg-slate-50/80 dark:bg-slate-900/90">
        <div className="flex items-center gap-2 min-w-0">
          {dockCollapsed && effectiveDockPosition === 'left' && (
            <button
              type="button"
              onClick={() => handleSetDockCollapsed(false)}
              className="rounded-lg p-1 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              title="展开左侧 AI 切换栏"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xs">
            <Bookmark className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              MarkDock
            </div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500">
              {allBookmarks.length} 条书签
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleBookmarkCurrentTab('1')}
            className="rounded-lg p-1.5 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors cursor-pointer"
            title="收藏当前网页"
          >
            <BookmarkPlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={`rounded-lg p-1.5 border transition-colors cursor-pointer ${
              settingsOpen
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
            }`}
            title="侧边栏设置（外观、字号、AI 栏位置、快捷键）"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleOpenCleanerWorkbench}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-xs transition-colors cursor-pointer bg-blue-600 text-white hover:bg-blue-700"
            title="打开清理工作台（已打开时切换定位，当前页再次点击关闭）"
          >
            <Radar className="h-3.5 w-3.5" />
            <span>清理</span>
          </button>
          {dockCollapsed && effectiveDockPosition === 'right' && (
            <button
              type="button"
              onClick={() => handleSetDockCollapsed(false)}
              className="rounded-lg p-1 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              title="展开右侧 AI 切换栏"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Keyboard-first Search Bar */}
      <div className="border-b border-slate-100 dark:border-slate-800 p-3 bg-white dark:bg-slate-950">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            style={{ fontSize: `${Math.min(16, fontSize)}px` }}
            placeholder="搜标题 / 拼音首字母(kf) / 链接 / 目录..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 py-2 pl-8 pr-8 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                focusSearch();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              aria-label="清空搜索"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 px-0.5">
          <span>↑↓ 选择 · Enter 打开 · 中键后台开 · 右键更多</span>
          <button
            type="button"
            onClick={handleOpenShortcutsPage}
            className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            改快捷键
          </button>
        </div>
        {!query.trim() && (
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 dark:bg-slate-900 p-0.5">
            {(
              [
                { key: 'tree', label: '目录', icon: FolderTree },
                { key: 'recent', label: '最近添加', icon: Clock },
                { key: 'frequent', label: '常用', icon: Flame },
              ] as const
            ).map(({ key, label, icon: Icon }) => {
              const active = activeView === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (activeView === key) {
                      scrollToTop();
                    } else {
                      setActiveView(key);
                      scrollContainerRef.current?.scrollTo({ top: 0 });
                      setShowScrollTop(false);
                    }
                  }}
                  title={active ? `${label}（点击回到顶部）` : label}
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Scroll Area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-2 py-2 space-y-3"
        onScroll={(e) => {
          if (contextMenu) setContextMenu(null);
          const shouldShow = e.currentTarget.scrollTop > 240;
          setShowScrollTop((prev) => (prev === shouldShow ? prev : shouldShow));
        }}
      >
        {query.trim() ? (
          /* Instant Search Results */
          <div className="space-y-1">
            {searchResults.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                未找到匹配 “{query}” 的书签
              </div>
            ) : (
              searchResults.map((item, idx) => {
                const isActive = idx === activeIndex;
                const isPinned = pinnedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    ref={isActive ? activeItemRef : null}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={handleMiddleMouseDown}
                    onAuxClick={(e) => handleBookmarkAuxClick(e, item.url, item.id)}
                    onContextMenu={(e) =>
                      openContextMenu(e, { kind: 'bookmark', bookmark: item })
                    }
                    onClick={(e) =>
                      openUrl(
                        item.url,
                        e.metaKey || e.ctrlKey ? 'new_tab_bg' : 'current',
                        item.id,
                      )
                    }
                    className={`group flex items-start gap-2 rounded-xl px-2.5 py-2 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/60 ring-1 ring-blue-200 dark:ring-blue-800'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="mt-0.5">
                      <SiteFavicon url={item.url} sizePx={iconSize} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        style={{ fontSize: `${fontSize}px` }}
                        className="font-medium text-slate-900 dark:text-slate-100 truncate"
                      >
                        <HighlightText text={item.title} query={query} />
                      </div>
                      <div
                        style={{ fontSize: `${subFontSize}px` }}
                        className="mt-0.5 text-slate-500 dark:text-slate-400 truncate"
                      >
                        <HighlightText text={item.url} query={query} />
                      </div>
                      <div
                        style={{ fontSize: `${Math.max(10, subFontSize - 1)}px` }}
                        className="mt-0.5 text-slate-400 dark:text-slate-500 truncate"
                      >
                        <HighlightText
                          text={item.folderPath.join(' / ') || '根目录'}
                          query={query}
                        />
                      </div>
                    </div>
                    <div
                      className="hidden group-hover:flex items-center gap-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => locateNode(item.id)}
                        className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400"
                        title="在目录中定位"
                      >
                        <LocateFixed className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePin(item.id)}
                        className={`rounded p-1 hover:bg-white dark:hover:bg-slate-700 ${
                          isPinned
                            ? 'text-amber-500'
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                        title={isPinned ? '取消置顶' : '置顶'}
                      >
                        {isPinned ? (
                          <PinOff className="h-3.5 w-3.5" />
                        ) : (
                          <Pin className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setModal({
                            mode: 'edit_bookmark',
                            id: item.id,
                            title: item.title,
                            url: item.url,
                          })
                        }
                        className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
                        title="编辑"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBookmark(item)}
                        className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-rose-600 dark:hover:text-rose-400"
                        title="删除到回收站"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : activeView === 'recent' ? (
          /* Recently Added Bookmarks View */
          <div className="space-y-1">
            <div className="mb-1 flex items-center justify-between px-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              <span>最近添加（最新 {recentBookmarks.length} 条）</span>
            </div>
            {recentBookmarks.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                暂无书签记录
              </div>
            ) : (
              recentBookmarks.map((item) => {
                const isPinned = pinnedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onMouseDown={handleMiddleMouseDown}
                    onAuxClick={(e) => handleBookmarkAuxClick(e, item.url, item.id)}
                    onContextMenu={(e) =>
                      openContextMenu(e, { kind: 'bookmark', bookmark: item })
                    }
                    onClick={(e) =>
                      openUrl(
                        item.url,
                        e.metaKey || e.ctrlKey ? 'new_tab_bg' : 'current',
                        item.id,
                      )
                    }
                    title={`${item.title}\n${item.url}`}
                    className="group flex items-start gap-2 rounded-xl px-2.5 py-2 hover:bg-slate-100/90 dark:hover:bg-slate-800/80 cursor-pointer transition-colors"
                  >
                    <div className="mt-0.5">
                      <SiteFavicon url={item.url} sizePx={iconSize} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        style={{ fontSize: `${fontSize}px` }}
                        className="font-medium text-slate-800 dark:text-slate-100 truncate"
                      >
                        {item.title}
                      </div>
                      <div
                        style={{ fontSize: `${Math.max(10, subFontSize - 1)}px` }}
                        className="mt-0.5 flex items-center gap-1.5 text-slate-400 dark:text-slate-500"
                      >
                        <span className="truncate">
                          {item.folderPath.join(' / ') || '根目录'}
                        </span>
                        {item.dateAdded && (
                          <span className="shrink-0 tabular-nums">
                            · {formatRelativeTime(item.dateAdded)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className="hidden group-hover:flex items-center gap-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => locateNode(item.id)}
                        className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400"
                        title="在目录中定位"
                      >
                        <LocateFixed className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePin(item.id)}
                        className={`rounded p-1 hover:bg-white dark:hover:bg-slate-700 ${
                          isPinned
                            ? 'text-amber-500'
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                        title={isPinned ? '取消置顶' : '置顶'}
                      >
                        {isPinned ? (
                          <PinOff className="h-3.5 w-3.5" />
                        ) : (
                          <Pin className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setModal({
                            mode: 'edit_bookmark',
                            id: item.id,
                            title: item.title,
                            url: item.url,
                          })
                        }
                        className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
                        title="编辑"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBookmark(item)}
                        className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-rose-600 dark:hover:text-rose-400"
                        title="删除到回收站"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : activeView === 'frequent' ? (
          /* Frequently Visited Bookmarks View */
          <div className="space-y-1">
            <div className="mb-1 flex items-center justify-between px-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              <span>常用书签（本地统计 {frequentBookmarks.length} 条）</span>
            </div>
            {frequentBookmarks.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-1.5">
                <Flame className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-700" />
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  还没有访问记录
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                  在侧边栏点击或回车打开书签后，这里会自动按频次排序呈现
                </div>
              </div>
            ) : (
              frequentBookmarks.map(({ bookmark: item, count, lastVisitedAt }) => {
                const isPinned = pinnedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onMouseDown={handleMiddleMouseDown}
                    onAuxClick={(e) => handleBookmarkAuxClick(e, item.url, item.id)}
                    onContextMenu={(e) =>
                      openContextMenu(e, { kind: 'bookmark', bookmark: item })
                    }
                    onClick={(e) =>
                      openUrl(
                        item.url,
                        e.metaKey || e.ctrlKey ? 'new_tab_bg' : 'current',
                        item.id,
                      )
                    }
                    title={`${item.title}\n${item.url}`}
                    className="group flex items-start gap-2 rounded-xl px-2.5 py-2 hover:bg-slate-100/90 dark:hover:bg-slate-800/80 cursor-pointer transition-colors"
                  >
                    <div className="mt-0.5">
                      <SiteFavicon url={item.url} sizePx={iconSize} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        style={{ fontSize: `${fontSize}px` }}
                        className="font-medium text-slate-800 dark:text-slate-100 truncate"
                      >
                        {item.title}
                      </div>
                      <div
                        style={{ fontSize: `${Math.max(10, subFontSize - 1)}px` }}
                        className="mt-0.5 flex items-center gap-1.5 text-slate-400 dark:text-slate-500"
                      >
                        <span className="truncate">
                          {item.folderPath.join(' / ') || '根目录'}
                        </span>
                        {lastVisitedAt > 0 && (
                          <span className="shrink-0 tabular-nums">
                            · {formatRelativeTime(lastVisitedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="mt-0.5 shrink-0 rounded-full bg-orange-50 dark:bg-orange-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400 tabular-nums group-hover:hidden">
                      {count}次
                    </span>
                    <div
                      className="hidden group-hover:flex items-center gap-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => locateNode(item.id)}
                        className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400"
                        title="在目录中定位"
                      >
                        <LocateFixed className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePin(item.id)}
                        className={`rounded p-1 hover:bg-white dark:hover:bg-slate-700 ${
                          isPinned
                            ? 'text-amber-500'
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                        title={isPinned ? '取消置顶' : '置顶'}
                      >
                        {isPinned ? (
                          <PinOff className="h-3.5 w-3.5" />
                        ) : (
                          <Pin className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setModal({
                            mode: 'edit_bookmark',
                            id: item.id,
                            title: item.title,
                            url: item.url,
                          })
                        }
                        className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
                        title="编辑"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBookmark(item)}
                        className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-rose-600 dark:hover:text-rose-400"
                        title="删除到回收站"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Pinned + Full Folder Tree */
          <>
            {pinnedBookmarks.length > 0 && (
              <section className="rounded-xl border border-amber-200/70 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-950/25 p-2">
                <div className="mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                  <Pin className="h-3 w-3" />
                  <span>置顶常用 ({pinnedBookmarks.length})</span>
                </div>
                <div className="space-y-0.5">
                  {pinnedBookmarks.map((item) => {
                    const isDraggingPinned =
                      dragItem?.source === 'pinned' && dragItem.id === item.id;
                    const pinnedDrop =
                      dropTarget?.source === 'pinned' && dropTarget.id === item.id
                        ? dropTarget.position
                        : null;
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', item.id);
                          setDragItem({ source: 'pinned', id: item.id });
                        }}
                        onDragEnd={clearDragState}
                        onDragOver={(e) => {
                          if (
                            !dragItem ||
                            dragItem.source !== 'pinned' ||
                            dragItem.id === item.id
                          ) {
                            return;
                          }
                          const pos = getDropPosition(e, 'pinned') as
                            | 'before'
                            | 'after';
                          if (!reorderIdList(pinnedIds, dragItem.id, item.id, pos)) {
                            if (dropTarget?.id === item.id) setDropTarget(null);
                            return;
                          }
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (
                            dropTarget?.source !== 'pinned' ||
                            dropTarget.id !== item.id ||
                            dropTarget.position !== pos
                          ) {
                            setDropTarget({
                              source: 'pinned',
                              id: item.id,
                              position: pos,
                            });
                          }
                        }}
                        onDragLeave={() => {
                          if (
                            dropTarget?.source === 'pinned' &&
                            dropTarget.id === item.id
                          ) {
                            setDropTarget(null);
                          }
                        }}
                        onDrop={(e) => {
                          if (!dragItem || dragItem.source !== 'pinned') return;
                          e.preventDefault();
                          const pos = getDropPosition(e, 'pinned') as
                            | 'before'
                            | 'after';
                          void handlePinnedDrop(item.id, pos);
                        }}
                        style={{ fontSize: `${fontSize}px` }}
                        onMouseDown={handleMiddleMouseDown}
                        onAuxClick={(e) =>
                          handleBookmarkAuxClick(e, item.url, item.id)
                        }
                        onContextMenu={(e) =>
                          openContextMenu(e, { kind: 'bookmark', bookmark: item })
                        }
                        onClick={(e) =>
                          openUrl(
                            item.url,
                            e.metaKey || e.ctrlKey ? 'new_tab_bg' : 'current',
                            item.id,
                          )
                        }
                        className={`relative group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/90 dark:hover:bg-slate-800/80 cursor-pointer transition-colors ${
                          isDraggingPinned ? 'opacity-40' : ''
                        }`}
                        title={`${item.title}\n${item.url}`}
                      >
                        {pinnedDrop === 'before' && (
                          <div className="pointer-events-none absolute left-2 right-2 top-0 h-0.5 rounded-full bg-blue-500 before:absolute before:-left-1 before:-top-[3px] before:h-2 before:w-2 before:rounded-full before:bg-blue-500" />
                        )}
                        {pinnedDrop === 'after' && (
                          <div className="pointer-events-none absolute left-2 right-2 bottom-0 h-0.5 rounded-full bg-blue-500 before:absolute before:-left-1 before:-top-[3px] before:h-2 before:w-2 before:rounded-full before:bg-blue-500" />
                        )}
                        <SiteFavicon url={item.url} sizePx={iconSize} />
                        <span className="flex-1 truncate text-slate-800 dark:text-slate-200">
                          {item.title}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void togglePin(item.id);
                          }}
                          className="hidden group-hover:block rounded p-0.5 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                          title="取消置顶"
                        >
                          <PinOff className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <div className="mb-1 flex items-center justify-between px-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                <span>全部目录（支持拖拽排序）</span>
                <button
                  type="button"
                  onClick={() => void handleToggleExpandAllFolders()}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-normal text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer transition-colors"
                  title={isAllFoldersExpanded ? '收起全部文件夹' : '展开全部文件夹'}
                >
                  {isAllFoldersExpanded ? (
                    <>
                      <ChevronsDownUp className="h-3 w-3" />
                      <span>全部收起</span>
                    </>
                  ) : (
                    <>
                      <ChevronsUpDown className="h-3 w-3" />
                      <span>全部展开</span>
                    </>
                  )}
                </button>
              </div>
              <div className="space-y-0.5">{renderTreeNodes(roots, 0)}</div>
            </section>
          </>
        )}
      </div>

      {/* Floating Scroll-to-Top & Collapse-All Controls */}
      <div
        className={`absolute bottom-4 right-3 z-20 flex flex-col items-center gap-1.5 transition-all duration-200 ${
          showScrollTop
            ? 'opacity-100 translate-y-0'
            : 'pointer-events-none opacity-0 translate-y-2'
        }`}
      >
        {!query.trim() && activeView === 'tree' && (
          <button
            type="button"
            onClick={() => {
              void handleCollapseAllFolders();
              scrollToTop();
            }}
            title="全部收起并回到顶部"
            aria-label="全部收起并回到顶部"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/90 dark:border-slate-700/90 bg-white/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 shadow-md backdrop-blur-xs hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            <ChevronsDownUp className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={scrollToTop}
          title="回到顶部"
          aria-label="回到顶部"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/90 dark:border-slate-700/90 bg-white/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 shadow-md backdrop-blur-xs hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
        </div>
      </div>

      {/* Custom Right-Click Context Menu (root-level so it works in both Bookmarks & AI views) */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 shadow-xl text-xs text-slate-700 dark:text-slate-200"
        >
          {contextMenu.kind === 'ai_site' ? (
            <>
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 truncate">
                {contextMenu.site.name}
              </div>
              <button
                type="button"
                onClick={() => {
                  const id = contextMenu.site.id;
                  setContextMenu(null);
                  handleSelectDockTarget(id);
                  handleRefreshAiSite(id);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <RotateCw className="h-3.5 w-3.5 text-slate-400" />
                <span>刷新页面</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const url = contextMenu.site.url;
                  setContextMenu(null);
                  handleOpenAiInNewTab(url);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                <span>在新标签页打开</span>
              </button>
              {loadedAiIds.includes(contextMenu.site.id) && (
                <button
                  type="button"
                  onClick={() => {
                    const id = contextMenu.site.id;
                    setContextMenu(null);
                    handleUnloadAiSite(id);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Power className="h-3.5 w-3.5 text-amber-500" />
                  <span>休眠释放内存</span>
                </button>
              )}
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <button
                type="button"
                onClick={() => {
                  const id = contextMenu.site.id;
                  setContextMenu(null);
                  handleDeleteAiSite(id);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>删除此 AI</span>
              </button>
            </>
          ) : contextMenu.kind === 'bookmark' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const { url, id } = contextMenu.bookmark;
                  setContextMenu(null);
                  void openUrl(url, 'new_tab_active', id);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                <span>在新标签页打开</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const { url, id } = contextMenu.bookmark;
                  setContextMenu(null);
                  void openUrl(url, 'new_tab_bg', id);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                <span>在后台新标签页打开</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const { url, id } = contextMenu.bookmark;
                  setContextMenu(null);
                  void openUrl(url, 'new_window', id);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <AppWindow className="h-3.5 w-3.5 text-slate-400" />
                <span>在新窗口打开</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const { url, id } = contextMenu.bookmark;
                  setContextMenu(null);
                  void openUrl(url, 'incognito', id);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                <span>在无痕窗口打开</span>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              <button
                type="button"
                onClick={() => {
                  const id = contextMenu.bookmark.id;
                  setContextMenu(null);
                  locateNode(id);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <LocateFixed className="h-3.5 w-3.5 text-slate-400" />
                <span>在目录中定位</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const b = contextMenu.bookmark;
                  setContextMenu(null);
                  setModal({
                    mode: 'edit_bookmark',
                    id: b.id,
                    title: b.title,
                    url: b.url,
                  });
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5 text-slate-400" />
                <span>编辑书签</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const url = contextMenu.bookmark.url;
                  setContextMenu(null);
                  try {
                    await navigator.clipboard.writeText(url);
                    showToast('已复制链接地址');
                  } catch {
                    showToast('复制失败');
                  }
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5 text-slate-400" />
                <span>复制链接地址</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = contextMenu.bookmark.id;
                  setContextMenu(null);
                  void togglePin(id);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {pinnedIds.includes(contextMenu.bookmark.id) ? (
                  <>
                    <PinOff className="h-3.5 w-3.5 text-amber-500" />
                    <span>取消置顶</span>
                  </>
                ) : (
                  <>
                    <Pin className="h-3.5 w-3.5 text-slate-400" />
                    <span>置顶到顶部</span>
                  </>
                )}
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              <button
                type="button"
                onClick={() => {
                  const b = contextMenu.bookmark;
                  setContextMenu(null);
                  void handleDeleteBookmark(b);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>删除（移入回收站）</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  const id = contextMenu.node.id;
                  setContextMenu(null);
                  void handleOpenAllInFolder(id);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                <span>打开全部书签</span>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              <button
                type="button"
                onClick={() => {
                  const id = contextMenu.node.id;
                  setContextMenu(null);
                  void handleBookmarkCurrentTab(id);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <BookmarkPlus className="h-3.5 w-3.5 text-slate-400" />
                <span>在此新建书签</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = contextMenu.node.id;
                  setContextMenu(null);
                  setModal({ mode: 'add_folder', parentId: id, title: '' });
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <FolderPlus className="h-3.5 w-3.5 text-slate-400" />
                <span>新建子文件夹</span>
              </button>
              {!contextMenu.isProtectedRoot && (
                <button
                  type="button"
                  onClick={() => {
                    const n = contextMenu.node;
                    setContextMenu(null);
                    setModal({
                      mode: 'rename_folder',
                      id: n.id,
                      title: n.title,
                    });
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5 text-slate-400" />
                  <span>重命名文件夹</span>
                </button>
              )}

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              <button
                type="button"
                onClick={() => {
                  const n = contextMenu.node;
                  setContextMenu(null);
                  void expandOrCollapseSubtree(n, true);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
                <span>展开全部子目录</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const n = contextMenu.node;
                  setContextMenu(null);
                  void expandOrCollapseSubtree(n, false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Folder className="h-3.5 w-3.5 text-slate-400" />
                <span>收起全部子目录</span>
              </button>

              {!contextMenu.isProtectedRoot && (
                <>
                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                  <button
                    type="button"
                    onClick={() => {
                      const n = contextMenu.node;
                      setContextMenu(null);
                      handleDeleteFolderTree(n);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>删除文件夹</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Lightweight Add/Edit Modal (root-level so it works in both Bookmarks & AI views) */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3">
          <form
            onSubmit={handleSubmitModal}
            className="w-full max-w-xs rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-xl border border-slate-200 dark:border-slate-700 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {modal.mode === 'add_bookmark'
                  ? '收藏书签'
                  : modal.mode === 'edit_bookmark'
                    ? '编辑书签'
                    : modal.mode === 'add_folder'
                      ? '新建文件夹'
                      : modal.mode === 'add_ai_site'
                        ? '添加到 AI 侧栏'
                        : '重命名文件夹'}
              </h3>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                名称
              </label>
              <input
                type="text"
                autoFocus
                value={modal.title}
                onChange={(e) => setModal({ ...modal, title: e.target.value })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            {(modal.mode === 'add_bookmark' ||
              modal.mode === 'edit_bookmark' ||
              modal.mode === 'add_ai_site') && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  链接地址
                </label>
                <input
                  type="url"
                  required
                  value={modal.url}
                  onChange={(e) => setModal({ ...modal, url: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            {modal.mode === 'add_bookmark' && (
              <FolderTreePicker
                roots={roots}
                selectedFolderId={modal.parentId}
                onSelect={(folderId) =>
                  setModal({ ...modal, parentId: folderId })
                }
              />
            )}

            {modal.mode === 'add_bookmark' && duplicateMatches.length > 0 && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/40 p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>
                    该网页已收藏过（{duplicateMatches.length} 处）
                  </span>
                </div>
                <div className="max-h-24 overflow-y-auto space-y-1">
                  {duplicateMatches.map((match) => (
                    <div
                      key={match.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-white/80 dark:bg-slate-900/70 px-2 py-1 text-[11px]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-700 dark:text-slate-200">
                          {match.title}
                        </div>
                        <div className="truncate text-[10px] text-slate-400 dark:text-slate-500">
                          {match.folderPath.join(' / ') || '根目录'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setModal(null);
                          setActiveDockId('bookmarks');
                          void saveActiveDockId('bookmarks');
                          locateNode(match.id);
                        }}
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800/80 cursor-pointer transition-colors"
                        title="定位到已收藏书签"
                      >
                        <LocateFixed className="h-3 w-3" />
                        <span>定位</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
              >
                {modal.mode === 'add_bookmark' && duplicateMatches.length > 0
                  ? '仍要保存'
                  : '确定'}
              </button>
            </div>
          </form>
        </div>
      )}

      <SidebarSettingsModal
        open={settingsOpen}
        themeMode={themeMode}
        fontSize={fontSize}
        dockPosition={dockPosition}
        isEdge={isEdge}
        onSelectTheme={(theme) => void handleSelectTheme(theme)}
        onChangeFontSize={updateFontSize}
        onSelectDockPosition={(pos) => void handleSelectDockPosition(pos)}
        onOpenAppearanceSettings={() => void handleOpenAppearanceSettings()}
        onOpenShortcuts={handleOpenShortcutsPage}
        onClose={() => setSettingsOpen(false)}
      />

      <AiManagerModal
        open={aiManagerOpen}
        sites={aiSites}
        loadedAiIds={loadedAiIds}
        onClose={() => setAiManagerOpen(false)}
        onToggle={handleToggleAiSite}
        onAdd={handleAddAiSite}
        onUpdate={handleUpdateAiSite}
        onDelete={handleDeleteAiSite}
        onReorder={handleReorderAiSites}
        onResetBuiltIn={handleResetBuiltInAiSites}
      />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmText="确认"
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
      />

      {toast && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg bg-slate-800 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-white shadow-md whitespace-nowrap">
          <span>{toast.message}</span>
          {toast.undoEntry && (
            <button
              type="button"
              onClick={() => {
                const entry = toast.undoEntry;
                setToast(null);
                if (entry) void handleUndoDelete(entry);
              }}
              className="inline-flex items-center gap-1 rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300 hover:bg-white/25 cursor-pointer transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              <span>撤销</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
