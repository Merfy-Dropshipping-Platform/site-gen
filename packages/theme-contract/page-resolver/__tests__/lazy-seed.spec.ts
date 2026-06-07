import { LazySeed } from '../lazy-seed';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('LazySeed', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lazy-seed-'));
    await fs.mkdir(path.join(tmpDir, 'pages'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'pages', 'home.json'),
      JSON.stringify({ content: [{ type: 'Hero', props: { id: 'Hero-1' } }], root: { props: {} }, zones: {} }),
    );
  });

  it('loads content from contentFile relative to theme package dir', async () => {
    const seed = new LazySeed({ themePackageRoots: { rose: tmpDir } });
    const data = await seed.loadContent('rose', 'pages/home.json');
    expect(data.content[0].type).toBe('Hero');
  });

  it('caches loaded files (second call same instance)', async () => {
    const seed = new LazySeed({ themePackageRoots: { rose: tmpDir } });
    const first = await seed.loadContent('rose', 'pages/home.json');
    const second = await seed.loadContent('rose', 'pages/home.json');
    expect(first).toBe(second); // same object reference — cache hit
  });

  it('throws when contentFile not found', async () => {
    const seed = new LazySeed({ themePackageRoots: { rose: tmpDir } });
    await expect(seed.loadContent('rose', 'pages/nope.json')).rejects.toThrow();
  });

  it('throws when theme not registered', async () => {
    const seed = new LazySeed({ themePackageRoots: {} });
    await expect(seed.loadContent('rose', 'pages/home.json')).rejects.toThrow(/unknown theme/i);
  });
});
