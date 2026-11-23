import { describe, expect, it } from 'vitest';
import { generateNetscapeBookmarkHtml } from '../exporter';

describe('Netscape HTML bookmark exporter', () => {
  it('generates valid Netscape Bookmark HTML and escapes special characters', () => {
    const tree = [
      {
        id: '0',
        title: '',
        syncing: false,
        children: [
          {
            id: '1',
            parentId: '0',
            title: '书签栏 & <测试>',
            syncing: false,
            children: [
              {
                id: '10',
                parentId: '1',
                title: 'A & B "Quoted" <Tag>',
                url: 'https://example.com/search?a=1&b="2"',
                dateAdded: 1700000000000,
                syncing: false,
              },
            ],
          },
        ],
      },
    ] as chrome.bookmarks.BookmarkTreeNode[];

    const html = generateNetscapeBookmarkHtml(tree);
    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(html).toContain('<H3>书签栏 &amp; &lt;测试&gt;</H3>');
    expect(html).toContain(
      '<A HREF="https://example.com/search?a=1&amp;b=&quot;2&quot;" ADD_DATE="1700000000">A &amp; B &quot;Quoted&quot; &lt;Tag&gt;</A>',
    );
  });
});
