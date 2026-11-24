import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { getAncestorFolderIds } from '../core/bookmarks';

interface FolderTreePickerProps {
  roots: chrome.bookmarks.BookmarkTreeNode[];
  selectedFolderId: string;
  onSelect: (folderId: string) => void;
}

function getSubfolders(
  node: chrome.bookmarks.BookmarkTreeNode,
): chrome.bookmarks.BookmarkTreeNode[] {
  return (node.children ?? []).filter((child) => typeof child.url !== 'string');
}

export function FolderTreePicker({
  roots,
  selectedFolderId,
  onSelect,
}: FolderTreePickerProps) {
  const selectedRowRef = useRef<HTMLDivElement | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>(['1']);
    for (const id of getAncestorFolderIds(roots, selectedFolderId)) {
      initial.add(id);
    }
    return initial;
  });

  useEffect(() => {
    const ancestors = getAncestorFolderIds(roots, selectedFolderId);
    if (ancestors.length > 0) {
      setExpandedIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const id of ancestors) {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [roots, selectedFolderId]);

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedFolderId]);

  const selectedPathLabel = useMemo(() => {
    const walk = (
      nodes: chrome.bookmarks.BookmarkTreeNode[],
      path: string[],
    ): string | null => {
      for (const node of nodes) {
        if (typeof node.url === 'string') continue;
        if (node.id === '0' && node.children) {
          const found = walk(node.children, path);
          if (found) return found;
          continue;
        }
        const nextPath = [...path, node.title || '未命名文件夹'];
        if (node.id === selectedFolderId) {
          return nextPath.join(' / ');
        }
        if (node.children) {
          const found = walk(node.children, nextPath);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(roots, []) ?? '书签栏';
  }, [roots, selectedFolderId]);

  const toggleExpand = (folderId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const renderFolders = (
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    depth: number,
  ): React.ReactNode => {
    return nodes.map((node) => {
      if (typeof node.url === 'string') return null;
      if (node.id === '0' && node.children) {
        return renderFolders(node.children, depth);
      }

      const subfolders = getSubfolders(node);
      const hasChildren = subfolders.length > 0;
      const isExpanded = hasChildren && expandedIds.has(node.id);
      const isSelected = node.id === selectedFolderId;

      return (
        <div key={node.id}>
          <div
            ref={isSelected ? selectedRowRef : undefined}
            role="treeitem"
            aria-selected={isSelected}
            aria-expanded={hasChildren ? isExpanded : undefined}
            onClick={() => onSelect(node.id)}
            onDoubleClick={() => {
              if (hasChildren) toggleExpand(node.id);
            }}
            style={{ paddingLeft: `${depth * 14 + 6}px` }}
            className={`flex items-center gap-1.5 rounded-md pr-2 py-1 text-xs cursor-pointer transition-colors select-none ${
              isSelected
                ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-semibold ring-1 ring-blue-300/80 dark:ring-blue-700/80'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
            }`}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.id);
                }}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label={isExpanded ? '收起子目录' : '展开子目录'}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="h-4 w-4 shrink-0" />
            )}

            {isExpanded ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            )}

            <span className="min-w-0 flex-1 truncate">
              {node.title || '未命名文件夹'}
            </span>

            {isSelected && (
              <Check className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
            )}
          </div>

          {isExpanded && <div>{renderFolders(subfolders, depth + 1)}</div>}
        </div>
      );
    });
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 shrink-0">
          保存到目录
        </label>
        <span
          className="truncate text-[11px] text-slate-400 dark:text-slate-500"
          title={selectedPathLabel}
        >
          {selectedPathLabel}
        </span>
      </div>
      <div
        role="tree"
        aria-label="书签目录树"
        className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 p-1 space-y-0.5"
      >
        {renderFolders(roots, 0)}
      </div>
    </div>
  );
}
