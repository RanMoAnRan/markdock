import type { BookmarkItem, FolderNode } from '../types/bookmark';

export function flattenBookmarkTree(
  roots: chrome.bookmarks.BookmarkTreeNode[],
): BookmarkItem[] {
  const result: BookmarkItem[] = [];

  function walk(node: chrome.bookmarks.BookmarkTreeNode, path: string[]): void {
    const nextPath =
      node.id !== '0' && node.title ? [...path, node.title] : path;

    if (typeof node.url === 'string') {
      result.push({
        id: node.id,
        parentId: node.parentId ?? '1',
        title: node.title || node.url,
        url: node.url,
        dateAdded: node.dateAdded,
        folderPath: path,
      });
      return;
    }

    if (node.children) {
      for (const child of node.children) {
        walk(child, nextPath);
      }
    }
  }

  for (const root of roots) {
    walk(root, []);
  }
  return result;
}

export function extractFolders(
  roots: chrome.bookmarks.BookmarkTreeNode[],
): FolderNode[] {
  const folders: FolderNode[] = [];

  function walk(node: chrome.bookmarks.BookmarkTreeNode, path: string[]): number {
    if (typeof node.url === 'string') {
      return 1;
    }

    const isRootContainer = node.id === '0' || !node.parentId;
    const nextPath = !isRootContainer && node.title ? [...path, node.title] : path;
    const entryIndex = !isRootContainer ? folders.length : -1;

    if (!isRootContainer) {
      folders.push({
        id: node.id,
        parentId: node.parentId,
        title: node.title || '未命名文件夹',
        path: nextPath,
        bookmarkCount: 0,
      });
    }

    let count = 0;
    if (node.children) {
      for (const child of node.children) {
        count += walk(child, nextPath);
      }
    }

    if (entryIndex >= 0) {
      folders[entryIndex].bookmarkCount = count;
    }
    return count;
  }

  for (const root of roots) {
    walk(root, []);
  }
  return folders;
}

export function filterBookmarksByFolder(
  bookmarks: BookmarkItem[],
  roots: chrome.bookmarks.BookmarkTreeNode[],
  folderId: string,
): BookmarkItem[] {
  if (!folderId || folderId === 'all') {
    return bookmarks;
  }

  const allowedIds = new Set<string>();

  function collectIds(node: chrome.bookmarks.BookmarkTreeNode): void {
    if (typeof node.url === 'string') {
      allowedIds.add(node.id);
      return;
    }
    if (node.children) {
      for (const child of node.children) {
        collectIds(child);
      }
    }
  }

  function findFolder(node: chrome.bookmarks.BookmarkTreeNode): boolean {
    if (node.id === folderId) {
      collectIds(node);
      return true;
    }
    if (node.children) {
      for (const child of node.children) {
        if (findFolder(child)) return true;
      }
    }
    return false;
  }

  for (const root of roots) {
    if (findFolder(root)) break;
  }

  return bookmarks.filter((b) => allowedIds.has(b.id));
}

export async function loadBookmarkTree(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  if (typeof chrome !== 'undefined' && chrome.bookmarks?.getTree) {
    return await chrome.bookmarks.getTree();
  }
  return [];
}

export async function removeBookmarkById(id: string): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.bookmarks?.remove) {
    await chrome.bookmarks.remove(id);
  }
}

export async function updateBookmark(
  id: string,
  changes: { title?: string; url?: string },
): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.bookmarks?.update) {
    await chrome.bookmarks.update(id, changes);
  }
}

export async function updateBookmarkUrl(id: string, url: string): Promise<void> {
  await updateBookmark(id, { url });
}

export async function createBookmarkItem(details: {
  parentId?: string;
  title: string;
  url?: string;
}): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
  if (typeof chrome !== 'undefined' && chrome.bookmarks?.create) {
    return await chrome.bookmarks.create({
      parentId: details.parentId ?? '1',
      title: details.title,
      url: details.url,
    });
  }
  return null;
}

export type DropPosition = 'before' | 'after' | 'inside';

export interface BookmarkMoveTarget {
  parentId: string;
  index?: number;
}

