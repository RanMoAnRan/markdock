# 侧边栏自定义拖拽排序与二次右键收起菜单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在书签侧边栏实现书签、文件夹与置顶区的自由拖拽排序（直接同步 Chrome 原生书签顺序），并支持右键菜单展开时再次右键直接收起。

**Architecture:** 将目录树防环检测、Chrome `bookmarks.move` 槽位索引计算和置顶列表重排抽离为 `src/core/bookmarks.ts` 中的纯函数并做完备单元测试；在 `src/sidepanel/SidePanelApp.tsx` 中统一管理树节点/置顶区的拖拽指示线与投放逻辑，并通过捕获阶段 `contextmenu` 监听实现二次右键收起。

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS v4, Chrome Extension MV3 Bookmarks API, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-11-23-sidebar-drag-order-and-context-menu-design.md`

## Global Constraints
- 不引入额外排序模式（仅纯拖拽自定义顺序，直接写入 Chrome 原生书签）。
- 不改动清理工作台页面（`src/App.tsx` 及 `src/components/`）。
- 遵循用户全局规则：除非用户明确要求，不自动执行 `git commit` / `git push`。

## Review Focus
- 同目录向下拖拽时 Chromium `BookmarkModel::Move` 需传入移除前槽位索引（否则会少移一位导致原地不动或错位）。
- 拖拽文件夹放入自身或任意多层子文件夹时必须阻断，防止 Chrome API 抛错或死循环。
- 拖到受保护根目录（`id === '0'` 或 `parentId === '0'`）的 `before`/`after` 必须拒绝，仅允许 `inside`。
- 置顶区拖拽与目录树拖拽混用（例如把置顶项拖到目录树或反之）时必须互相隔离、不产生异常移动。
- 右键菜单打开时，右键点击其他书签/文件夹/菜单自身/空白处时，`mousedown`（button 2）不得提前清空状态导致 `contextmenu` 误判重开。

---

### Task 1: 目录树与置顶区排序纯函数及单元测试

**Files:**
- Modify: `src/core/bookmarks.ts:164-171`
- Test: `src/core/__tests__/bookmarks.test.ts`

**Interfaces:**
- Produces:
  - `export type DropPosition = 'before' | 'after' | 'inside';`
  - `export interface BookmarkMoveTarget { parentId: string; index?: number; }`
  - `export function isDescendantNode(roots: chrome.bookmarks.BookmarkTreeNode[], ancestorId: string, targetId: string): boolean`
  - `export function computeBookmarkMoveTarget(roots: chrome.bookmarks.BookmarkTreeNode[], draggedId: string, targetId: string, position: DropPosition): BookmarkMoveTarget | null`
  - `export function reorderIdList(ids: string[], draggedId: string, targetId: string, position: 'before' | 'after'): string[] | null`
  - `export async function moveBookmarkItem(id: string, parentId: string, index?: number): Promise<void>`

- [x] **Step 1: Write failing unit tests in `src/core/__tests__/bookmarks.test.ts`**

添加以下测试用例覆盖 `computeBookmarkMoveTarget`、`isDescendantNode` 与 `reorderIdList`：
```ts
describe('drag-and-drop reorder utilities', () => {
  it('computes same-parent move upward and downward using pre-removal slot indices', () => {
    // 书签栏 children: [10(0), 11(1), 12(2)]
    expect(computeBookmarkMoveTarget(reorderTree, '12', '10', 'before')).toEqual({ parentId: '1', index: 0 });
    expect(computeBookmarkMoveTarget(reorderTree, '12', '10', 'after')).toEqual({ parentId: '1', index: 1 });
    expect(computeBookmarkMoveTarget(reorderTree, '10', '11', 'after')).toEqual({ parentId: '1', index: 2 });
    expect(computeBookmarkMoveTarget(reorderTree, '10', '12', 'after')).toEqual({ parentId: '1', index: 3 });
  });

  it('returns null for same-parent no-op drops and self drops', () => {
    expect(computeBookmarkMoveTarget(reorderTree, '10', '10', 'before')).toBeNull();
    expect(computeBookmarkMoveTarget(reorderTree, '10', '11', 'before')).toBeNull();
    expect(computeBookmarkMoveTarget(reorderTree, '11', '10', 'after')).toBeNull();
  });

  it('computes cross-parent before, after, and inside targets', () => {
    expect(computeBookmarkMoveTarget(reorderTree, '20', '10', 'before')).toEqual({ parentId: '1', index: 0 });
    expect(computeBookmarkMoveTarget(reorderTree, '20', '11', 'after')).toEqual({ parentId: '1', index: 2 });
    expect(computeBookmarkMoveTarget(reorderTree, '20', '11', 'inside')).toEqual({ parentId: '11' });
  });

  it('prevents dropping a folder into itself or its descendants, and blocks before/after on root containers', () => {
    expect(isDescendantNode(reorderTree, '11', '111')).toBe(true);
    expect(computeBookmarkMoveTarget(reorderTree, '11', '11', 'inside')).toBeNull();
    expect(computeBookmarkMoveTarget(reorderTree, '11', '111', 'before')).toBeNull();
    expect(computeBookmarkMoveTarget(reorderTree, '11', '112', 'inside')).toBeNull();
    expect(computeBookmarkMoveTarget(reorderTree, '10', '1', 'before')).toBeNull();
    expect(computeBookmarkMoveTarget(reorderTree, '10', '2', 'after')).toBeNull();
    expect(computeBookmarkMoveTarget(reorderTree, '10', '2', 'inside')).toEqual({ parentId: '2' });
  });

  it('reorders pinned id lists cleanly and returns null on no-op', () => {
    expect(reorderIdList(['a', 'b', 'c'], 'c', 'a', 'before')).toEqual(['c', 'a', 'b']);
    expect(reorderIdList(['a', 'b', 'c'], 'a', 'b', 'after')).toEqual(['b', 'a', 'c']);
    expect(reorderIdList(['a', 'b', 'c'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a']);
    expect(reorderIdList(['a', 'b', 'c'], 'a', 'b', 'before')).toBeNull();
    expect(reorderIdList(['a', 'b', 'c'], 'a', 'a', 'after')).toBeNull();
  });
});
```

- [x] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/core/__tests__/bookmarks.test.ts`
Expected: FAIL（`computeBookmarkMoveTarget` / `isDescendantNode` / `reorderIdList` 尚未导出）。

- [x] **Step 3: Implement reorder helpers and update `moveBookmarkItem` in `src/core/bookmarks.ts`**

在 `src/core/bookmarks.ts` 中实现：
- `isDescendantNode(roots, ancestorId, targetId)`：定位 `ancestorId` 节点后深度优先检查其子树是否包含 `targetId`。
- `computeBookmarkMoveTarget(roots, draggedId, targetId, position)`：
  - 查找 `dragged` 与 `target` 及其 `parentId` 与兄弟数组中的索引 `index`。
  - 若 `draggedId === targetId` 或 `isDescendantNode(roots, draggedId, targetId)` 返回 `null`。
  - 若 `position === 'inside'`：要求 `target` 为文件夹（`typeof target.url !== 'string'`）且 `dragged.parentId !== target.id`，返回 `{ parentId: target.id }`（若已在同父目录末尾则无变化返回 `null`；若在同父目录非末尾可返回 `{ parentId: target.id, index: target.children.length }` 移至末尾）。
  - 若 `position === 'before' | 'after'`：要求 `target.parentId` 存在且 `target.parentId !== '0'`（禁止插在根目录前后）；计算 `slot = position === 'before' ? targetIndex : targetIndex + 1`；同父目录且 `slot === draggedIndex || slot === draggedIndex + 1` 返回 `null`；否则返回 `{ parentId: target.parentId, index: slot }`。
- `reorderIdList(ids, draggedId, targetId, position)`：在数组中移除 `draggedId` 并插入到目标位置，若结果顺序未变化返回 `null`。
- `moveBookmarkItem(id, parentId, index?)`：调用 `chrome.bookmarks.move(id, index !== undefined ? { parentId, index } : { parentId })`。

- [x] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/core/__tests__/bookmarks.test.ts`
Expected: PASS（全部测试用例通过）。

---

### Task 2: 侧边栏拖拽交互与二次右键收起菜单

**Files:**
- Modify: `src/sidepanel/SidePanelApp.tsx`

**Interfaces:**
- Consumes: `computeBookmarkMoveTarget`, `moveBookmarkItem`, `reorderIdList`, `DropPosition` from `../core/bookmarks`

- [ ] **Step 1: 实现二次右键收起菜单**

在 `src/sidepanel/SidePanelApp.tsx` 中：
- 增加 `contextMenuOpenRef = useRef(false)` 与 `contextMenu` 同步。
- 修改 `onPointerDown`：当 `e.button === 2` 时直接 `return`，仅左/中键外部点击关闭菜单。
- 注册 `window.addEventListener('contextmenu', onWindowContextMenu, true)`（捕获阶段）：当 `contextMenuOpenRef.current` 为 `true` 时，调用 `e.preventDefault()`、`e.stopPropagation()` 并 `setContextMenu(null)`，阻止原生菜单及子节点 `onContextMenu` 重新打开。

- [ ] **Step 2: 实现目录树（书签 + 非根文件夹）拖拽排序与插入线提示**

在 `src/sidepanel/SidePanelApp.tsx` 中：
- 将 `draggingBookmarkId` / `dragOverFolderId` 替换为：
  - `dragItem: { source: 'tree' | 'pinned'; id: string } | null`
  - `dropTarget: { source: 'tree' | 'pinned'; id: string; position: DropPosition } | null`
- 封装 `getDropPosition(e, allowInside)`：
  - `allowInside === false`（书签行或置顶行）：上半 50% 返回 `'before'`，下半 50% 返回 `'after'`。
  - `allowInside === true` 且为受保护根目录：始终返回 `'inside'`。
  - `allowInside === true` 且为普通文件夹：顶部 25% 返回 `'before'`，中间 50% 返回 `'inside'`，底部 25% 返回 `'after'`。
- 为目录树中的书签行与非根文件夹行（`!isProtectedRoot`）启用 `draggable`，在 `onDragOver` 时仅接受 `dragItem?.source === 'tree'` 并更新 `dropTarget`（同时用 `computeBookmarkMoveTarget` 预检合法性，不合法时不显示指示线）。
- 在节点容器上用绝对定位细蓝条渲染 `before`（顶部 2px 蓝线 + 左侧小圆点）和 `after`（底部 2px 蓝线 + 左侧小圆点），`inside` 保留蓝底高亮框。
- `onDrop` 调用 `computeBookmarkMoveTarget` → `moveBookmarkItem(dragItem.id, target.parentId, target.index)` → `refreshTree()` 并提示 `已调整顺序` / `已移动`。

- [ ] **Step 3: 实现「置顶常用」区拖拽排序**

在 `src/sidepanel/SidePanelApp.tsx` 中：
- 为置顶区书签行启用 `draggable`，`onDragStart` 设置 `dragItem = { source: 'pinned', id: item.id }`。
- `onDragOver` 仅接受 `dragItem?.source === 'pinned'` 且 `dragItem.id !== item.id`，显示 `before` / `after` 蓝色插入线。
- `onDrop` 调用 `reorderIdList(pinnedIds, dragItem.id, item.id, position)`，若有变更则 `setPinnedIds(next)` 并 `await savePinnedIds(next)`，提示 `已调整置顶顺序`。

- [ ] **Step 4: 实现「清理工作台」按钮再次点击收起**

在 `src/sidepanel/SidePanelApp.tsx` 中：
- 维护 `workbenchOpen` 状态（挂载时查询当前窗口是否存在 `index.html` 标签页，并监听 `chrome.tabs.onCreated` / `onRemoved` / `onUpdated` 保持同步）。
- 将 `handleOpenCleanerWorkbench` 改为 `handleToggleCleanerWorkbench`：查询当前窗口的 `chrome.runtime.getURL('index.html')` 标签页，若已存在则 `chrome.tabs.remove` 关闭收起；否则 `chrome.tabs.create` 打开。

- [ ] **Step 5: 全量测试与构建验证**

Run: `npm test && npm run build`
Expected: 所有单元测试通过，`tsc --noEmit && vite build` 无报错退出码 0。
