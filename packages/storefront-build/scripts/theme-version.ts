import { readFile, writeFile } from 'node:fs/promises';
import { parseTokenMigrations } from '@merfy/tokens';
import { changelogProblems, parseChangelog } from '../src/changelog';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical';
import { kebabIdSchema } from '../src/inputs';
import { parseWith } from '../src/parse';
import {
  THEME_VERSION_TEXT,
  readThemeState,
  readThemeVersions,
  themeVersionStatus,
  type ThemeVersionStatus,
} from '../src/theme-version';

// pnpm theme-version <тема> — записать номер темы и отпечаток её файлов в theme-versions.json (design.md блока 4,
// В4-1 В). Пишет только новую версию: файлы изменились, а номер тот же, — отказ с текстом, что делать, и код 1.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const ROOT = join(PACKAGE_DIR, '..', '..');
const VERSIONS_FILE = join(PACKAGE_DIR, 'theme-versions.json');

// Тема — первым аргументом: pnpm theme-version nova.
const themeId = parseWith(kebabIdSchema, process.argv[2], 'inputs-invalid');
const versions = await readThemeVersions(VERSIONS_FILE);
const current = await readThemeState(ROOT, themeId);

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));

// Журнал версий и шаги перевода пакета темы (design.md блока 10): без строки журнала номер не пишем.
async function journalProblems(): Promise<string[]> {
  const themeDir = join(ROOT, 'packages', `theme-${themeId}`);
  const changelog = parseChangelog(await readJson(join(themeDir, 'changelog.json')));
  const migrations = parseTokenMigrations(await readJson(join(themeDir, 'migrations.json')));
  return changelogProblems(changelog, migrations, current.version);
}

// Запись — канонический JSON с отступами: темы по алфавиту, от запуска к запуску файл тот же.
async function record(): Promise<string> {
  const problems = await journalProblems();
  if (problems.length > 0) {
    process.exitCode = 1;
    return problems.join('\n');
  }
  const text = JSON.stringify(JSON.parse(canonicalJson({ ...versions, [themeId]: current })), null, 2);
  await writeFile(VERSIONS_FILE, `${text}\n`);
  return `записано: ${themeId} ${current.version} ${current.contentHash}`;
}

function refuse(): Promise<string> {
  process.exitCode = 1;
  return Promise.resolve(THEME_VERSION_TEXT.stale(themeId, current.version));
}

const ACTIONS: Record<ThemeVersionStatus, () => Promise<string>> = {
  ok: () => Promise.resolve(`без изменений: ${themeId} ${current.version} ${current.contentHash}`),
  record,
  stale: refuse,
};

process.stdout.write(`${await ACTIONS[themeVersionStatus(versions[themeId], current)]()}\n`);
