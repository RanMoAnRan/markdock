import type { EmptyFolderItem } from '../types/bookmark';

const PROTECTED_ROOT_IDS = new Set(['0', '1', '2', '3']);

const EDGE_WORKSPACE_ROOT_TITLES = new Set(['工作区', 'workspaces']);

function isIgnoredSystemSubtree(node: chrome.bookmarks.BookmarkTreeNode): boolean {
  if (node.unmodifiable) {
    return true;
  }
  if (
    node.parentId === '0' &&
    EDGE_WORKSPACE_ROOT_TITLES.has((node.title ?? '').trim().toLowerCase())
  ) {
    return true;
  }
  return false;
}

export function findEmptyFolders(
  roots: chrome.bookmarks.BookmarkTreeNode[],
): EmptyFolderItem[] {
  const emptyFolders: EmptyFolderItem[] = [];

  function walk(
    node: chrome.bookmarks.BookmarkTreeNode,
    path: string[],
    depth: number,
  ): boolean {
    if (typeof node.url === 'string') {
      return true; // contains a real bookmark
    }

    if (isIgnoredSystemSubtree(node)) {
      return true; // treat system/Edge Workspaces subtrees as non-deletable
    }

    const isRoot =
      !node.parentId ||
      node.parentId === '0' ||
      PROTECTED_ROOT_IDS.has(node.id);
    const nextPath = node.id !== '0' && node.title ? [...path, node.title] : path;

    let hasBookmark = false;
    if (node.children) {
      for (const child of node.children) {
        if (walk(child, nextPath, depth + 1)) {
          hasBookmark = true;
        }
      }
    }

    if (!hasBookmark && !isRoot) {
      emptyFolders.push({
        id: node.id,
        parentId: node.parentId!,
        title: node.title || '未命名文件夹',
        path: nextPath,
        depth,
      });
    }

    return hasBookmark;
  }

  for (const root of roots) {
    walk(root, [], 0);
  }

  // Deepest folders first for safe bottom-up deletion
  return emptyFolders.sort((a, b) => b.depth - a.depth);
}

export async function removeEmptyFolders(
  folders: EmptyFolderItem[],
): Promise<string[]> {
  const sorted = [...folders].sort((a, b) => b.depth - a.depth);
  const removed: string[] = [];

  for (const folder of sorted) {
    if (typeof chrome !== 'undefined' && chrome.bookmarks?.remove) {
      try {
        await chrome.bookmarks.remove(folder.id);
        removed.push(folder.id);
      } catch {
        // Folder may already have been removed or is no longer empty
      }
    }
  }

  return removed;
}
