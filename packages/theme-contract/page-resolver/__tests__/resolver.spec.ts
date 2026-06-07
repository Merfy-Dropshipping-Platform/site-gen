import { PageResolver } from '../resolver';
import { LazySeed } from '../lazy-seed';
import type { ThemeManifest, PuckData } from '../types';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

const roseManifest: ThemeManifest = {
  id: 'rose',
  manifestVersion: '2.0',
  pages: [
    { id: 'home', name: 'Главная', slug: '/', role: 'system', contentFile: 'pages/home.json', isHome: true },
    { id: 'page-about', name: 'О нас', slug: '/about', role: 'system', contentFile: 'pages/about.json' },
  ],
};

const homeContent: PuckData = {
  content: [{ type: 'Hero', props: { id: 'Hero-1' } }],
  root: { props: { title: 'Главная' } },
  zones: {},
};

const aboutContent: PuckData = {
  content: [{ type: 'MainText', props: { id: 'MainText-1', text: 'О компании' } }],
  root: { props: { title: 'О нас' } },
  zones: {},
};

let tmpDir: string;
let resolver: PageResolver;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resolver-'));
  await fs.mkdir(path.join(tmpDir, 'pages'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'pages', 'home.json'), JSON.stringify(homeContent));
  await fs.writeFile(path.join(tmpDir, 'pages', 'about.json'), JSON.stringify(aboutContent));
  resolver = new PageResolver({
    manifest: roseManifest,
    lazySeed: new LazySeed({ themePackageRoots: { rose: tmpDir } }),
  });
});

describe('PageResolver.buildInitialRevision', () => {
  it('returns revision with all manifest pages + their content loaded', async () => {
    const rev = await resolver.buildInitialRevision();
    expect(rev.manifestVersion).toBe('2.0');
    expect(rev.themeId).toBe('rose');
    expect(rev.pages).toHaveLength(2);
    expect(rev.pagesData.home.content[0].type).toBe('Hero');
    expect(rev.pagesData['page-about'].content[0].type).toBe('MainText');
  });

  it('sets currentPageId to home page', async () => {
    const rev = await resolver.buildInitialRevision();
    expect(rev.currentPageId).toBe('home');
  });

  it('initializes empty siteOverrides + themeSettings', async () => {
    const rev = await resolver.buildInitialRevision();
    expect(rev.siteOverrides).toEqual({ pages: {}, blocks: {} });
    expect(rev.themeSettings).toEqual({});
  });

  it('initializes lockVersion to 1', async () => {
    const rev = await resolver.buildInitialRevision();
    expect(rev.lockVersion).toBe(1);
  });
});

describe('PageResolver.normalizeRevision', () => {
  it('migrates legacy revision (no manifestVersion) to v2.0', () => {
    const legacy = {
      pages: [{ id: 'home', name: 'Главная', slug: '/', role: 'system' }],
      pagesData: { home: homeContent },
    };
    const normalized = resolver.normalizeRevision(legacy);
    expect(normalized.manifestVersion).toBe('2.0');
    expect(normalized.themeId).toBe('rose');
  });

  it('adds missing manifest pages to revision.pages', () => {
    const legacy = {
      pages: [{ id: 'home', name: 'Главная', slug: '/', role: 'system' }],
      pagesData: { home: homeContent },
    };
    const normalized = resolver.normalizeRevision(legacy);
    const ids = normalized.pages.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['home', 'page-about']));
  });

  it('preserves merchant overrides on page names', () => {
    const legacy = {
      pages: [
        { id: 'home', name: 'Главная', slug: '/', role: 'system' },
        { id: 'page-about', name: 'О бренде', slug: '/brand', role: 'system' },
      ],
      pagesData: { home: homeContent, 'page-about': aboutContent },
    };
    const normalized = resolver.normalizeRevision(legacy);
    const about = normalized.pages.find((p) => p.id === 'page-about');
    expect(about?.name).toBe('О бренде');
    expect(about?.slug).toBe('/brand');
  });

  it('preserves custom user pages', () => {
    const legacy = {
      pages: [
        { id: 'home', name: 'Главная', slug: '/', role: 'system' },
        { id: 'page-custom-blog', name: 'Блог', slug: '/blog', role: 'custom', isCustom: true, source: 'user' },
      ],
      pagesData: { home: homeContent, 'page-custom-blog': aboutContent },
    };
    const normalized = resolver.normalizeRevision(legacy);
    expect(normalized.pages.find((p) => p.id === 'page-custom-blog')).toBeDefined();
  });

  it('is idempotent', () => {
    const legacy = { pages: [{ id: 'home', name: 'Главная', slug: '/', role: 'system' }], pagesData: { home: homeContent } };
    const once = resolver.normalizeRevision(legacy);
    const twice = resolver.normalizeRevision(once);
    expect(twice).toEqual(once);
  });
});

describe('PageResolver.resolvePage', () => {
  it('returns content from revision.pagesData when present', async () => {
    const rev = await resolver.buildInitialRevision();
    const resolved = await resolver.resolvePage(rev, 'home');
    expect(resolved.content.content[0].type).toBe('Hero');
    expect(resolved.contentSource).toBe('revision');
  });

  it('lazy-seeds content from contentFile when pagesData[id] missing', async () => {
    const legacy = resolver.normalizeRevision({
      pages: [{ id: 'home', name: 'Главная', slug: '/', role: 'system' }],
      pagesData: { home: homeContent }, // page-about missing
    });
    const resolved = await resolver.resolvePage(legacy, 'page-about');
    expect(resolved.content.content[0].type).toBe('MainText');
    expect(resolved.contentSource).toBe('lazy-seed');
  });

  it('returns metadata from revision.pages', async () => {
    const rev = await resolver.buildInitialRevision();
    const resolved = await resolver.resolvePage(rev, 'page-about');
    expect(resolved.page.id).toBe('page-about');
    expect(resolved.page.name).toBe('О нас');
  });

  it('throws when pageId not in revision.pages AND not in manifest', async () => {
    const rev = await resolver.buildInitialRevision();
    await expect(resolver.resolvePage(rev, 'page-nope')).rejects.toThrow(/not found/i);
  });

  it('throws when page is in revision.pages but missing both pagesData AND manifest entry (orphan)', async () => {
    const orphanRevision = resolver.normalizeRevision({
      pages: [
        { id: 'home', name: 'Главная', slug: '/', role: 'system' },
        // Orphan: in revision.pages but neither pagesData entry nor manifest entry exists
        { id: 'page-removed-by-theme-upgrade', name: 'Орфан', slug: '/orphan', role: 'system' },
      ],
      pagesData: { home: homeContent },
    });
    await expect(
      resolver.resolvePage(orphanRevision, 'page-removed-by-theme-upgrade'),
    ).rejects.toThrow(/no manifest entry to lazy-seed/i);
  });
});
