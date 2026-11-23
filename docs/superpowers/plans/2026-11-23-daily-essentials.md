# 侧边栏日常高频刚需三件套 Implementation Plan

> **For agentic workers:** Execute task-by-task using TDD and verify with `npm test`, `npm run build`, and `npm run zip`.

**Goal:** 为 MarkDock 侧边栏交付「最近添加 / 常用视图」「拼音 & 首字母搜索与高亮」「重复收藏提醒与一键定位」三项日常高频功能。

**Architecture:** 核心逻辑以纯函数形式落在 `src/core/views.ts`、`src/core/search.ts`、`src/core/duplicates.ts`，本地访问频次通过 `src/core/storage.ts` 持久化在 `bcp_visit_stats`，侧边栏 UI 统一集成在 `src/sidepanel/SidePanelApp.tsx`。

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest, `pinyin-match`

**Spec:** `docs/superpowers/specs/2026-11-23-daily-essentials-design.md`

## Global Constraints
- 纯本地存储，不向任何外部服务上报访问统计。
- 不破坏现有目录树拖拽、置顶、右键菜单与字面搜索排序。
- 无 Git 仓库操作（不执行 commit/push）。

## Review Focus
- 删除书签后，常用视图中不能出现已删除的悬空 ID，且访问统计需能自动过滤/清理。
- 拼音搜索与字面搜索混用（如 `kf react`、`kaifa 工具`）以及特殊正则字符（如 `c++`、`[test]`）时，搜索与高亮均不能抛错或漏高亮。
- 收藏弹窗中 URL 带 `utm_*`、尾斜杠或 `#hash` 时仍能准确识别已收藏书签；非法/空 URL 不误报重复。
- 从「最近添加」「常用」或「重复收藏提醒」点击「在目录中定位」时，必须自动切回 `目录` 视图并清空搜索框、展开祖先文件夹并滚动高亮目标书签。
- 通过左键、Ctrl/Cmd+点击、中键、搜索回车、右键菜单打开书签时，均统一累计访问次数。

---

### Task 1: 安装 `pinyin-match` 并实现访问统计与视图纯函数（`views.ts` + `storage.ts`）

**Files:**
- Modify: `package.json`（安装 `pinyin-match`）
- Modify: `src/types/bookmark.ts`
- Modify: `src/core/storage.ts`
- Create: `src/core/views.ts`
- Create: `src/core/__tests__/views.test.ts`

**Interfaces:**
- Produces:
  - `VisitStat { count: number; lastVisitedAt: number }`、`VisitStatsMap = Record<string, VisitStat>`
  - `loadVisitStats(): Promise<VisitStatsMap>`、`saveVisitStats(stats: VisitStatsMap): Promise<void>`
  - `recordBookmarkVisit(stats: VisitStatsMap, bookmarkId: string, now?: number): VisitStatsMap`
  - `pruneVisitStats(stats: VisitStatsMap, liveIds: Set<string>): VisitStatsMap`
  - `getRecentBookmarks(bookmarks: BookmarkItem[], limit?: number): BookmarkItem[]`
  - `getFrequentBookmarks(bookmarks: BookmarkItem[], stats: VisitStatsMap, limit?: number): Array<{ bookmark: BookmarkItem; count: number; lastVisitedAt: number }>`

- [ ] **Step 1:** 安装 `pinyin-match`
- [ ] **Step 2:** 在 `src/core/__tests__/views.test.ts` 编写 `recordBookmarkVisit`、`pruneVisitStats`、`getRecentBookmarks`、`getFrequentBookmarks` 单元测试（含排序 tie-break 与已删除书签过滤）
- [ ] **Step 3:** 实现 `src/types/bookmark.ts`、`src/core/storage.ts`、`src/core/views.ts` 并运行单测通过

---

### Task 2: 拼音 & 拼音首字母搜索与高亮（`search.ts`）

**Files:**
- Modify: `src/core/search.ts`
- Modify: `src/core/__tests__/search.test.ts`

**Interfaces:**
- Consumes: `pinyin-match`
- Produces: 保持 `searchBookmarks(bookmarks, query, limit)` 与 `highlightSegments(text, query)` 签名兼容

- [ ] **Step 1:** 在 `src/core/__tests__/search.test.ts` 补充全拼（`kaifa`）、首字母（`kf`）、中英混合多关键词（`kf react`）、目录拼音搜索与高亮区间合并（含特殊字符）测试
- [ ] **Step 2:** 更新 `src/core/search.ts` 实现拼音匹配得分与区间合并高亮
- [ ] **Step 3:** 运行 `npx vitest run src/core/__tests__/search.test.ts` 验证通过

---

### Task 3: 重复收藏 URL 匹配辅助函数（`duplicates.ts`）

**Files:**
- Modify: `src/core/duplicates.ts`
- Modify: `src/core/__tests__/duplicates.test.ts`

**Interfaces:**
- Produces: `findMatchingBookmarksByUrl(bookmarks: BookmarkItem[], rawUrl: string, options?: NormalizeOptions): BookmarkItem[]`

- [ ] **Step 1:** 在 `src/core/__tests__/duplicates.test.ts` 补充 `findMatchingBookmarksByUrl` 测试（规范化去 utm/hash/尾斜杠、空字符串/非法 URL 不误匹配、返回多条匹配按 `dateAdded` 降序）
- [ ] **Step 2:** 在 `src/core/duplicates.ts` 实现 `findMatchingBookmarksByUrl`
- [ ] **Step 3:** 运行 `npx vitest run src/core/__tests__/duplicates.test.ts` 验证通过

---

### Task 4: 集成到侧边栏 UI（`SidePanelApp.tsx`）

**Files:**
- Modify: `src/sidepanel/SidePanelApp.tsx`

- [ ] **Step 1:** 接入 `visitStats` 状态加载与持久化；所有打开书签入口统一传 `bookmarkId` 以记录访问频次
- [ ] **Step 2:** 在搜索栏下方增加 `目录 | 最近添加 | 常用` 三段式视图切换；`locateNode` 时自动切回 `目录`；更新搜索 placeholder 提示支持拼音/首字母搜索
- [ ] **Step 3:** 实现「最近添加」与「常用」列表渲染（含目录路径、时间/访问次数徽标、悬浮定位/置顶/编辑/删除、右键菜单、空状态）
- [ ] **Step 4:** 在 `add_bookmark` 弹窗中接入 `findMatchingBookmarksByUrl`，展示重复收藏提醒卡片与一键「定位」按钮

---

### Task 5: 全面验证与打包

- [ ] **Step 1:** 运行 `npm test` 验证全部单元测试通过
- [ ] **Step 2:** 运行 `npm run build` 验证 TypeScript 编译与 Vite 构建通过
- [ ] **Step 3:** 运行 `npm run zip` 生成最新扩展发布包并检查产物
