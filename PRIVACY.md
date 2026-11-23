# Privacy Policy — MarkDock

*Last Updated: 2026-11-23*

## Overview

**MarkDock** is a local-first browser extension for organizing bookmarks in the browser side panel and cleaning up broken links, duplicates, and empty folders. We respect your privacy and do **not** collect, transmit, sell, or share any personal data.

## Data We Access (Locally Only)

To provide its core features, the extension accesses the following browser data strictly on your local device:

- **Bookmarks (`bookmarks`)**: Read, search, reorder, edit, delete, and restore your bookmarks and folders.
- **Local Storage (`storage`)**: Save your scan settings, whitelist rules, local recycle bin backups, pinned bookmarks, expanded folder states, and sidebar font size inside `chrome.storage.local` on your device.
- **Browser Tabs (`tabs`)**: Open bookmarks in the current/new/background/incognito tab or window, bookmark the active tab, and toggle the Cleaner Workbench tab.
- **Favicons (`favicon`)**: Display website icons next to bookmarks via the browser's built-in favicon service.
- **Direct Link Checks (`http://*/*`, `https://*/*`)**: Only when you explicitly start a dead-link scan, your browser sends direct `HEAD` / `GET` requests from your device to the bookmarked URLs to check whether they are reachable, redirected, or broken. No third-party proxy or backend server is used.

## Data Collection & Third-Party Sharing

- We do **not** operate any remote backend server.
- We do **not** collect analytics, telemetry, browsing history, or bookmark lists.
- We do **not** sell or transfer any data to third parties.

## Data Deletion

All locally saved preferences, whitelists, and recycle bin entries can be cleared directly inside the extension or removed permanently by uninstalling the extension.

## Contact

If you have any questions about this privacy policy, please open an issue in the extension's repository or contact the developer via the support email listed on the Microsoft Edge Add-ons store page.

---

# 隐私政策 — MarkDock

*最后更新日期：2026-11-23*

## 概述

**MarkDock** 是一款纯本地运行的浏览器扩展，提供原生侧边栏书签管理及失效书签检测、重复清理与本地回收站功能。我们尊重您的隐私，**不会收集、上传、出售或向任何第三方共享您的个人数据**。

## 本地访问的数据与用途

为实现核心功能，扩展仅在您的本地浏览器中访问以下数据：

- **书签数据（`bookmarks`）**：用于读取、搜索、拖拽排序、编辑、删除及从本地回收站还原您的书签和文件夹。
- **本地存储（`storage`）**：仅通过浏览器本地存储保存您的扫描设置、白名单规则、本地回收站备份、置顶书签、目录展开状态及侧边栏字号。
- **标签页信息（`tabs`）**：用于在当前/新标签页/后台/无痕窗口打开书签、一键收藏当前网页，以及打开或收起清理工作台标签页。
- **网站图标（`favicon`）**：通过浏览器内置图标服务在侧边栏展示书签图标。
- **失效链接检测（`http://*/*`、`https://*/*`）**：仅在您主动点击「开始检测」时，由您的浏览器本地直接向书签目标网页发送 `HEAD`/`GET` 请求以判断链接状态，不经过任何第三方中转或后端服务器。

## 数据收集与共享声明

- 本扩展**没有**任何远程后端服务器。
- 本扩展**不收集**任何埋点统计、浏览记录或书签内容。
- 本扩展**不向任何第三方**出售或传输数据。

## 数据清理

您可以随时在扩展内清空回收站或白名单，卸载扩展后所有本地存储数据将由浏览器自动清除。
