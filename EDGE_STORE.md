# Microsoft Edge Add-ons 上架资料包（直接复制粘贴）

> 后台地址：<https://partner.microsoft.com/dashboard/microsoftedge/>

---

## 1. 上传文件准备

- **扩展安装包（Packages）**：`release/markdock-v1.1.0.zip`（由 `npm run zip` 自动生成，根目录直接包含 `manifest.json`）
- **商店 Logo（必填，300×300 PNG）**：`store-assets/edge-logo-300x300.png`
- **功能截图（必填，至少 1 张，推荐 3~4 张，尺寸 `1280×800`）**：
  - 建议在 Edge 中打开扩展后截取以下 3 张图并裁切为 `1280×800`：
    1. 侧边栏：搜索高亮 + 置顶常用 + 拖拽排序指示线
    2. 清理工作台：失效链接检测结果（分类展示 404 / 重定向 / 人机验证受限）
    3. 清理工作台：重复书签清理 + 本地回收站一键还原 / 空文件夹一键定位

---

## 2. 基本信息（Properties）

- **类别（Category）**：`Productivity`（效率工具）
- **隐私政策 URL（Privacy policy URL）**：
  - 将根目录的 `PRIVACY.md` 上传到你的 GitHub / Gitee 仓库，粘贴该文件的公开链接（或 GitHub Pages / Notion 公开页链接）。
- **网站 URL（可选）**：你的 GitHub 仓库主页链接。

---

## 3. 商店详情文案（Store listings）

### 简体中文（zh-CN）

- **扩展名称**：`MarkDock`
- **简短说明（Short description，≤ 132 字符）**：
  > 原生书签侧边栏与失效书签清理二合一工具：支持快捷键秒搜、拖拽自由排序、精准死链检测、去重、空文件夹定位与本地回收站还原。
- **详细说明（Description）**：

```text
MarkDock 是一款专为浏览器重度用户打造的本地书签管理与清理工具，将「原生书签侧边栏」与「全屏清理工作台」合二为一。

【原生书签侧边栏】
• 快捷键秒开秒搜：支持 Alt+B 快速打开侧边栏、Alt+K 直接聚焦搜索框，多关键词空格分词实时匹配标题、链接与目录路径并高亮显示。
• 自由拖拽排序：像专业书签侧边栏一样，支持书签、文件夹及「置顶常用」区自由拖拽调整顺序与层级（悬停折叠文件夹自动展开），直接同步浏览器原生书签顺序。
• 快捷操作与右键菜单：支持鼠标中键后台打开、一键全部展开/收起目录、搜索结果在目录中定位；支持新标签页/无痕打开、编辑、复制链接、置顶与安全删除（删除提示条支持一键撤销）；再次右键即可快速收起菜单。
• 个性化外观：内置浅色 / 深色 / 跟随系统主题切换，以及 11px–20px 侧边栏字号调节。

【全屏书签清理工作台】
• 精准失效链接检测：智能区分 404/410 死链、DNS/网络失败、超时、服务器 5xx、HTTP→HTTPS/跨站重定向，以及 Cloudflare 人机验证或需登录页面，避免误删有效书签。
• 重复书签检测：支持精确匹配与 URL 智能归一化匹配（自动去除 utm_*、ref、spm 等追踪参数），一键去重。
• 空文件夹清理与定位：自动识别空目录及嵌套空目录（严格保护收藏夹栏、其他收藏夹及 Edge 工作区），点击空文件夹可一键在侧边栏展开并高亮定位。
• 本地回收站与 HTML 备份：所有删除操作均先备份至本地回收站，支持一键还原到原目录；同时支持导出标准 Netscape HTML 书签备份文件。

【隐私与安全】
纯本地运行，无任何后端服务器，不收集、不上传任何书签或个人数据。
```

- **搜索关键词（Search terms，最多 7 个）**：
  `书签管理`, `书签侧边栏`, `失效书签清理`, `重复书签`, `bookmark sidebar`, `bookmark cleaner`, `dead link checker`

---

### English（en-US，可选但推荐同时添加以获得更高审核通过率）

- **Extension Name**: `MarkDock`
- **Short Description**:
  > Native bookmark sidebar with instant search & drag-and-drop ordering, paired with an accurate dead-link cleaner, deduplicator, and local recycle bin.
- **Description**:

```text
MarkDock combines a fast native bookmark sidebar with a full-page bookmark maintenance workbench — 100% local and privacy-first.

NATIVE BOOKMARK SIDEBAR
• Instant keyboard-first search: Press Alt+B to toggle the sidebar or Alt+K to focus search immediately. Multi-keyword matching across titles, URLs, and folder paths with live highlighting.
• Custom drag-and-drop ordering: Freely reorder bookmarks, folders, and pinned favorites with visual insertion lines — synced directly with your native browser bookmarks.
• Rich context menu: Open in new/background/incognito tab, edit, copy URL, pin to top, expand/collapse subtrees, or safely delete to recycle bin. Right-click again anywhere to dismiss.
• Adjustable font size: Customize sidebar text size from 11px to 20px.

BOOKMARK CLEANER WORKBENCH
• Accurate dead-link scanner: Smartly distinguishes 404/410 dead links, DNS/network errors, timeouts, 5xx errors, meaningful redirects, and login/bot-challenge pages to prevent false positives.
• Duplicate finder: Detect exact duplicates or normalized URL duplicates (ignoring utm_*, ref, spm, fbclid tracking parameters).
• Empty folder manager: Safely detects empty and nested empty folders (protecting system roots and Edge Workspaces). Click any empty folder to locate and highlight it in the sidebar.
• Local Recycle Bin & HTML Backup: Every deletion is backed up locally before removal so you can restore bookmarks to their original folder anytime. Export standard HTML bookmark backups in one click.

PRIVACY
All processing happens locally in your browser. Zero tracking, zero telemetry, and no external servers.
```

---

## 4. 审核备注（Notes for certification — 强烈建议填写）

直接粘贴以下英文说明到 Partner Center 的 **Notes for certification**，可显著降低人工审核被打回的概率：

```text
Thank you for reviewing MarkDock.

1. Local-Only Privacy:
All bookmark data, settings, whitelists, and recycle bin backups are stored exclusively in chrome.storage.local. The extension does not communicate with any developer-owned backend server and collects zero user data.

2. Permission Justifications:
- bookmarks: Read, search, drag-and-drop reorder, edit, delete, and restore user bookmarks and folders.
- storage: Persist local scan settings, whitelist rules, recycle bin backups, pinned bookmarks, expanded folder state, and sidebar font size.
- sidePanel: Render the native bookmark sidebar UI and support locating empty folders from the workbench.
- tabs: Open bookmarks in current/new/background/incognito tabs, bookmark the active tab, and toggle the full-page Cleaner Workbench tab (index.html).
- favicon: Display website icons next to bookmarks using the browser's built-in /_favicon/ endpoint.
- http://*/* and https://*/* (host_permissions): Used ONLY when the user explicitly clicks "Start Scan" in the Cleaner Workbench to send direct HEAD/GET requests from the user's browser to their bookmarked URLs to detect 404s, redirects, timeouts, or bot-challenge pages. No background scraping occurs without user action.

3. How to Test:
- Click the extension toolbar icon (or press Alt+B) to open the Bookmark Sidebar.
- Use the search bar (Alt+K), drag bookmarks/folders to reorder, or right-click items for options (right-click again to close the menu).
- Click "清理" (Cleaner Workbench) in the sidebar header to open the full-page scanner/deduplicator/empty-folder/recycle-bin workbench. Click the button again ("收起") to close it.
```
