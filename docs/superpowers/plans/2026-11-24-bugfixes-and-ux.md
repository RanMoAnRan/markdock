# MarkDock Bug Fixes & UX Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 bugs (confirmed-dead copy mismatch, missing `client_4xx` bucket, orphaned `pinnedIds`, domain whitelist port/empty edge cases, service-worker action click fallback) and implement 5 UX improvements (workbench dark mode, locate-in-sidebar across tabs, duplicates keep-strategy & keep-only-this action, recycle bin search/pagination/select-all, and active scan unload/auto-snapshot protection).

**Architecture:** Pure domain logic changes are placed in `src/core/` (`whitelist.ts`, `views.ts`, `duplicates.ts`, `recycleBin.ts`, `locate.ts`) and backed by Vitest unit tests in `src/core/__tests__/`. UI and extension lifecycle updates are applied to `src/background/service-worker.ts`, `src/App.tsx`, `src/sidepanel/SidePanelApp.tsx`, and `src/components/*.tsx`.

**Tech Stack:** TypeScript, React 19, Tailwind CSS v4 (`@custom-variant dark`), Chrome Extension Manifest V3 APIs, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-bugfixes-and-ux-design.md`

## Global Constraints
- Keep TypeScript strict check (`tsc --noEmit`) and `vitest run` passing with zero errors.
- Do not commit or push unless explicitly requested by the user.
- Preserve existing storage keys and data backward-compatibility.

## Review Focus
1. Domain whitelist input with port/path/protocol (`https://Example.com:8443/login?x=1`) must normalize to `example.com` and match `https://example.com/app`.
2. Empty or scheme-only whitelist input (`https://` or whitespace) must normalize to `""` and never match arbitrary URLs in `isWhitelisted`.
3. `prunePinnedIds` must preserve the user's custom pinned ordering while filtering out IDs not in `liveBookmarkIds`.
4. `findDuplicateGroups` and `computeSafeRemovableDuplicates` with `keepStrategy: 'oldest'` must sort items oldest-first (missing `dateAdded` treated as `Number.MAX_SAFE_INTEGER` so items with known older timestamps win, or deterministic fallback) and preserve index 0.
5. `removeRecycleBinEntries` must serialize through the recycle bin write queue and remove only the specified entry IDs.

---

### Task 1: Core Domain Enhancements (Whitelist, Pinned IDs Pruning, Duplicate Keep Strategy, Partial Recycle Bin Delete)

**Files:**
- Modify: `src/core/whitelist.ts`
- Modify: `src/core/views.ts`
- Modify: `src/core/duplicates.ts`
- Modify: `src/core/recycleBin.ts`
- Modify: `src/background/recycleBinHandler.ts`
- Test: `src/core/__tests__/whitelist.test.ts`
- Test: `src/core/__tests__/views.test.ts`
- Test: `src/core/__tests__/duplicates.test.ts`
- Test: `src/core/__tests__/recycleBin.test.ts`

**Interfaces:**
- Produces in `src/core/whitelist.ts`:
  - `normalizeWhitelistPattern(pattern: string, matchType: 'url' | 'domain'): string`
  - `createWhitelistEntry(pattern: string, matchType: 'url' | 'domain'): WhitelistEntry`
- Produces in `src/core/views.ts`:
  - `prunePinnedIds(pinnedIds: string[], liveBookmarkIds: Set<string>): string[]`
- Produces in `src/core/duplicates.ts`:
  - `export type DuplicateKeepStrategy = 'newest' | 'oldest'`
  - `findDuplicateGroups(bookmarks: BookmarkItem[], mode: 'exact' | 'normalized', options?: NormalizeOptions, keepStrategy?: DuplicateKeepStrategy): DuplicateGroup[]`
  - `computeSafeRemovableDuplicates(liveBookmarks: BookmarkItem[], mode: 'exact' | 'normalized', targetKeys?: Set<string>, options?: NormalizeOptions, keepStrategy?: DuplicateKeepStrategy): BookmarkItem[]`
- Produces in `src/core/recycleBin.ts`:
  - `removeRecycleBinEntriesLocal(entryIds: string[]): Promise<RecycleBinEntry[]>`
  - `removeRecycleBinEntries(entryIds: string[]): Promise<RecycleBinEntry[]>`

