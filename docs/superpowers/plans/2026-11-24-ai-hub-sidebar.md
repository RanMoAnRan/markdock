# Side Panel AI Hub (Cherry Studio Style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Note: Per user rules, do **NOT** run `git commit` or `git push` unless the user explicitly asks.

**Goal:** Add a collapsible 44px left Dock icon rail and keep-alive embedded AI web workspace to MarkDock's Chrome/Edge side panel (`sidepanel.html`), with 10 built-in AI presets, full custom AI site management, and side-panel-scoped frame-header removal rules.

**Architecture:** Pure domain logic in `src/core/aiSites.ts` manages presets, URL normalization, CRUD, reordering, and storage migration; `src/core/storage.ts` persists AI site config, active dock target, and collapsed state locally; `src/background/aiFrameRules.ts` (wired into `service-worker.ts`) registers a single `declarativeNetRequest` dynamic rule scoped strictly to `tabIds: [-1]` and `sub_frame`. Three focused UI components (`DockRail`, `AiWorkspace`, `AiManagerModal`) plug into `SidePanelApp.tsx` without disrupting existing bookmark search, drag-and-drop, or `Alt+K` / folder-locate flows.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS v4, Lucide React, Chrome Manifest V3 (`declarativeNetRequestWithHostAccess`, `sidePanel`, `storage`, `tabs`), Vitest 3.

