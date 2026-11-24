# DockRail Position Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to customize MarkDock's internal AI DockRail position (`auto` / `left` / `right`) with mirrored UI controls and a Chrome appearance settings shortcut (plus Edge note).

**Architecture:** Persist `DockPosition` (`'auto' | 'left' | 'right'`) in `chrome.storage.local` via `src/core/storage.ts`, resolve the effective side (`'left' | 'right'`) via a pure helper using `chrome.sidePanel?.getLayout?.()` when available (falling back to `'right'`), and mirror `DockRail`, `AiWorkspace`, and `SidePanelApp` layout/icons accordingly.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide icons, Vitest, Chrome Extensions MV3.

**Spec:** `docs/superpowers/specs/2026-11-24-dock-position-design.md`

## Global Constraints
- Keep native `chrome.sidePanel` only; no content scripts, no popup windows, no manifest permission changes, no `aiFrameRules.ts` changes.
- Default `DockPosition` is `'auto'`, resolving to browser side panel outer edge (`getLayout().side`) when supported and falling back to `'right'`.
- Do not commit or push unless explicitly requested by the user.

## Review Focus
- Corrupted/unknown stored value in `bcp_dock_position` must safely fall back to `'auto'`.
- `chrome.sidePanel?.getLayout` missing or throwing (Edge / older Chrome / non-extension preview) must never crash and must fall back cleanly to `'right'`.
- Switching between `left` and `right` while `dockCollapsed` is true must keep the expand button visible and positioned on the matching edge in both bookmarks header and `AiWorkspace` header.

---

### Task 1: Storage & Position Resolution Helper

**Files:**
- Modify: `src/core/storage.ts`
- Test: `src/core/__tests__/aiStorage.test.ts`

**Interfaces:**
- Produces in `src/core/storage.ts`:
  - `export type DockPosition = 'auto' | 'left' | 'right';`
  - `export type EffectiveDockPosition = 'left' | 'right';`
  - `export function resolveEffectiveDockPosition(pref: DockPosition, browserSide?: 'left' | 'right' | null): EffectiveDockPosition;`
  - `export async function loadDockPosition(): Promise<DockPosition>;`
  - `export async function saveDockPosition(position: DockPosition): Promise<void>;`

- [ ] **Step 1: Write failing tests in `src/core/__tests__/aiStorage.test.ts`**
  - Test `loadDockPosition()` defaults to `'auto'`, persists `'left'` / `'right'` / `'auto'`, and falls back to `'auto'` on invalid stored values.
  - Test `resolveEffectiveDockPosition`:
    - `'left'` -> `'left'` regardless of `browserSide`
    - `'right'` -> `'right'` regardless of `browserSide`
    - `'auto'` with `'left'` -> `'left'`
    - `'auto'` with `'right'` -> `'right'`
    - `'auto'` with `undefined` or `null` -> `'right'`
- [ ] **Step 2: Run `npx vitest run src/core/__tests__/aiStorage.test.ts` and verify failure**
- [ ] **Step 3: Implement `DockPosition`, `EffectiveDockPosition`, `resolveEffectiveDockPosition`, `loadDockPosition`, `saveDockPosition` in `src/core/storage.ts`**
- [ ] **Step 4: Run `npx vitest run src/core/__tests__/aiStorage.test.ts` and verify PASS**

---

### Task 2: Mirror `DockRail` and `AiWorkspace` Controls

**Files:**
- Modify: `src/components/DockRail.tsx`
- Modify: `src/components/AiWorkspace.tsx`

**Interfaces:**
- Consumes: `EffectiveDockPosition` from `src/core/storage.ts`
- Produces:
  - `DockRailProps.position?: EffectiveDockPosition` (default `'left'`)
  - `AiWorkspaceProps.dockPosition?: EffectiveDockPosition` (default `'left'`)

- [ ] **Step 1: Update `DockRail.tsx`**
  - Add `position?: EffectiveDockPosition` prop (default `'left'`).
  - Border: `border-r` when `'left'`, `border-l` when `'right'`.
  - Active indicator pills (Bookmarks + AI sites): `-left-1.5 rounded-r-full` / `-left-1 rounded-r-full` when `'left'`, `-right-1.5 rounded-l-full` / `-right-1 rounded-l-full` when `'right'`.
  - Collapse button: `PanelLeftClose` + `title="收起左侧栏"` when `'left'`, `PanelRightClose` + `title="收起右侧栏"` when `'right'`.
- [ ] **Step 2: Update `AiWorkspace.tsx`**
  - Add `dockPosition?: EffectiveDockPosition` prop (default `'left'`).
  - When `dockCollapsed && dockPosition === 'left'`, keep `PanelLeftOpen` button (`title="展开左侧栏"`) on the left of the AI toolbar.
  - When `dockCollapsed && dockPosition === 'right'`, render `PanelRightOpen` button (`title="展开右侧栏"`) on the right end of the AI toolbar.

---

### Task 3: Settings Modal & `SidePanelApp` Wiring

**Files:**
- Modify: `src/components/SidebarSettingsModal.tsx`
- Modify: `src/sidepanel/SidePanelApp.tsx`

**Interfaces:**
- Consumes: `DockPosition`, `EffectiveDockPosition`, `loadDockPosition`, `saveDockPosition`, `resolveEffectiveDockPosition` from `src/core/storage.ts`
- Produces:
  - `SidebarSettingsModalProps` additions:
    - `dockPosition: DockPosition`
    - `onSelectDockPosition: (pos: DockPosition) => void`
    - `isEdge: boolean`
    - `onOpenAppearanceSettings: () => void`

- [ ] **Step 1: Update `SidebarSettingsModal.tsx`**
  - Add「AI 切换栏位置」3-option segmented control (`自动` / `左侧` / `右侧`), matching existing「外观主题」style.
  - Below it, render browser side panel guidance:
    - When `!isEdge`: button「调整浏览器侧边栏左右位置」calling `onOpenAppearanceSettings` (closes modal).
    - When `isEdge`: subtle helper text「Edge 原生侧边栏固定在右侧，可在此调整面板内切换栏位置。」
- [ ] **Step 2: Update `SidePanelApp.tsx`**
  - Load `dockPosition` via `loadDockPosition()` in initial `Promise.all`.
  - Query `(chrome.sidePanel as ... )?.getLayout?.()` safely (wrapped in try/catch) to set `browserSidePanelSide: 'left' | 'right' | null`.
  - Compute `effectiveDockPosition = resolveEffectiveDockPosition(dockPosition, browserSidePanelSide)`.
  - Toggle root container `flex-row` vs `flex-row-reverse`.
  - Pass `position={effectiveDockPosition}` to `DockRail`, `dockPosition={effectiveDockPosition}` to `AiWorkspace`.
  - Mirror collapsed-dock expand button in bookmarks header (`PanelLeftOpen` on left vs `PanelRightOpen` on right).
  - Add `handleSelectDockPosition` (saves + toast) and `handleOpenAppearanceSettings` (`chrome.tabs.create({ url: 'chrome://settings/appearance' })`).
  - Pass new props to `SidebarSettingsModal`.

---

### Task 4: Full Verification

- [ ] **Step 1: Run full unit test suite (`npm test`)**
- [ ] **Step 2: Run TypeScript typecheck & production build (`npm run build`)**
- [ ] **Step 3: Inspect `git diff --stat` to confirm scope matches the spec**
