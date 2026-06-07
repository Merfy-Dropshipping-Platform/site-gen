// backend/services/sites/packages/theme-contract/page-resolver/migrations.ts
import type { PageManifest, RevisionPage, ResolvedRevision, ThemeManifest } from './types';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

interface MigrationDef {
  from: string;
  to: string;
  transform(data: any, manifest: ThemeManifest): any;
}

function buildRevisionPage(manifestEntry: PageManifest, source: 'theme' | 'user' = 'theme'): RevisionPage {
  return {
    id: manifestEntry.id,
    name: manifestEntry.name,
    slug: manifestEntry.slug,
    role: manifestEntry.role,
    isCustom: manifestEntry.role === 'custom',
    source,
    seo: null,
    locale: null,
    variant: null,
    schedule: null,
    permissions: null,
    targeting: null,
  };
}

const v1ToV2: MigrationDef = {
  from: '1.0',
  to: '2.0',
  transform(data, manifest) {
    const existingPages = Array.isArray(data?.pages) ? data.pages : [];
    const merged: RevisionPage[] = [];
    const seen = new Set<string>();

    // 1. Preserve existing revision.pages (merchant overrides on name etc).
    for (const p of existingPages) {
      if (!p?.id) continue;
      merged.push({
        id: p.id,
        name: p.name ?? p.id,
        slug: p.slug ?? '/',
        role: p.role ?? 'system',
        isCustom: p.isCustom ?? p.role === 'custom',
        source: p.source ?? 'theme',
        createdAt: p.createdAt,
        seo: p.seo ?? null,
        locale: p.locale ?? null,
        variant: p.variant ?? null,
        schedule: p.schedule ?? null,
        permissions: p.permissions ?? null,
        targeting: p.targeting ?? null,
      });
      seen.add(p.id);
    }

    // 2. Add manifest pages not yet present.
    for (const m of manifest.pages) {
      if (seen.has(m.id)) continue;
      merged.push(buildRevisionPage(m));
    }

    return {
      ...data,
      manifestVersion: '2.0',
      themeId: manifest.id,
      pages: merged,
      pagesData: isPlainObject(data.pagesData) ? data.pagesData : {},
      themeSettings: isPlainObject(data.themeSettings) ? data.themeSettings : {},
      siteOverrides: isPlainObject(data.siteOverrides)
        ? {
            pages: isPlainObject(data.siteOverrides.pages) ? data.siteOverrides.pages : {},
            blocks: isPlainObject(data.siteOverrides.blocks) ? data.siteOverrides.blocks : {},
          }
        : { pages: {}, blocks: {} },
      currentPageId: data.currentPageId ?? 'home',
      lockVersion: Number.isFinite(data.lockVersion) ? data.lockVersion : 1,
    };
  },
};

export const MIGRATIONS: MigrationDef[] = [v1ToV2];

export function runMigrations(data: any, manifest: ThemeManifest): ResolvedRevision {
  let current = data ?? {};
  let currentVersion = current.manifestVersion ?? '1.0';
  // Filter to migrations whose `from` version <= current. Apply in array
  // order — `MIGRATIONS` registry must be authored in ascending `from` order.
  const applicable = MIGRATIONS.filter((m) => versionGte(currentVersion, m.from));
  for (const m of applicable) {
    if (versionLt(currentVersion, m.to)) {
      current = m.transform(current, manifest);
      currentVersion = m.to;
    }
  }
  return current as ResolvedRevision;
}

function parseVersion(v: string): [number, number] {
  const parts = v.split('.').map((n) => parseInt(n, 10));
  return [parts[0] ?? 0, parts[1] ?? 0];
}

function versionGte(a: string, b: string): boolean {
  const [aM, am] = parseVersion(a);
  const [bM, bm] = parseVersion(b);
  return aM > bM || (aM === bM && am >= bm);
}

function versionLt(a: string, b: string): boolean {
  return !versionGte(a, b);
}
