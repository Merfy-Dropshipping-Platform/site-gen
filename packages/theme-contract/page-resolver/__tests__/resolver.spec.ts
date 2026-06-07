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
