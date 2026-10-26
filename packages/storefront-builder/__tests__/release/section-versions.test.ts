import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashOf } from '@merfy/storefront-build';
import { readSectionFolder } from '@merfy/storefront-sections';
import { describe, expect, it } from 'vitest';
import { gitSectionVersions } from '../../src/release/section-versions';

// Версии папки нашей секции из истории git (часть 15з, Р15з-3): хеш версии из git — как у той же папки с диска.
const GIT = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];
const git = (cwd: string, ...args: string[]): string => execFileSync('git', [...GIT, ...args], { cwd, encoding: 'utf8' });

function repoWithFolder(): { repo: string; folder: string } {
  const repo = mkdtempSync(join(tmpdir(), 's2-b15z-'));
  const folder = join(repo, 'sections', 'badge');
  mkdirSync(join(folder, 'parts'), { recursive: true });
  git(repo, 'init', '-q');
  writeFileSync(join(folder, 'section.json'), '{"name":"badge"}\n');
  return { repo, folder };
}

describe('версии нашей секции из git', () => {
  it('версия — файлы как с диска, новые первыми; AGENTS.md не входит; несохранённая правка — не версия', async () => {
    const { repo, folder } = repoWithFolder();
    writeFileSync(join(folder, 'template.astro'), '<a>v1</a>\n');
    writeFileSync(join(folder, 'AGENTS.md'), 'правила\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'v1');
    const v1 = hashOf(await readSectionFolder(folder));
    writeFileSync(join(folder, 'template.astro'), '<a>v2</a>\n');
    writeFileSync(join(folder, 'parts', 'note.txt'), 'n\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'v2');
    const v2 = hashOf(await readSectionFolder(folder));
    writeFileSync(join(folder, 'template.astro'), '<a>v3</a>\n');
    const versions = await gitSectionVersions(folder);
    expect(versions.map((files) => hashOf(files))).toEqual([v2, v1]);
    expect(Object.keys(versions[0] ?? {})).toEqual(['parts/note.txt', 'section.json', 'template.astro']);
  });

  it('папки нет в истории — версий нет', async () => {
    expect(await gitSectionVersions(repoWithFolder().folder)).toEqual([]);
  });
});
