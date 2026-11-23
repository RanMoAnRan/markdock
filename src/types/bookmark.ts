export interface BookmarkItem {
  id: string;
  parentId: string;
  title: string;
  url: string;
  dateAdded?: number;
  folderPath: string[];
}

export interface FolderNode {
  id: string;
  parentId?: string;
  title: string;
  path: string[];
  bookmarkCount: number;
}

export type CheckStatus =
  | 'dead_404'
  | 'dns_network'
  | 'timeout'
  | 'server_5xx'
  | 'redirect'
  | 'restricted'
  | 'client_4xx'
  | 'valid'
  | 'skipped';

export type RestrictedSubType = 'bot_challenge' | 'auth_required';

export type RedirectSubType = 'http_to_https' | 'same_origin' | 'cross_origin';

export interface CheckResult {
  bookmark: BookmarkItem;
  status: CheckStatus;
  httpStatus?: number;
  reason: string;
  finalUrl?: string;
  restrictedSubType?: RestrictedSubType;
  redirectSubType?: RedirectSubType;
  checkedAt: number;
}

export interface ScanSettings {
  concurrency: number;
  timeoutSeconds: number;
  skipLocal: boolean;
  includeCredentials: boolean;
}

export interface WhitelistEntry {
  id: string;
  pattern: string;
  matchType: 'url' | 'domain';
  addedAt: number;
}

export interface RecycleBinEntry {
  id: string;
  originalId: string;
  title: string;
  url: string;
  folderPath: string[];
  parentId: string;
  deletedAt: number;
  reason: string;
}

export interface ScanSnapshot {
  savedAt: number;
  folderId: string;
  results: CheckResult[];
}

export interface DuplicateGroup {
  key: string;
  items: BookmarkItem[];
}

export interface EmptyFolderItem {
  id: string;
  parentId: string;
  title: string;
  path: string[];
  depth: number;
}

export interface VisitStat {
  count: number;
  lastVisitedAt: number;
}

export type VisitStatsMap = Record<string, VisitStat>;