**Spec:** [2026-11-24-ai-hub-sidebar-design.md](file:///Users/ranmoanran/Jing/python-space/markdock/docs/superpowers/specs/2026-11-24-ai-hub-sidebar-design.md)

## Global Constraints

- Manifest permission MUST be `"declarativeNetRequestWithHostAccess"` (NOT `"declarativeNetRequest"`), preserving upgrade compatibility with existing `host_permissions`.
- DNR rule MUST be scoped to `tabIds: [-1]` (`chrome.tabs.TAB_ID_NONE`) and `resourceTypes: ['sub_frame']`, removing only `x-frame-options`, `content-security-policy`, and `frame-options` response headers; normal browser tabs (`tabId >= 0`) must never be affected.
- Pure local persistence in `chrome.storage.local` with `localStorage` fallback (no remote calls, no `content_scripts`, no `scripting` permission).
- Built-in 10 AI presets (first 6 enabled by default: ChatGPT, Claude, Gemini, DeepSeek, Kimi, 豆包; 4 disabled by default: 通义千问, Perplexity, Grok, 腾讯元宝) MUST render crisp brand-colored badge icons (never `/_favicon/` grey globes); custom sites use `/_favicon/` with colored initial badge fallback.
- AI iframes MUST be lazy-mounted on first visit and kept alive via CSS hiding when switching; manual refresh rebuilds the iframe via `reloadKey`, and unload removes it from mounted state.
- `Alt+K` (`FOCUS_SEARCH`) and `LOCATE_FOLDER` / `pendingLocateFolder` MUST switch active dock back to `'bookmarks'`; `onFocus` / `onVisibility` / `/` / `Ctrl+K` must NOT hijack focus while an AI view or `AiManagerModal` is active.

## Review Focus

1. **Disabling or deleting the currently active AI site** — must fall back active dock to `'bookmarks'` and drop the site from mounted/keep-alive IDs so no orphaned iframe stays in memory. (Pinned in Task 1 tests.)
2. **Invalid or dangerous custom URLs (`javascript:alert(1)`, `file:///etc/passwd`, blank strings, bare domains like `deepseek.com`)** — `normalizeAiUrl` must reject non-`http:`/`https:` schemes and cleanly prepend `https://` for bare domains. (Pinned in Task 1 tests.)
3. **Future preset additions vs. existing user storage (`mergeStoredAiSites`)** — loading older stored data missing a new built-in preset must append the missing preset while preserving user edits, custom sites, and custom order, and ignoring corrupted entries. (Pinned in Task 1 tests.)
4. **Resetting built-in presets (`resetBuiltInAiSites`)** — must restore default built-in names, URLs, and enabled flags while preserving all user-added custom sites. (Pinned in Task 1 tests.)
5. **DNR rule registration idempotency & non-extension environment fallback** — `setupAiFrameRules` must atomically `removeRuleIds: [AI_IFRAME_RULE_ID]` and `addRules: [...]` so repeated calls (`onInstalled`, `onStartup`, top-level) never throw duplicate-ID errors, and must safely no-op when `chrome.declarativeNetRequest` is unavailable. (Pinned in Task 3 tests.)

---

### Task 1: AI Site Types & Core Pure Logic

**Files:**
- Create: `src/types/ai.ts`
- Create: `src/core/aiSites.ts`
- Test: `src/core/__tests__/aiSites.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `src/types/ai.ts`:
    - `export interface AiSite { id: string; name: string; url: string; enabled: boolean; builtIn: boolean; badgeText?: string; accentColor?: string; }`
    - `export type DockTarget = 'bookmarks' | string;`
  - `src/core/aiSites.ts`:
    - `export const DEFAULT_AI_SITES: AiSite[]` (10 presets: `chatgpt`, `claude`, `gemini`, `deepseek`, `kimi`, `doubao` enabled; `qwen`, `perplexity`, `grok`, `yuanbao` disabled)
    - `export function normalizeAiUrl(raw: string): string | null`
    - `export function getAiBadgeText(site: Pick<AiSite, 'name' | 'badgeText'>): string`
    - `export function mergeStoredAiSites(stored: AiSite[] | null | undefined): AiSite[]`
    - `export function addCustomAiSite(sites: AiSite[], input: { name: string; url: string }): { sites: AiSite[]; created: AiSite } | { error: string }`
    - `export function updateAiSite(sites: AiSite[], id: string, patch: { name: string; url: string }): { sites: AiSite[] } | { error: string }`
    - `export function deleteCustomAiSite(sites: AiSite[], id: string): AiSite[]`
    - `export function toggleAiSite(sites: AiSite[], id: string, enabled?: boolean): AiSite[]`
    - `export function reorderAiSites(sites: AiSite[], fromIndex: number, toIndex: number): AiSite[]`
    - `export function resetBuiltInAiSites(sites: AiSite[]): AiSite[]`
    - `export function resolveActiveDockTarget(target: DockTarget, sites: AiSite[]): DockTarget`
    - `export function pruneLoadedAiIds(loadedIds: string[], sites: AiSite[]): string[]`

- [ ] **Step 1: Create `src/types/ai.ts` with `AiSite` and `DockTarget`**

- [ ] **Step 2: Write failing tests in `src/core/__tests__/aiSites.test.ts`**

Test cases to assert:
- `DEFAULT_AI_SITES` has 10 presets with the exact 6 enabled (`chatgpt`, `claude`, `gemini`, `deepseek`, `kimi`, `doubao`) and 4 disabled (`qwen`, `perplexity`, `grok`, `yuanbao`), all `builtIn: true` with non-empty `badgeText` and `accentColor`.
- `normalizeAiUrl`: accepts `https://chat.deepseek.com`, `http://localhost:3000`, bare domain `perplexity.ai` -> `https://perplexity.ai/`; rejects empty/whitespace, `javascript:alert(1)`, `file:///etc/passwd`, `ftp://example.com`, malformed strings without host.
- `mergeStoredAiSites`: returns clone of defaults when `null`/empty; preserves user order, edits, and custom sites; appends any newly introduced built-in preset missing from stored array; filters out malformed stored entries without `id`/`url`.
- `addCustomAiSite`: creates `builtIn: false`, `enabled: true` site with normalized URL; returns `{ error }` for empty name or invalid URL.
- `updateAiSite`: updates name/URL for both built-in and custom sites; returns `{ error }` on invalid input.
- `deleteCustomAiSite`: removes custom site; refuses to delete `builtIn: true` site (returns list unchanged).
- `toggleAiSite` & `reorderAiSites`: toggles `enabled` and moves item cleanly across valid indices (ignores out-of-bounds).
- `resetBuiltInAiSites`: restores all 10 built-in sites' default name/url/enabled while keeping all `builtIn: false` custom sites intact.
- `resolveActiveDockTarget` & `pruneLoadedAiIds`: returns `'bookmarks'` when target is disabled/deleted, keeps target when enabled; prunes disabled/deleted IDs from `loadedIds`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/core/__tests__/aiSites.test.ts`
Expected: FAIL (module `../aiSites` not found).

- [ ] **Step 4: Implement `src/core/aiSites.ts`**

Use exact URLs from spec Section 5.3, deterministic palette for custom site `accentColor`, and pure immutable array operations.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/core/__tests__/aiSites.test.ts`
Expected: PASS (all tests in `aiSites.test.ts`).

---

### Task 2: Storage Persistence for AI Hub

**Files:**
- Modify: `src/core/storage.ts`
- Test: `src/core/__tests__/aiStorage.test.ts`

**Interfaces:**
- Consumes: `AiSite`, `DockTarget` from `src/types/ai.ts`; `mergeStoredAiSites` from `src/core/aiSites.ts`
- Produces in `src/core/storage.ts`:
  - Storage keys: `aiSites: 'bcp_ai_sites'`, `dockCollapsed: 'bcp_dock_collapsed'`, `activeDockId: 'bcp_active_dock_id'`
  - `export async function loadAiSites(): Promise<AiSite[]>` (passes raw stored value through `mergeStoredAiSites`)
  - `export async function saveAiSites(sites: AiSite[]): Promise<void>`
  - `export async function loadDockCollapsed(): Promise<boolean>` (defaults to `false`)
  - `export async function saveDockCollapsed(collapsed: boolean): Promise<void>`
  - `export async function loadActiveDockId(): Promise<DockTarget>` (defaults to `'bookmarks'`)
  - `export async function saveActiveDockId(target: DockTarget): Promise<void>`

- [ ] **Step 1: Write failing tests in `src/core/__tests__/aiStorage.test.ts`**

Test `localStorage` fallback round-trip for `loadAiSites`/`saveAiSites` (including default merge when empty), `loadDockCollapsed`/`saveDockCollapsed`, and `loadActiveDockId`/`saveActiveDockId` (default `'bookmarks'`, persists `'deepseek'`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/__tests__/aiStorage.test.ts`
Expected: FAIL (exports not found in `../storage`).

- [ ] **Step 3: Add AI Hub storage helpers to `src/core/storage.ts`**

Follow the existing `storageGet`/`storageSet` pattern in `src/core/storage.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/__tests__/aiStorage.test.ts`
Expected: PASS.

---

### Task 3: Manifest Permission & Scoped DNR Frame Rules

**Files:**
- Modify: `public/manifest.json`
- Create: `src/background/aiFrameRules.ts`
- Modify: `src/background/service-worker.ts`
- Test: `src/core/__tests__/aiFrameRules.test.ts`

**Interfaces:**
- Consumes: `chrome.declarativeNetRequest`
- Produces:
  - `public/manifest.json`: add `"declarativeNetRequestWithHostAccess"` to `permissions`
  - `src/background/aiFrameRules.ts`:
    - `export const AI_IFRAME_RULE_ID = 1001;`
    - `export function buildAiFrameRule(): chrome.declarativeNetRequest.Rule`
    - `export async function setupAiFrameRules(): Promise<void>`

- [ ] **Step 1: Write failing tests in `src/core/__tests__/aiFrameRules.test.ts`**

Assert:
- `buildAiFrameRule()` returns rule with `id: 1001`, `priority: 1`, `condition: { tabIds: [-1], resourceTypes: ['sub_frame'] }`, and `action.type === 'modifyHeaders'` removing `x-frame-options`, `content-security-policy`, `frame-options`.
- `setupAiFrameRules()` calls `chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [1001], addRules: [rule] })` when API exists.
- `setupAiFrameRules()` resolves cleanly without throwing when `chrome.declarativeNetRequest` is undefined or `updateDynamicRules` rejects.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/__tests__/aiFrameRules.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/background/aiFrameRules.ts`, wire into `src/background/service-worker.ts`, and update `public/manifest.json`**

