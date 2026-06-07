import type { ResolvedRevision, RevisionPage, ThemeManifest, PageManifest, PuckData } from './types';
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
}
