# 侧边栏自定义拖拽排序与二次右键收起菜单设计

## 1. 目标与范围
在书签侧边栏（`src/sidepanel/SidePanelApp.tsx`）中实现两项体验升级：
1. **自定义排序（仿 Bookmark Sidebar）**：支持拖拽调整书签、文件夹的任意顺序与层级（直接同步 Chrome 原生书签顺序），并支持「置顶常用」区域内的拖拽排序。
2. **二次右键收起菜单**：当自定义右键菜单已打开时，在侧边栏任意位置再次点击右键，直接收起菜单并阻止弹出浏览器原生菜单。

**非目标**：不引入额外的视图排序模式（如按名称/时间切换），不改动清理工作台页面。

## 2. 方案选择（Approaches）
- **方案 A（已选定）**：纯拖拽自由排序，通过 `chrome.bookmarks.move(id, { parentId, index })` 直接写入浏览器原生书签顺序；置顶区通过 `pinnedIds` 数组持久化顺序。优点：与浏览器原生书签完全一致，无状态冲突、交互直观。
- **方案 B（放弃）**：在拖拽之外增加视图排序模式切换（名称/时间）。缺点：多一层排序状态，容易与原生书签顺序产生割裂。

## 3. 核心设计

### 3.1 目录树拖拽排序（书签 + 文件夹）
- **可拖拽对象**：所有书签节点 + 所有非受保护根目录的文件夹节点（`!isProtectedRoot`）。
- **放置区域判定（Drop Zone）**：
  - 书签行：上半部（< 50%）为 `before`（上方蓝色插入线），下半部（>= 50%）为 `after`（下方蓝色插入线）。
  - 非根文件夹行：顶部 25% 为 `before`，中间 50% 为 `inside`（高亮边框，移入文件夹末尾），底部 25% 为 `after`。
  - 受保护根文件夹（书签栏、其他书签等）：整行仅允许 `inside`。
- **防环与无效操作保护**：
  - 禁止拖放到自身。
  - 禁止将文件夹拖入自身或任意子孙目录（`isDescendantNode` 校验）。
  - 同目录内拖放到当前紧邻位置（无实际顺序变化）时直接跳过，不触发多余 API 调用。
- **索引计算纯函数**：
  - 在 `src/core/bookmarks.ts` 中新增 `computeBookmarkMoveTarget(roots, draggedId, targetId, position)`，计算传给 `chrome.bookmarks.move(id, { parentId, index })` 的目标参数，并扩展 `moveBookmarkItem(id, parentId, index?)`。
  - 遵循 Chromium `BookmarkModel::Move` 语义：传入移除前的插入槽位（`before` 取 `targetIndex`，`after` 取 `targetIndex + 1`，`inside` 不传 `index` 追加末尾）。

### 3.2 置顶常用区拖拽排序
- 置顶书签行支持独立拖拽（与目录树拖拽区分来源类型，互不干扰）。
- 在 `src/core/bookmarks.ts` 中新增纯函数 `reorderIdList(ids, draggedId, targetId, position)`，拖拽释放后更新 `pinnedIds` 并调用 `savePinnedIds` 持久化。

### 3.3 右键菜单二次右键收起
- `mousedown` 外部点击关闭监听忽略右键（`e.button === 2`），避免右键按下时先关闭、随后 `contextmenu` 事件立刻重新打开。
- 在 `window` 捕获阶段（`capture: true`）监听 `contextmenu`：若当前自定义菜单处于打开状态，则 `preventDefault()` + `stopPropagation()` 并关闭菜单；否则放行给各节点的 `onContextMenu` 正常打开菜单。

### 3.4 清理工作台按钮再次点击收起
- 将顶部「清理工作台」按钮改为切换（Toggle）行为：点击时查询当前窗口是否已打开扩展的 `index.html` 标签页。
  - 若已存在，则关闭这些标签页（收起工作台）；
  - 若不存在，则新建标签页打开 `index.html`。
- 同步监听 `chrome.tabs` 生命周期变化，按钮在工作台打开时可呈现明确状态提示（如悬停提示“点击收起清理工作台”）。

## 4. 测试与验证
- 为 `computeBookmarkMoveTarget`（同目录前移/后移/无变化、跨目录插入、移入文件夹、防循环嵌套、受保护根目录限制）和 `reorderIdList` 补充单元测试。
- 运行 `npm test` 和 `npm run build` 验证类型、单测与打包全部通过。
