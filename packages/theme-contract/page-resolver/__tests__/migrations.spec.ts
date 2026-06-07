import { runMigrations, MIGRATIONS } from '../migrations';
import type { ThemeManifest } from '../types';

// MIGRATIONS imported to lock its export shape; intentionally referenced once below.
void MIGRATIONS;

const roseManifest: ThemeManifest = {
  id: 'rose',
  manifestVersion: '2.0',
  pages: [
    { id: 'home', name: 'Главная', slug: '/', role: 'system', contentFile: 'pages/home.json', isHome: true },
    { id: 'page-about', name: 'О нас', slug: '/about', role: 'system', contentFile: 'pages/about.json' },
  ],
};

describe('migrations', () => {
  it('detects manifestVersion 1.0 (absent → assumed v1)', () => {
    const legacy = { pages: [{ id: 'home' }], pagesData: { home: {} } };
    const migrated = runMigrations(legacy, roseManifest);
    expect(migrated.manifestVersion).toBe('2.0');
  });

  it('injects themeId from manifest', () => {
    const legacy = { pages: [{ id: 'home' }], pagesData: { home: {} } };
    const migrated = runMigrations(legacy, roseManifest);
    expect(migrated.themeId).toBe('rose');
  });

  it('merges revision.pages with manifest.pages (adds missing)', () => {
    const legacy = { pages: [{ id: 'home', name: 'Главная', slug: '/', role: 'system' }], pagesData: { home: {} } };
    const migrated = runMigrations(legacy, roseManifest);
    const ids = migrated.pages.map((p) => p.id);
    expect(ids).toContain('home');
    expect(ids).toContain('page-about');
    expect(migrated.pages).toHaveLength(2);
  });

  it('preserves revision.pages already present (no duplicate)', () => {
    const legacy = {
      pages: [
        { id: 'home', name: 'Главная', slug: '/', role: 'system' },
        { id: 'page-about', name: 'О бренде', slug: '/brand', role: 'system' },
      ],
      pagesData: { home: {}, 'page-about': {} },
    };
    const migrated = runMigrations(legacy, roseManifest);
    const about = migrated.pages.find((p) => p.id === 'page-about');
    expect(about?.name).toBe('О бренде'); // merchant override preserved
    expect(migrated.pages).toHaveLength(2);
  });

  it('is idempotent (run twice = run once)', () => {
    const legacy = { pages: [{ id: 'home' }], pagesData: { home: {} } };
    const once = runMigrations(legacy, roseManifest);
    const twice = runMigrations(once, roseManifest);
    expect(twice).toEqual(once);
  });

  it('initializes extension point fields to null', () => {
    const legacy = { pages: [{ id: 'home', name: 'Главная', slug: '/', role: 'system' }], pagesData: {} };
    const migrated = runMigrations(legacy, roseManifest);
    const home = migrated.pages.find((p) => p.id === 'home')!;
    expect(home.seo).toBeNull();
    expect(home.locale).toBeNull();
    expect(home.variant).toBeNull();
  });

  it('initializes lockVersion to 1 if absent', () => {
    const legacy = { pages: [{ id: 'home' }], pagesData: {} };
    const migrated = runMigrations(legacy, roseManifest);
    expect(migrated.lockVersion).toBe(1);
  });

  it('preserves existing lockVersion', () => {
    const legacy = { pages: [{ id: 'home' }], pagesData: {}, lockVersion: 42 };
    const migrated = runMigrations(legacy, roseManifest);
    expect(migrated.lockVersion).toBe(42);
  });

  it('survives malformed input (non-object pagesData, NaN lockVersion, non-array pages)', () => {
    const broken = {
      pages: 'not an array',
      pagesData: 'not an object',
      themeSettings: 42,
      siteOverrides: ['wrong', 'shape'],
      lockVersion: Number.NaN,
    };
    const migrated = runMigrations(broken, roseManifest);
    expect(migrated.pagesData).toEqual({});
    expect(migrated.themeSettings).toEqual({});
    expect(migrated.siteOverrides).toEqual({ pages: {}, blocks: {} });
    expect(migrated.lockVersion).toBe(1);
    // pages: should fall back to manifest-derived pages (2 from rose)
    expect(migrated.pages).toHaveLength(2);
  });
});
