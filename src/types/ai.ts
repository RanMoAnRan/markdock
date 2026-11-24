export interface AiSite {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  builtIn: boolean;
  badgeText?: string;
  accentColor?: string;
}

export type DockTarget = 'bookmarks' | string;
