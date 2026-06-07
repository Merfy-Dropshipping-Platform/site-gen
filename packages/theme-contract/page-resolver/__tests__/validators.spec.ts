import { validateManifest, validateRevision } from '../validators';
import roseManifestRaw from '../../../theme-rose/theme.json';

describe('validateManifest', () => {
  it('passes valid manifest', () => {
    const manifest = {
      id: 'rose',
      manifestVersion: '2.0',
      pages: [
        { id: 'home', name: 'Главная', slug: '/', role: 'system', contentFile: 'pages/home.json', isHome: true },
      ],
    };
    expect(() => validateManifest(manifest)).not.toThrow();
  });

  it('rejects manifest without id', () => {
    const manifest = { manifestVersion: '2.0', pages: [] };
    expect(() => validateManifest(manifest)).toThrow(/id/);
  });

  it('rejects manifest with duplicate page ids', () => {
    const manifest = {
      id: 'rose',
      manifestVersion: '2.0',
      pages: [
        { id: 'home', name: 'A', slug: '/', role: 'system', contentFile: 'pages/home.json' },
        { id: 'home', name: 'B', slug: '/b', role: 'system', contentFile: 'pages/b.json' },
      ],
    };
    expect(() => validateManifest(manifest)).toThrow(/duplicate/i);
  });

  it('rejects manifest with duplicate slugs', () => {
    const manifest = {
      id: 'rose',
      manifestVersion: '2.0',
      pages: [
        { id: 'home', name: 'A', slug: '/', role: 'system', contentFile: 'pages/home.json' },
        { id: 'page-a', name: 'B', slug: '/', role: 'system', contentFile: 'pages/a.json' },
      ],
    };
    expect(() => validateManifest(manifest)).toThrow(/duplicate slug/i);
  });

  it('rejects manifest with no isHome flag set', () => {
    const manifest = {
      id: 'rose',
      manifestVersion: '2.0',
      pages: [
        { id: 'home', name: 'A', slug: '/', role: 'system', contentFile: 'pages/home.json' },
      ],
    };
    expect(() => validateManifest(manifest)).toThrow(/isHome/i);
  });

  it('rejects manifest with multiple isHome flags', () => {
    const manifest = {
      id: 'rose',
      manifestVersion: '2.0',
      pages: [
        { id: 'home', name: 'A', slug: '/', role: 'system', contentFile: 'pages/home.json', isHome: true },
        { id: 'page-a', name: 'B', slug: '/a', role: 'system', contentFile: 'pages/a.json', isHome: true },
      ],
    };
    expect(() => validateManifest(manifest)).toThrow(/exactly one/i);
  });
});

describe('validateRevision', () => {
  it('passes valid revision', () => {
    const revision = {
      manifestVersion: '2.0',
      themeId: 'rose',
      pages: [{ id: 'home', name: 'Главная', slug: '/', role: 'system', isCustom: false, source: 'theme' }],
      pagesData: { home: { content: [], root: { props: {} }, zones: {} } },
      themeSettings: {},
      siteOverrides: { pages: {}, blocks: {} },
      currentPageId: 'home',
      lockVersion: 1,
    };
    expect(() => validateRevision(revision)).not.toThrow();
  });

  it('rejects revision when currentPageId not in pages', () => {
    const revision = {
      manifestVersion: '2.0',
      themeId: 'rose',
      pages: [{ id: 'home', name: 'A', slug: '/', role: 'system', isCustom: false, source: 'theme' }],
      pagesData: { home: { content: [], root: { props: {} }, zones: {} } },
      themeSettings: {},
      siteOverrides: { pages: {}, blocks: {} },
      currentPageId: 'page-ghost',
      lockVersion: 1,
    };
    expect(() => validateRevision(revision)).toThrow(/currentPageId/i);
  });
});

describe('rose theme manifest validation', () => {
  it('passes validateManifest', () => {
    expect(() => validateManifest(roseManifestRaw)).not.toThrow();
  });

  it('has 8 system pages', () => {
    const m = roseManifestRaw as any;
    expect(m.pages).toHaveLength(8);
    expect(m.pages.every((p: any) => p.role === 'system')).toBe(true);
  });

  it('has exactly one isHome page', () => {
    const m = roseManifestRaw as any;
    const homes = m.pages.filter((p: any) => p.isHome);
    expect(homes).toHaveLength(1);
    expect(homes[0].id).toBe('home');
  });
});
