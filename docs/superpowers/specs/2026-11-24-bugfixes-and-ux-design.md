# MarkDock Bug Fixes & UX Enhancements Design Spec

## 1. Intent & Why
Fix 5 identified logic/state bugs and deliver 5 high-impact UX improvements across the MarkDock Chrome/Edge MV3 extension (Side Panel + Cleaner Workbench) so that counts, labels, state persistence, dark mode, cross-view navigation, and bulk operations are consistent and safe.

## 2. Goals & Non-Goals
### Goals
1. **Confirmed Dead Alignment (`ScannerTab.tsx`)**: Keep `confirmedDeadItems` strictly scoped to `dead_404` (HTTP 404/410) to prevent accidental mass deletion during offline/DNS outages, and update button tooltip & confirmation dialog copy to accurately state that only `404 / 410` items are cleaned (while `dns_network` can be cleaned from its dedicated bucket).
2. **Expose `client_4xx` Bucket (`ScannerTab.tsx`)**: Add `client_4xx` ("请求异常 (4xx)") to `BUCKET_META` so the sum of issue buckets equals `all_issues` and users can filter, recheck, or batch-clean `client_4xx` items.
3. **Prune Orphaned Pinned IDs (`views.ts`, `SidePanelApp.tsx`)**: Add `prunePinnedIds(pinnedIds: string[], liveBookmarkIds: Set<string>): string[]` and prune orphaned IDs whenever the bookmark tree loads or refreshes.
4. **Whitelist Normalization & Visual Status (`whitelist.ts`, `AllBookmarksTab.tsx`)**:
   - Normalize domain patterns in `createWhitelistEntry` by stripping schemes, credentials, paths, query strings, hashes, and ports (extracting lowercase `hostname`), and guard against empty patterns.
   - Pass `whitelist` into `AllBookmarksTab` and indicate when a bookmark is already covered by the whitelist (disabling duplicate add).
5. **Action Icon Click Fallback (`service-worker.ts`)**: Register a fallback `chrome.action.onClicked` listener that opens the side panel if `chrome.sidePanel.setPanelBehavior` fails or is unavailable.
6. **Workbench Dark Mode Sync (`App.tsx` & Workbench components)**: Sync `bcp_sidebar_theme` (`system` | `light` | `dark`) in `App.tsx`, toggle `.dark` on `document.documentElement`, add a quick theme toggle in `Header.tsx`, and add dark mode utility classes across workbench components.
7. **Locate in Sidebar Across All Workbench Tabs (`locateInSidebar.ts`, `ScannerTab.tsx`, `AllBookmarksTab.tsx`, `DuplicatesTab.tsx`, `EmptyFoldersTab.tsx`)**: Extract a shared `locateInSidebar(nodeId: string, windowId?: number)` helper and add a "在侧边栏定位" action button to bookmarks in `ScannerTab`, `AllBookmarksTab`, and `DuplicatesTab`.
8. **Duplicates Tab Enhancements (`duplicates.ts`, `DuplicatesTab.tsx`)**:
   - Support retention strategy selection: `'newest'` (保留最新添加) vs `'oldest'` (保留最早添加) in `findDuplicateGroups` and `computeSafeRemovableDuplicates`.
   - Allow batch deduplication in both `exact` and `normalized` modes (with extra confirmation notice in `normalized` mode).
   - Add a per-item "仅保留此条" (Keep only this one) action inside each duplicate group with more than 1 item.
9. **Recycle Bin Search, Select All & Pagination (`RecycleBinTab.tsx`)**: Add keyword search (matching title, URL, folderPath, reason), page-level / filtered select-all checkbox, batch delete selected entries permanently, and pagination (20 / 50 / 100 per page).
10. **Scan Progress Protection (`App.tsx`)**:
    - Periodically persist scan results snapshot during an active scan (every 25 checked items).
    - Register a `beforeunload` warning when `scanState === 'running' || scanState === 'paused'`.

### Non-Goals
- Rewriting the side panel tree into a virtualized list (out of scope for this iteration).
- Modifying Manifest permissions.

## 3. Approaches Considered
- **Selected Approach**: Targeted modular enhancements in `src/core/` with unit test coverage first, followed by component updates in `src/components/`, `src/App.tsx`, and `src/sidepanel/SidePanelApp.tsx`.
- **Alternatives Rejected**: Full rewrite of `SidePanelApp.tsx` into a new state management library (unnecessary churn and regression risk).
