import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { relative } from 'node:path';
import { promisify } from 'node:util';
import { isAiFile, type SectionFiles } from '@merfy/storefront-sections';

// Версии папки нашей секции из истории git (блок 15, часть 15з, Р15з-3): `git log --format=%H HEAD -- <папка>` (новые
// первыми); у версии — файлы папки из `git ls-tree -r` и `git show <коммит>:<путь>`: путь от папки через «/», по
// алфавиту, без файлов для ИИ (isAiFile) — как readSectionFolder, чтобы hashOf совпал. Коммит без папки — пропуск.
// Корень — `git -C <папка> rev-parse --show-toplevel`. Только чтение.
const MAX_BUFFER = 64 * 1024 * 1024;
const run = promisify(execFile);

async function gitOf(folder: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd: folder, encoding: 'utf8', maxBuffer: MAX_BUFFER });
  return stdout;
}

const posix = (path: string): string => path.split('\\').join('/');

// Одна версия папки в коммите: перечесть файлы и прочитать каждый. Папки в коммите нет — null.
// Одна версия папки в коммите: перечесть файлы и прочитать каждый. Папки в коммите нет — null.
// ls-tree от cwd папки называет пути от самой папки; git show — от корня репозитория.
async function versionOf(folder: string, prefix: string, commit: string): Promise<SectionFiles | null> {
  const listing = await gitOf(folder, 'ls-tree', '-r', '--name-only', commit, '--', '.');
  const paths = listing
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => posix(line))
    .filter((path) => !isAiFile(path))
    .sort();
  if (paths.length === 0) return null;
  const texts = await Promise.all(paths.map((path) => gitOf(folder, 'show', `${commit}:${prefix}/${path}`)));
  return Object.fromEntries(paths.map((path, index) => [path, texts[index] ?? '']));
}

// История папки: коммиты, менявшие её, новые первыми. Репозиторий без коммитов — версий нет.
async function commitsOf(path: string): Promise<string[]> {
  try {
    return (await gitOf(path, 'log', '--format=%H', 'HEAD', '--', '.'))
      .split('\n')
      .filter((line) => line !== '');
  } catch (error) {
    const text = error instanceof Error ? error.message : '';
    if (text.includes('bad revision') || text.includes('does not have any commits yet')) return [];
    throw error;
  }
}

export async function gitSectionVersions(folder: string): Promise<SectionFiles[]> {
  // realpath: macOS даёт папку через /var, а git — через /private/var; относительный путь выйдет «наружу» корня.
  const path = await realpath(folder);
  const root = (await gitOf(path, 'rev-parse', '--show-toplevel')).trimEnd();
  const prefix = posix(relative(root, path));
  const commits = await commitsOf(path);
  const versions = await Promise.all(commits.map((commit) => versionOf(path, prefix, commit)));
  return versions.filter((version): version is SectionFiles => version !== null);
}