- [ ] **Step 1: Write failing unit tests in `whitelist.test.ts`, `views.test.ts`, `duplicates.test.ts`, and `recycleBin.test.ts`**
- [ ] **Step 2: Run `npm test` to verify the new tests fail**
- [ ] **Step 3: Implement the core logic updates in `whitelist.ts`, `views.ts`, `duplicates.ts`, `recycleBin.ts`, and `recycleBinHandler.ts`**
- [ ] **Step 4: Run `npm test` to verify all unit tests pass**

---

### Task 2: Service Worker Action Click Fallback & Locate-in-Sidebar Helper + Pinned Pruning in SidePanel

**Files:**
- Modify: `src/background/service-worker.ts`
- Create: `src/core/locate.ts`
- Modify: `src/sidepanel/SidePanelApp.tsx`
- Modify: `src/components/EmptyFoldersTab.tsx`

**Interfaces:**
- Produces in `src/core/locate.ts`:
  - `locateNodeInSidebar(nodeId: string, windowId?: number): Promise<void>`

- [ ] **Step 1: Update `src/background/service-worker.ts` to register `chrome.action.onClicked` fallback when `setPanelBehavior` fails**
- [ ] **Step 2: Create `src/core/locate.ts` with `locateNodeInSidebar` and refactor `EmptyFoldersTab.tsx` to use it**
- [ ] **Step 3: Update `src/sidepanel/SidePanelApp.tsx` to prune orphaned `pinnedIds` on initial load and bookmark tree refresh**
- [ ] **Step 4: Run `npm test` and `npx tsc --noEmit` to verify types and tests**

---

### Task 3: ScannerTab, AllBookmarksTab, DuplicatesTab, WhitelistTab & RecycleBinTab Bug Fixes and UX Upgrades

**Files:**
- Modify: `src/components/ScannerTab.tsx`
- Modify: `src/components/AllBookmarksTab.tsx`
- Modify: `src/components/DuplicatesTab.tsx`
- Modify: `src/components/WhitelistTab.tsx`
- Modify: `src/components/RecycleBinTab.tsx`

- [ ] **Step 1: Update `ScannerTab.tsx`**:
  - Add `client_4xx` to `BUCKET_META`.
  - Fix `confirmedDeadItems` tooltip and confirmation dialog description so they accurately describe cleaning 404/410 dead links.
  - Add "在侧边栏定位" button on each row using `locateNodeInSidebar`.
- [ ] **Step 2: Update `AllBookmarksTab.tsx` & `WhitelistTab.tsx`**:
  - Validate non-empty normalized pattern in `WhitelistTab.tsx`.
  - Pass `whitelist` into `AllBookmarksTab.tsx`, show whitelisted badge/state on matching bookmarks, and add "在侧边栏定位" button on each row.
- [ ] **Step 3: Update `DuplicatesTab.tsx`**:
  - Add retention strategy selector (`保留最新添加` / `保留最早添加`).
  - Enable batch deduplication in both `exact` and `normalized` modes (with warning prompt for `normalized`).
  - Add per-item "仅保留此条" button and "在侧边栏定位" button.
- [ ] **Step 4: Update `RecycleBinTab.tsx`**:
  - Add search input, select-all checkbox, batch permanent delete button (`onRemoveEntries`), and pagination controls.

---

### Task 4: Workbench Dark Mode Sync & Active Scan Protection (`App.tsx`, `Header.tsx`, `SettingsModal.tsx`, and Tab dark styles)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/ScannerTab.tsx`
- Modify: `src/components/AllBookmarksTab.tsx`
- Modify: `src/components/DuplicatesTab.tsx`
- Modify: `src/components/EmptyFoldersTab.tsx`
- Modify: `src/components/WhitelistTab.tsx`
- Modify: `src/components/RecycleBinTab.tsx`

- [ ] **Step 1: Add theme state (`loadSidebarTheme`, `saveSidebarTheme`, system media query listener, `chrome.storage.onChanged` listener, and `.dark` class toggle on `document.documentElement`) to `src/App.tsx` and theme toggle button to `src/components/Header.tsx`**
- [ ] **Step 2: Add `beforeunload` protection when `scanState === 'running' || scanState === 'paused'` and periodic snapshot persistence every 25 items in `src/App.tsx`**
- [ ] **Step 3: Wire `whitelist`, `onRemoveRecycleEntries`, and dark mode classes across `App.tsx` and all workbench tab/modal components**
- [ ] **Step 4: Run `npm run build` and `npm test` to verify full build and all tests pass**
