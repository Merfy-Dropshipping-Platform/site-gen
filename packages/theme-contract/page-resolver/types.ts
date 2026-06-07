// backend/services/sites/packages/theme-contract/page-resolver/types.ts

/**
 * Single page entry в theme.json manifest. Declared by theme developer.
 * Each entry refers to file with default Puck content в pages/<contentFile>.
 */
export interface PageManifest {
  id: string;                     // 'home', 'page-about', 'page-blog-2026-summer'
  name: string;                   // 'Главная страница'
  slug: string;                   // '/', '/about', '/collections/preview'
  role: 'system' | 'custom';      // system = preset by theme, не удаляется
  contentFile: string;            // 'pages/home.json' relative to theme package root
  isHome?: boolean;               // ровно одна true per manifest
}

/**
 * Page metadata as stored в revision.data.pages[]. Extends manifest entry
 * с runtime-specific fields. Extension points (seo/locale/variant/...)
 * reserved as nullable для future features.
 */
export interface RevisionPage {
  id: string;
  name: string;
  slug: string;
  role: 'system' | 'custom';
  isCustom: boolean;
  source: 'theme' | 'user' | 'orphan';
  createdAt?: number;             // ms epoch, custom pages only
  // ── reserved future fields ──
  seo: null | SeoMeta;
  locale: null | string;
  variant: null | string;
  schedule: null | { startsAt: number; endsAt: number | null };
  permissions: null | { editableBy: string[] };
  targeting: null | Record<string, unknown>;
}

export interface SeoMeta {
  title?: string;
  description?: string;
  og?: Record<string, string>;
  structured?: unknown;
}

/**
 * Puck data shape — array content + root props + zones.
 * Matches @measured/puck Data<unknown> type.
 */
export interface PuckData {
  content: Array<{ type: string; props: Record<string, unknown> }>;
  root: { props: Record<string, unknown> };
  zones: Record<string, unknown>;
}

/**
 * Full revision.data shape после normalization. Constructor / build /
 * preview всегда работают с этой формой.
 */
export interface ResolvedRevision {
  manifestVersion: string;
  themeId: string;
  pages: RevisionPage[];
  pagesData: Record<string, PuckData>;
  themeSettings: Record<string, unknown>;
  siteOverrides: SiteOverrides;
  currentPageId: string;
  lockVersion: number;
}

export interface SiteOverrides {
  pages: Record<string, Partial<RevisionPage>>;
  blocks: Record<string, Record<string, unknown>>;
}

/**
 * Theme manifest as parsed from theme.json. Strict subset — only fields
 * page-resolver consumes.
 */
export interface ThemeManifest {
  id: string;
  manifestVersion?: string;       // absent → assumed "1.0", auto-migrated
  pages: PageManifest[];
  blockDefaults?: Record<string, Record<string, unknown>>;
  defaults?: Record<string, string>;
  colorSchemes?: Array<{ id: string; name: string; tokens: Record<string, string> }>;
}

/**
 * Result of resolvePage — page metadata + content ready to render.
 * Content может прийти из revision.pagesData[id] OR lazy-seeded из contentFile.
 */
export interface ResolvedPage {
  page: RevisionPage;
  content: PuckData;
  source: 'revision' | 'lazy-seed';
}
