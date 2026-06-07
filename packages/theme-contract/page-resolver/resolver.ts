import type { ResolvedRevision, RevisionPage, ThemeManifest, PageManifest } from './types';
import { LazySeed } from './lazy-seed';
import { runMigrations } from './migrations';
import { LifecycleBus } from './lifecycle';

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

// Imports `runMigrations` and `LifecycleBus` are reserved for Tasks 6 & 7.
// Silence unused-import lint warnings without dropping them — keeping the
// surface stable means downstream tasks just call them inline.
void runMigrations;
void LifecycleBus;

export class PageResolver {
  constructor(private readonly opts: PageResolverOptions) {}

  /** Build fresh revision при createSite — load all manifest pages content. */
  async buildInitialRevision(): Promise<ResolvedRevision> {
    const manifest = this.opts.manifest;
    const pagesData: Record<string, any> = {};
    for (const pm of manifest.pages) {
      pagesData[pm.id] = await this.opts.lazySeed.loadContent(manifest.id, pm.contentFile);
    }
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
}
