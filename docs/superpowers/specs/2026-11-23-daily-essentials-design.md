# 侧边栏日常高频刚需三件套设计

## 1. 目标与范围
在 MarkDock 侧边栏与核心搜索/去重模块中新增 3 项日常高频能力：
1. **最近添加 / 常用视图**：侧边栏支持在 `目录 | 最近添加 | 常用` 之间快速切换，并在本地持久化记录书签访问频次与最近访问时间。
2. **拼音 & 拼音首字母搜索**：支持用全拼（如 `kaifa`）或拼音首字母（如 `kf`）免切输入法检索中文书签标题与目录路径，并在搜索结果中高亮对应的中文字符。
3. **重复收藏提醒**：点击「收藏当前网页」（或在收藏弹窗中输入/修改 URL）时，按规范化 URL 实时检测是否已收藏，提示已有书签所在目录并支持一键定位，同时不阻断用户继续保存。

**非目标**：不改动清理工作台（`App.tsx`）的扫描/去重逻辑，不将访问统计上传云端（纯本地 `chrome.storage.local`）。

## 2. 方案选择（Approaches）
- **拼音搜索选型**：
  - **已选定：`pinyin-match`** — 专为中文搜索与高亮设计，直接返回原文匹配下标区间 `[start, end]`，支持全拼、首字母与混合匹配，体积小且与 `highlightSegments` 天然契合。
  - **放弃：`pinyin-pro` / 自建字表** — `pinyin-pro` 默认包体积大且需自行维护拼音到原文下标的映射；自建字表覆盖率低且维护成本高。
- **访问频次统计**：
  - **已选定**：在 `src/core/storage.ts` 中通过 `bcp_visit_stats` 持久化 `Record<string, VisitStat>`（`{ count, lastVisitedAt }`），并在书签被打开时（左键、中键、回车、右键打开）统一记录。
- **重复收藏检测**：
  - **已选定**：直接复用 `src/core/duplicates.ts` 的 `normalizeUrl`，在收藏弹窗内实时匹配 `allBookmarks`，零重复逻辑。

## 3. 核心设计

### 3.1 最近添加 / 常用视图
- **数据层**：
  - `src/types/bookmark.ts` 新增 `VisitStat { count: number; lastVisitedAt: number }` 与 `VisitStatsMap = Record<string, VisitStat>`。
  - `src/core/storage.ts` 新增 `loadVisitStats` / `saveVisitStats`（键 `bcp_visit_stats`）。
  - 新增纯函数模块 `src/core/views.ts`：
    - `recordBookmarkVisit(stats, bookmarkId, now)`：返回更新后的 `VisitStatsMap`（次数 +1，更新时间戳），并支持按当前存活书签集合清理已删除条目的无效统计（`pruneVisitStats`）。
    - `getRecentBookmarks(bookmarks, limit = 50)`：按 `dateAdded` 降序返回最近添加的书签。
    - `getFrequentBookmarks(bookmarks, stats, limit = 50)`：过滤 `count > 0` 的书签，按 `count` 降序、同次数按 `lastVisitedAt` 降序返回。
- **UI 层（`src/sidepanel/SidePanelApp.tsx`）**：
  - 在搜索框下方增加三段式视图切换：`目录 | 最近添加 | 常用`（无搜索词时生效；输入搜索词时自动显示搜索结果；调用 `locateNode` 时自动切回 `目录`）。
  - `最近添加` 视图展示书签标题、目录路径与添加时间；`常用` 视图展示书签标题、目录路径与访问次数徽标（如 `5次`），均支持左键/中键打开、右键菜单、一键定位、置顶、编辑与删除。

### 3.2 拼音 & 拼音首字母搜索
- 在 `src/core/search.ts` 中集成 `pinyin-match`：
  - `searchBookmarks`：保留现有精确字面匹配权重（标题前缀 100 / 标题包含 60 / URL 30 / 目录路径 15）；当 token 未字面命中时，尝试用 `PinyinMatch.match` 匹配标题（前缀起始位置为 0 给 55，其他位置给 45）或目录路径（给 12）。
  - `highlightSegments`：优先合并所有 token 的字面匹配区间与 `PinyinMatch.match` 命中区间（合并重叠区间并按起止位置切片），实现输入 `kf` 或 `kaifa` 时直接高亮「开发」二字。

### 3.3 重复收藏提醒
- 在 `src/core/duplicates.ts` 中新增辅助函数 `findMatchingBookmarksByUrl(bookmarks, rawUrl)`：使用 `normalizeUrl` 规范化后查找所有已收藏的匹配书签。
- 在 `src/sidepanel/SidePanelApp.tsx` 的 `add_bookmark` 弹窗中：
  - 实时计算 `duplicateMatches = findMatchingBookmarksByUrl(allBookmarks, modal.url)`。
  - 若存在匹配项，在表单内展示醒目的琥珀色提醒卡片，列出已收藏的目录路径与标题，每条附带「定位」按钮（关闭弹窗并调用 `locateNode(item.id)` 切回目录树高亮定位）。
  - 底部确认按钮文案在重复时调整为「仍要保存」，不阻断用户显式重复收藏。

## 4. 测试与验证
- 为 `src/core/views.ts`、`src/core/search.ts`（全拼、首字母、混合、多关键词、高亮区间）、`src/core/duplicates.ts`（`findMatchingBookmarksByUrl`）编写完整单元测试。
- 运行 `npm test`、`npm run build` 与 `npm run zip` 验证全部测试通过、类型检查无误并产出最新扩展压缩包。
