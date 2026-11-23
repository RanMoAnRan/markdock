import { useMemo, useState } from 'react';
import {
  Bookmark,
  Check,
  ExternalLink,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type {
  BookmarkItem,
  CheckResult,
  CheckStatus,
  FolderNode,
} from '../types/bookmark';
import { filterBookmarksByFolder, updateBookmark } from '../core/bookmarks';
import { ConfirmDialog } from './ConfirmDialog';

type SortKey = 'newest' | 'oldest' | 'title' | 'folder';

interface AllBookmarksTabProps {
  roots: chrome.bookmarks.BookmarkTreeNode[];
  bookmarks: BookmarkItem[];
  folders: FolderNode[];
  scanResults: CheckResult[];
  onDeleteBookmarks: (items: BookmarkItem[], reason: string) => Promise<void>;
  onAddWhitelist: (pattern: string, matchType: 'url' | 'domain') => Promise<void>;
  onBookmarksUpdated: () => Promise<void>;
  onNotify: (message: string, type?: 'success' | 'info' | 'error') => void;
}

const STATUS_BADGE_MAP: Record<CheckStatus, { label: string; className: string }> = {
  valid: { label: '有效', className: 'bg-emerald-50 text-emerald-700 border-emerald-200/70' },
  dead_404: { label: '失效 404', className: 'bg-rose-50 text-rose-700 border-rose-200/70' },
  dns_network: { label: '连接失败', className: 'bg-red-50 text-red-700 border-red-200/70' },
  timeout: { label: '超时', className: 'bg-amber-50 text-amber-700 border-amber-200/70' },
  server_5xx: { label: '服务器 5xx', className: 'bg-orange-50 text-orange-700 border-orange-200/70' },
  client_4xx: { label: '异常 4xx', className: 'bg-amber-50 text-amber-800 border-amber-200/70' },
  redirect: { label: '重定向', className: 'bg-blue-50 text-blue-700 border-blue-200/70' },
  restricted: { label: '受限/验证', className: 'bg-purple-50 text-purple-700 border-purple-200/70' },
  skipped: { label: '已跳过', className: 'bg-slate-100 text-slate-600 border-slate-200/70' },
};

export function AllBookmarksTab({
  roots,
  bookmarks,
  folders,
  scanResults,
  onDeleteBookmarks,
  onAddWhitelist,
  onBookmarksUpdated,
  onNotify,
}: AllBookmarksTabProps) {
  const [folderId, setFolderId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: '', description: '', onConfirm: () => {} });

  const statusById = useMemo(() => {
    const map = new Map<string, CheckResult>();
    for (const r of scanResults) {
      map.set(r.bookmark.id, r);
    }
    return map;
  }, [scanResults]);

  const filteredBookmarks = useMemo(() => {
    const scoped = filterBookmarksByFolder(bookmarks, roots, folderId);
    const q = searchQuery.trim().toLowerCase();

    const matched = q
      ? scoped.filter(
          (b) =>
            b.title.toLowerCase().includes(q) ||
            b.url.toLowerCase().includes(q) ||
            b.folderPath.join(' / ').toLowerCase().includes(q),
        )
      : scoped;

    return [...matched].sort((a, b) => {
      if (sortBy === 'newest') return (b.dateAdded ?? 0) - (a.dateAdded ?? 0);
      if (sortBy === 'oldest') return (a.dateAdded ?? 0) - (b.dateAdded ?? 0);
      if (sortBy === 'title') return a.title.localeCompare(b.title, 'zh-CN');
      return a.folderPath
        .join(' / ')
        .localeCompare(b.folderPath.join(' / '), 'zh-CN');
    });
  }, [bookmarks, roots, folderId, searchQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredBookmarks.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedBookmarks = useMemo(
    () => filteredBookmarks.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredBookmarks, safePage, pageSize],
  );

  const allPageSelected =
    pagedBookmarks.length > 0 &&
    pagedBookmarks.every((b) => selectedIds.has(b.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const b of pagedBookmarks) next.delete(b.id);
      } else {
        for (const b of pagedBookmarks) next.add(b.id);
      }
      return next;
    });
  };

  const handleSaveEdit = async (bookmark: BookmarkItem) => {
    const nextTitle = editTitle.trim();
    const nextUrl = editUrl.trim();
    if (!nextUrl) {
      onNotify('链接不能为空', 'error');
      return;
    }
    await updateBookmark(bookmark.id, {
      title: nextTitle || nextUrl,
      url: nextUrl,
    });
    setEditingId(null);
    await onBookmarksUpdated();
    onNotify('书签已更新', 'success');
  };

  const handleDeleteSelected = () => {
    const targets = bookmarks.filter((b) => selectedIds.has(b.id));
    if (targets.length === 0) return;

    setConfirmState({
      open: true,
      title: `确定删除选中的 ${targets.length} 条书签？`,
      description: '删除前会自动备份到本地回收站，你可以随时还原。',
      onConfirm: async () => {
        setConfirmState((s) => ({ ...s, open: false }));
        await onDeleteBookmarks(targets, '全部书签列表批量删除');
        setSelectedIds(new Set());
      },
    });
  };

  const formatDate = (ts?: number) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('zh-CN');
  };

  return (
    <div className="space-y-5">
      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <select
            value={folderId}
            onChange={(e) => {
              setFolderId(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none max-w-[240px]"
          >
            <option value="all">全部目录 ({bookmarks.length})</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.path.join(' / ')} ({folder.bookmarkCount})
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="搜索标题、链接或目录..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
          >
            <option value="newest">按添加时间：最新优先</option>
            <option value="oldest">按添加时间：最早优先</option>
            <option value="title">按标题排序</option>
            <option value="folder">按目录路径排序</option>
          </select>
        </div>

        <button
          type="button"
          disabled={selectedIds.size === 0}
          onClick={handleDeleteSelected}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>删除选中 ({selectedIds.size})</span>
        </button>
      </div>

      {/* Bookmarks Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                <th className="w-12 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectPage}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    aria-label="全选当前页"
                  />
                </th>
                <th className="px-4 py-3 min-w-[240px]">书签标题与目录</th>
                <th className="px-4 py-3 min-w-[280px]">链接地址</th>
                <th className="px-4 py-3 w-32">最近检测</th>
                <th className="px-4 py-3 w-28">添加日期</th>
                <th className="px-4 py-3 text-right w-32">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {pagedBookmarks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                    <Bookmark className="mx-auto h-10 w-10 text-slate-300 mb-3" />
                    <p className="text-sm">没有找到匹配的书签。</p>
                  </td>
                </tr>
              ) : (
                pagedBookmarks.map((bookmark) => {
                  const isEditing = editingId === bookmark.id;
                  const lastResult = statusById.get(bookmark.id);
                  const badge = lastResult
                    ? STATUS_BADGE_MAP[lastResult.status]
                    : null;

                  return (
                    <tr
                      key={bookmark.id}
                      className="hover:bg-slate-50/70 transition-colors align-top"
                    >
                      <td className="px-4 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(bookmark.id)}
                          onChange={() => toggleSelect(bookmark.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(bookmark);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            placeholder="书签标题"
                            className="w-full rounded-md border border-blue-400 px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        ) : (
                          <>
                            <div
                              className="font-medium text-slate-900 line-clamp-1"
                              title={bookmark.title}
                            >
                              {bookmark.title}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-400 line-clamp-1">
                              {bookmark.folderPath.join(' / ') || '根目录'}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3.5 max-w-md">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="url"
                              value={editUrl}
                              onChange={(e) => setEditUrl(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit(bookmark);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              placeholder="https://..."
                              className="w-full rounded-md border border-blue-400 px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(bookmark)}
                              className="rounded-md bg-blue-600 p-1.5 text-white hover:bg-blue-700 cursor-pointer"
                              title="保存"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
                              title="取消"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={bookmark.url}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate text-xs text-blue-600 hover:underline max-w-[340px]"
                              title={bookmark.url}
                            >
                              {bookmark.url}
                            </a>
                            <a
                              href={bookmark.url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 text-slate-400 hover:text-blue-600"
                              title="在新标签页打开"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {badge ? (
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                            title={lastResult?.reason}
                          >
                            {badge.label}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">未检测</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500 tabular-nums">
                        {formatDate(bookmark.dateAdded)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(bookmark.id);
                              setEditTitle(bookmark.title);
                              setEditUrl(bookmark.url);
                            }}
                            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                            title="编辑标题和链接"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onAddWhitelist(bookmark.url, 'url')}
                            className="rounded-lg border border-emerald-200 p-1.5 text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                            title="加入白名单"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmState({
                                open: true,
                                title: '确定删除该书签？',
                                description: `${bookmark.title}\n${bookmark.url}\n\n删除后会存入本地回收站，可随时还原。`,
                                onConfirm: async () => {
                                  setConfirmState((s) => ({ ...s, open: false }));
                                  await onDeleteBookmarks([bookmark], '全部书签列表手动删除');
                                },
                              })
                            }
                            className="rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="删除到回收站"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredBookmarks.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>共 {filteredBookmarks.length} 条</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <option value={20}>20 条/页</option>
                <option value={50}>50 条/页</option>
                <option value={100}>100 条/页</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                上一页
              </button>
              <span className="tabular-nums">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmText="确认删除"
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}
