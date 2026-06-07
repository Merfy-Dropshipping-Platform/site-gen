import type { ResolvedRevision, RevisionPage, ThemeManifest, PageManifest, PuckData, ResolvedPage } from './types';
import { LazySeed } from './lazy-seed';
import type { LifecycleBus } from './lifecycle';
import { runMigrations } from './migrations';

export interface PageResolverOptions {
  manifest: ThemeManifest;
  lazySeed: LazySeed;
  lifecycle?: LifecycleBus;
}

function manifestEntryToRevisionPage(entry: PageManifest, source: 'theme' | 'user' = 'theme'): RevisionPage {
  return {
    id: entry.id,
    name: entry.name,
    slug: entry.slug,
    role: entry.role,
    isCustom: entry.role === 'custom',
    source,
    seo: null,
    locale: null,
    variant: null,
    schedule: null,
    permissions: null,
    targeting: null,
  };
}

/**
 * Resolves theme manifest + revision data into the canonical `ResolvedRevision`
 * shape consumed by sites.service (createSite, getRevision), preview controller,
 * and build pipeline. Methods added incrementally:
 *
 * - buildInitialRevision() — fresh revision на createSite
 * - normalizeRevision()    — Task 6 — legacy revisions → v2.0
 * - resolvePage()          — Task 7 — lazy-seed missing pages
 * - mergeOverrides()       — Task 8 — siteOverrides merge layer
 */
export class PageResolver {
  constructor(private readonly opts: PageResolverOptions) {}

  /** Build fresh revision при createSite — load all manifest pages content. */
  async buildInitialRevision(): Promise<ResolvedRevision> {
    const manifest = this.opts.manifest;
    const loaded = await Promise.all(
      manifest.pages.map(async (pm) => [pm.id, await this.opts.lazySeed.loadContent(manifest.id, pm.contentFile)] as const),
    );
    const pagesData: Record<string, PuckData> = Object.fromEntries(loaded);
    const home = manifest.pages.find((p) => p.isHome) ?? manifest.pages[0];
    return {
      manifestVersion: manifest.manifestVersion ?? '2.0',
      themeId: manifest.id,
      pages: manifest.pages.map((m) => manifestEntryToRevisionPage(m)),
      pagesData,
      themeSettings: {},
      siteOverrides: { pages: {}, blocks: {} },
      currentPageId: home.id,
      lockVersion: 1,
    };
  }

  /** Normalize legacy or current revision data. Idempotent. */
  normalizeRevision(data: any): ResolvedRevision {
    return runMigrations(data, this.opts.manifest);
  }

  /** Resolve content for given pageId. Lazy-seeds from contentFile if needed. */
  async resolvePage(revision: ResolvedRevision, pageId: string): Promise<ResolvedPage> {
    const page = revision.pages.find((p) => p.id === pageId);
    if (!page) throw new Error(`Page not found: ${pageId}`);

    const existing = revision.pagesData[pageId];
    if (existing) {
      return { page, content: existing, contentSource: 'revision' };
    }

    // Lazy seed — look up manifest contentFile
    const manifestEntry = this.opts.manifest.pages.find((m) => m.id === pageId);
    if (!manifestEntry) {
      // Orphan case: page exists в revision.pages но НЕ в theme manifest
      // (e.g. theme version removed it but revision wasn't migrated).
      // Throwing is intentional — let caller decide policy (treat as deleted,
      // show "unsupported" badge, etc). Per spec Sec 4.2 "Theme Version
      // Upgrade — Сценарий B".
      throw new Error(`Page ${pageId} has no content in revision and no manifest entry to lazy-seed from`);
    }
    const content = await this.opts.lazySeed.loadContent(this.opts.manifest.id, manifestEntry.contentFile);
    return { page, content, contentSource: 'lazy-seed' };
  }
}