interface LocatedNode {
  node: chrome.bookmarks.BookmarkTreeNode;
  parentId: string | undefined;
  index: number;
}

function locateNode(
  roots: chrome.bookmarks.BookmarkTreeNode[],
  id: string,
): LocatedNode | null {
  function walk(
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    parentId: string | undefined,
  ): LocatedNode | null {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === id) {
        return { node, parentId: node.parentId ?? parentId, index: i };
      }
      if (node.children) {
        const found = walk(node.children, node.id);
        if (found) return found;
      }
    }
    return null;
  }

  return walk(roots, undefined);
}

export function isDescendantNode(
  roots: chrome.bookmarks.BookmarkTreeNode[],
  ancestorId: string,
  targetId: string,
): boolean {
  const ancestor = locateNode(roots, ancestorId);
  if (!ancestor?.node.children) return false;

  function contains(nodes: chrome.bookmarks.BookmarkTreeNode[]): boolean {
    for (const node of nodes) {
      if (node.id === targetId) return true;
      if (node.children && contains(node.children)) return true;
    }
    return false;
  }

  return contains(ancestor.node.children);
}

export function computeBookmarkMoveTarget(
  roots: chrome.bookmarks.BookmarkTreeNode[],
  draggedId: string,
  targetId: string,
  position: DropPosition,
): BookmarkMoveTarget | null {
  if (!draggedId || !targetId || draggedId === targetId) return null;

  const dragged = locateNode(roots, draggedId);
  const target = locateNode(roots, targetId);
  if (!dragged || !target) return null;

  // Prevent moving protected root folders
  if (!dragged.parentId || dragged.parentId === '0' || dragged.node.unmodifiable) {
    return null;
  }

  // Prevent cyclic folder nesting
  if (isDescendantNode(roots, draggedId, targetId)) {
    return null;
  }

  if (position === 'inside') {
    if (typeof target.node.url === 'string') return null;
    if (dragged.parentId === target.node.id) {
      const siblingCount = target.node.children?.length ?? 0;
      if (dragged.index >= siblingCount - 1) return null;
      return { parentId: target.node.id, index: siblingCount };
    }
    return { parentId: target.node.id };
  }

  // before / after: cannot insert before/after root containers
  if (!target.parentId || target.parentId === '0') {
    return null;
  }

  const slot = position === 'before' ? target.index : target.index + 1;
  if (
    dragged.parentId === target.parentId &&
    (slot === dragged.index || slot === dragged.index + 1)
  ) {
    return null;
  }

  return {
    parentId: target.parentId,
    index: slot,
  };
}

export function reorderIdList(
  ids: string[],
  draggedId: string,
  targetId: string,
  position: 'before' | 'after',
): string[] | null {
  if (draggedId === targetId) return null;
  const fromIndex = ids.indexOf(draggedId);
  const targetIndex = ids.indexOf(targetId);
  if (fromIndex === -1 || targetIndex === -1) return null;

  const slot = position === 'before' ? targetIndex : targetIndex + 1;
  if (slot === fromIndex || slot === fromIndex + 1) return null;

  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  const insertAt = fromIndex < slot ? slot - 1 : slot;
  next.splice(insertAt, 0, moved);
  return next;
}

export function getAncestorFolderIds(
  roots: chrome.bookmarks.BookmarkTreeNode[],
  targetId: string,
): string[] {
  function walk(
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    ancestors: string[],
  ): string[] | null {
    for (const node of nodes) {
      if (node.id === targetId) {
        return ancestors;
      }
      if (node.children) {
        const nextAncestors = node.id === '0' ? ancestors : [...ancestors, node.id];
        const found = walk(node.children, nextAncestors);
        if (found) return found;
      }
    }
    return null;
  }

  return walk(roots, []) ?? [];
}

export async function moveBookmarkItem(
  id: string,
  parentId: string,
  index?: number,
): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.bookmarks?.move) {
    const destination: { parentId: string; index?: number } =
      index !== undefined ? { parentId, index } : { parentId };
    await chrome.bookmarks.move(id, destination);
  }
}

export function getFaviconUrl(pageUrl: string, size = 32): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', String(size));
    return url.toString();
  }
  return '';
}
