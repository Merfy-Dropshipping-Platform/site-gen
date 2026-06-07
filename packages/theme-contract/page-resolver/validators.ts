// backend/services/sites/packages/theme-contract/page-resolver/validators.ts
import type { ThemeManifest, ResolvedRevision } from './types';

export function validateManifest(manifest: unknown): asserts manifest is ThemeManifest {
  if (!manifest || typeof manifest !== 'object') throw new Error('Manifest must be object');
  const m = manifest as ThemeManifest;
  if (!m.id || typeof m.id !== 'string') throw new Error('Manifest.id required (string)');
  if (!Array.isArray(m.pages)) throw new Error('Manifest.pages must be array');

  const ids = new Set<string>();
  const slugs = new Set<string>();
  let homeCount = 0;
  for (const p of m.pages) {
    if (!p.id || !p.name || !p.slug || !p.role || !p.contentFile) {
      throw new Error(`Manifest page missing required field: ${JSON.stringify(p)}`);
    }
    if (ids.has(p.id)) throw new Error(`Duplicate page id: ${p.id}`);
    if (slugs.has(p.slug)) throw new Error(`Duplicate slug: ${p.slug}`);
    ids.add(p.id);
    slugs.add(p.slug);
    if (p.isHome) homeCount++;
  }
  if (homeCount === 0) throw new Error('Manifest must mark exactly one page with isHome: true (got 0)');
  if (homeCount > 1) throw new Error(`Manifest must mark exactly one page with isHome: true (got ${homeCount})`);
}

export function validateRevision(revision: unknown): asserts revision is ResolvedRevision {
  if (!revision || typeof revision !== 'object') throw new Error('Revision must be object');
  const r = revision as ResolvedRevision;
  if (!Array.isArray(r.pages)) throw new Error('Revision.pages must be array');
  if (!r.pagesData || typeof r.pagesData !== 'object') throw new Error('Revision.pagesData must be object');

  const pageIds = new Set(r.pages.map((p) => p.id));
  if (!pageIds.has(r.currentPageId)) {
    throw new Error(`currentPageId "${r.currentPageId}" not in revision.pages`);
  }
}