In `service-worker.ts`, invoke `void setupAiFrameRules()` alongside `void configureSidePanel()` in `onInstalled`, `onStartup`, and top-level init.
In `public/manifest.json`, add `"declarativeNetRequestWithHostAccess"` to `permissions`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/__tests__/aiFrameRules.test.ts`
Expected: PASS.

---

### Task 4: Left Dock Rail Component (`DockRail.tsx`)

**Files:**
- Create: `src/components/DockRail.tsx`

**Interfaces:**
- Consumes: `AiSite`, `DockTarget` from `src/types/ai.ts`; `getAiBadgeText` from `src/core/aiSites.ts`; `getFaviconUrl` from `src/core/bookmarks.ts`
- Produces:
  - `export interface DockRailProps { sites: AiSite[]; activeTarget: DockTarget; loadedAiIds: string[]; onSelectTarget: (target: DockTarget) => void; onOpenManager: () => void; onCollapse: () => void; }`
  - `export function AiSiteIcon({ site, size }: { site: AiSite; size?: 'sm' | 'md' }): JSX.Element` (reused by `DockRail`, `AiWorkspace`, and `AiManagerModal`: renders crisp brand-colored badge for `builtIn: true`; renders `/_favicon/` with badge fallback on error for `builtIn: false`)
  - `export function DockRail(props: DockRailProps): JSX.Element`

- [ ] **Step 1: Implement `src/components/DockRail.tsx`**

Layout & behavior:
- Fixed `w-11` (44px) `shrink-0` vertical flex column with subtle right border (`border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900`).
- Top section: Bookmarks button (`Bookmark` icon, active left indicator bar + blue highlight when `activeTarget === 'bookmarks'`, `title="书签"`).
- Thin divider (`h-px w-6 bg-slate-200 dark:bg-slate-800`).
- Middle scrollable section (`flex-1 overflow-y-auto`): enabled AI sites in order, each rendered with `AiSiteIcon`, active left indicator pill, subtle green/emerald dot on bottom-right corner if `loadedAiIds.includes(site.id)`, `title={site.name}`.
- Bottom fixed section: AI Manager button (`Settings2` / `SlidersHorizontal` icon, `title="管理 AI 网站"`) and Collapse button (`PanelLeftClose` icon, `title="收起左侧栏"`).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS with 0 errors.

---

### Task 5: Keep-Alive AI Workspace Component (`AiWorkspace.tsx`)

**Files:**
- Create: `src/components/AiWorkspace.tsx`

**Interfaces:**
- Consumes: `AiSite` from `src/types/ai.ts`; `AiSiteIcon` from `src/components/DockRail.tsx`
- Produces:
  - `export interface AiWorkspaceProps { activeSite: AiSite | null; mountedSites: AiSite[]; reloadKeys: Record<string, number>; dockCollapsed: boolean; onExpandDock: () => void; onRefreshSite: (siteId: string) => void; onUnloadSite: (siteId: string) => void; onOpenInNewTab: (url: string) => void; onOpenManager: () => void; }`
  - `export function AiWorkspace(props: AiWorkspaceProps): JSX.Element`

- [ ] **Step 1: Implement `src/components/AiWorkspace.tsx`**

Layout & behavior:
- Only visible when `activeSite !== null` (when hidden, parent hides the workspace container via CSS `hidden` so mounted iframes stay alive!).
- Compact 36px top bar (`h-9 px-2.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95`):
  - Left: if `dockCollapsed`, show `PanelLeftOpen` expand button (`title="展开左侧栏"`); then `AiSiteIcon` (`size="sm"`) + truncated `activeSite.name`.
  - Right: icon buttons for Refresh (`RotateCw`, `title="刷新当前 AI"`), Open in new tab (`ExternalLink`, `title="在新标签页打开（首次登录 / 验证）"`), Unload (`Power`, `title="休眠释放内存"`), Manage AI (`Settings2`, `title="管理 AI 网站"`).
- Main viewport (`relative flex-1 bg-white dark:bg-slate-950`):
  - Renders one `<iframe>` per site in `mountedSites` with `key={`${site.id}-${reloadKeys[site.id] ?? 0}`}`, `src={site.url}`, `title={site.name}`, `allow="clipboard-read; clipboard-write; microphone"`, `referrerPolicy="no-referrer-when-downgrade"`.
  - Non-active mounted iframes use `className="hidden"` (active iframe uses `className="h-full w-full border-0"`).
  - Lightweight loading overlay per iframe key until `onLoad` fires (with a 1-click "在新标签页打开" link if loading takes long or needs login).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS with 0 errors.

---

### Task 6: AI Site Manager Modal (`AiManagerModal.tsx`)

**Files:**
- Create: `src/components/AiManagerModal.tsx`

**Interfaces:**
- Consumes: `AiSite` from `src/types/ai.ts`; `AiSiteIcon` from `src/components/DockRail.tsx`
- Produces:
  - `export interface AiManagerModalProps { open: boolean; sites: AiSite[]; loadedAiIds: string[]; onClose: () => void; onToggle: (id: string) => void; onAdd: (input: { name: string; url: string }) => string | null; onUpdate: (id: string, patch: { name: string; url: string }) => string | null; onDelete: (id: string) => void; onReorder: (fromIndex: number, toIndex: number) => void; onResetBuiltIn: () => void; }`
  - `export function AiManagerModal(props: AiManagerModalProps): JSX.Element | null`

- [ ] **Step 1: Implement `src/components/AiManagerModal.tsx`**

Behavior & styling (matching MarkDock's existing modal design in `SidePanelApp.tsx`):
- Backdrop overlay (`fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px]`) closing on backdrop click or `Escape`.
- Header: "管理 AI 网站" + close `X` button.
- Scrollable site list:
  - Each row shows `AiSiteIcon`, name + truncated host, optional "运行中" tiny badge if in `loadedAiIds`.
  - Controls: Up/Down reorder buttons (`ArrowUp`/`ArrowDown`), Edit button (`Pencil`, opens inline edit form for name + URL with validation error display), Delete button (`Trash2`, shown only for `!site.builtIn`), and Enable/Disable toggle switch.
- Collapsible/inline "添加自定义 AI" form (Name + URL inputs + submit button, displays error returned by `onAdd` if invalid).
- Footer: "恢复默认预设" button (`RotateCcw`, preserves custom sites) + concise tip line ("若个别站点首次打开需登录或验证，请先点顶栏「在新标签页打开」登录后再刷新").

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS with 0 errors.

---

### Task 7: Integrate into `SidePanelApp.tsx` & Full Verification

**Files:**
- Modify: `src/sidepanel/SidePanelApp.tsx`

**Interfaces:**
- Consumes: `AiSite`, `DockTarget` (`src/types/ai.ts`), pure mutators (`src/core/aiSites.ts`), storage helpers (`src/core/storage.ts`), `DockRail`, `AiWorkspace`, `AiManagerModal`.

- [ ] **Step 1: Add AI Hub state and persistence to `SidePanelApp.tsx`**

State to add:
- `aiSites: AiSite[]` (loaded from `loadAiSites()`)
- `activeDockId: DockTarget` (loaded from `loadActiveDockId()`, resolved via `resolveActiveDockTarget`)
- `dockCollapsed: boolean` (loaded from `loadDockCollapsed()`)
- `loadedAiIds: string[]` (starts empty; appends `activeDockId` on mount if it's an AI site, or when user clicks an AI icon)
- `reloadKeys: Record<string, number>`
- `aiManagerOpen: boolean`

Wire mutations (`handleSelectDockTarget`, `handleToggleDockCollapsed`, `handleRefreshAiSite`, `handleUnloadAiSite`, `handleOpenAiInNewTab`, `handleToggleAiSite`, `handleAddAiSite`, `handleUpdateAiSite`, `handleDeleteAiSite`, `handleReorderAiSites`, `handleResetBuiltInAiSites`) using pure helpers from `src/core/aiSites.ts`, saving updated `aiSites` and pruning `loadedAiIds` / resolving `activeDockId` whenever sites change.

- [ ] **Step 2: Guard focus & keyboard handlers when in AI mode or `aiManagerOpen`**

In `SidePanelApp.tsx` lines ~385–449:
- `onFocus` & `onVisibility`: only call `focusSearch()` when `activeDockId === 'bookmarks' && !aiManagerOpen`.
- `onKeyDown` (`Ctrl/Cmd+K` and `/`): only trigger `focusSearch()` when `activeDockId === 'bookmarks' && !aiManagerOpen`.
- `FOCUS_SEARCH` (`Alt+K` message): set `activeDockId` to `'bookmarks'`, close `aiManagerOpen`, persist `'bookmarks'`, then focus search on next tick (`requestAnimationFrame` / `setTimeout(0)`).
- `LOCATE_FOLDER` message & initial `consumePendingLocateFolder()`: set `activeDockId` to `'bookmarks'`, close `aiManagerOpen`, then call `locateNode(folderId)`.

- [ ] **Step 3: Wrap `SidePanelApp` root layout with `DockRail` + Bookmarks view + `AiWorkspace` + `AiManagerModal`**

- Change outer container to `flex h-screen flex-row bg-white dark:bg-slate-950 ...`.
- Render `<DockRail />` when `!dockCollapsed`.
- Right column (`flex-1 min-w-0 flex flex-col h-full overflow-hidden`):
  - Existing bookmarks column wrapped in `<div className={activeDockId === 'bookmarks' ? 'flex flex-1 min-h-0 flex-col' : 'hidden'}>` (with a compact `PanelLeftOpen` button in the bookmarks `<header>` when `dockCollapsed` is true).
  - `<div className={activeDockId !== 'bookmarks' ? 'flex flex-1 min-h-0 flex-col' : 'hidden'}>` containing `<AiWorkspace />` (mounted whenever `loadedAiIds.length > 0` or `activeAiSite !== null`, so switching back to Bookmarks preserves all live iframes!).
- Render `<AiManagerModal />` at the root alongside `ConfirmDialog` and `toast`.

- [ ] **Step 4: Run full unit test suite and production build**

Run: `npm test && npm run build`
Expected: All Vitest tests PASS and `tsc --noEmit && vite build` succeeds cleanly with `dist/` generated.
