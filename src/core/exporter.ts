function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderNodes(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  indent: string,
): string {
  const lines: string[] = [];

  for (const node of nodes) {
    if (typeof node.url === 'string') {
      const addDate = node.dateAdded
        ? ` ADD_DATE="${Math.floor(node.dateAdded / 1000)}"`
        : '';
      lines.push(
        `${indent}<DT><A HREF="${escapeHtml(node.url)}"${addDate}>${escapeHtml(node.title || node.url)}</A>`,
      );
      continue;
    }

    if (node.id === '0' && !node.title) {
      if (node.children) {
        lines.push(renderNodes(node.children, indent));
      }
      continue;
    }

    lines.push(`${indent}<DT><H3>${escapeHtml(node.title || '未命名文件夹')}</H3>`);
    lines.push(`${indent}<DL><p>`);
    if (node.children && node.children.length > 0) {
      lines.push(renderNodes(node.children, `${indent}    `));
    }
    lines.push(`${indent}</DL><p>`);
  }

  return lines.join('\n');
}

export function generateNetscapeBookmarkHtml(
  roots: chrome.bookmarks.BookmarkTreeNode[],
): string {
  const body = renderNodes(roots, '    ');
  return [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file by MarkDock. -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    body,
    '</DL><p>',
    '',
  ].join('\n');
}

export function triggerBookmarkHtmlDownload(
  roots: chrome.bookmarks.BookmarkTreeNode[],
): void {
  const html = generateNetscapeBookmarkHtml(roots);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookmarks-backup-${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
