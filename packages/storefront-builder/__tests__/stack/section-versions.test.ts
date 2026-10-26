import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashOf } from '@merfy/storefront-build';
import { acceptSection, readSectionFolder, type SectionFiles } from '@merfy/storefront-sections';
import { createS3Store } from '@merfy/storefront-storage';
import { afterAll, describe, expect, it } from 'vitest';
import { gitSectionVersions } from '../../src/release/section-versions';
import { resaveSection } from '../../src/release/section';
import { STACK, insertSite, openPool, resetBuilder } from './stack';

// Версии папки нашей секции из истории git (блок 15, часть 15з, Р15з-3) — в стековом прогоне: чистые проверки истории
// и вместе с resaveSection — источники версий как у команды theme-release section.
const GIT = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];
const git = (cwd: string, ...args: string[]): string => execFileSync('git', [...GIT, ...args], { cwd, encoding: 'utf8' });
const LONG = 60_000;
const db = openPool();
const store = createS3Store(STACK.s3);
const OURS = fileURLToPath(new URL('../../../storefront-shell/sections/cart-badge', import.meta.url));

function repoWithFolder(files?: { name: string; text: string }): { repo: string; folder: string } {
  const repo = mkdtempSync(join(tmpdir(), 's2-b15z-cov-'));
  const folder = join(repo, 'sections', 'badge');
  mkdirSync(join(folder, 'parts'), { recursive: true });
  git(repo, 'init', '-q');
  writeFileSync(join(folder, 'section.json'), '{"name":"badge"}\n');
  if (files !== undefined) writeFileSync(join(folder, files.name), files.text);
  return { repo, folder };
}

describe('версии нашей секции из git (стек)', () => {
  it('версия — файлы как с диска, новые первыми; несохранённая правка — не версия', async () => {
    const { repo, folder } = repoWithFolder({ name: 'template.astro', text: '<a>v1</a>\n' });
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'v1');
    const v1 = await readSectionFolder(folder);
    writeFileSync(join(folder, 'template.astro'), '<a>v2</a>\n');
    writeFileSync(join(folder, 'parts', 'note.txt'), 'n\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'v2');
    const v2 = await readSectionFolder(folder);
    writeFileSync(join(folder, 'template.astro'), '<a>v3</a>\n');
    const versions = await gitSectionVersions(folder);
    expect(versions.map((filesOf) => hashOf(filesOf))).toEqual([hashOf(v2), hashOf(v1)]);
    expect(Object.keys(versions[0] ?? {})).toEqual(['parts/note.txt', 'section.json', 'template.astro']);
  });

  it('папки нет в истории и у репозитория нет коммитов — версий нет', async () => {
    expect(await gitSectionVersions(repoWithFolder().folder)).toEqual([]);
    const empty = mkdtempSync(join(tmpdir(), 's2-b15z-cov-'));
    git(empty, 'init', '-q');
    writeFileSync(join(empty, 'README.md'), 'x\n');
    expect(await gitSectionVersions(empty)).toEqual([]);
  });

  it(
    'resaveSection с gitSectionVersions: копия из истории — наша, обновление до версии с диска',
    async () => {
      await resetBuilder(db);
      await db.query('TRUNCATE storefront_section');
      const repo = mkdtempSync(join(tmpdir(), 's2-b15z-cov-'));
      const folder = join(repo, 'sections', 'cart-badge');
      mkdirSync(join(repo, 'sections'), { recursive: true });
      cpSync(OURS, folder, { recursive: true });
      git(repo, 'init', '-q');
      git(repo, 'add', '.');
      git(repo, 'commit', '-q', '-m', 'v1');
      const v1 = await readSectionFolder(folder);
      const shop = await insertSite(db);
      const accepted = await acceptSection({ db, store }, { author: 'shop', shopId: shop.id }, v1);
      expect(accepted.status).toBe('accepted');
      const v2: SectionFiles = {
        ...v1,
        'template.astro': (v1['template.astro'] ?? '').replace('Корзина', 'Корзина · cov'),
      };
      writeFileSync(join(folder, 'template.astro'), v2['template.astro'] ?? '');
      git(repo, 'add', '.');
      git(repo, 'commit', '-q', '-m', 'v2');
      const report = await resaveSection(
        {
          db,
          store,
          contour: 'dev',
          startedBy: 'тест',
          say: () => undefined,
          read: readSectionFolder,
          versions: gitSectionVersions,
        },
        { folder, write: false, testShop: null, theme: 'nova' },
      );
      expect(report.sourceHash).toBe(hashOf(v2));
      expect(report.shops.map((row) => [row.action, row.inRelease])).toEqual([['update', true]]);
      expect(report.shops[0]?.files).toEqual({ added: [], changed: ['template.astro'], removed: [] });
    },
    LONG,
  );
});

afterAll(async () => {
  await db.end();
});
