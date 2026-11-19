import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashOf } from '@merfy/storefront-build';
import { describe, expect, it } from 'vitest';
import {
  LIBRARY_HISTORY_PATH,
  addLineage,
  libraryHistoryOf,
  libraryHistoryText,
  parseLibraryHistory,
} from '../src/generate/library-history';
import { LIBRARY_DIRS, nameOf } from '../src/generate/library-index';
import { isLibrarySection, libraryHashesOf, libraryVersionOf, type LibraryHistory } from '../src/library-history';
import { listSectionFolders, readSectionFolder } from '../src/read-folder';

// История библиотеки (20.11): generated/library-history.json — отпечатки всех версий секций платформы. Файл только
// пополняется; сторож: текущая версия каждой секции в нём есть (забытый pnpm generate — красный тест).
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const FILE = new URL(`../${LIBRARY_HISTORY_PATH}`, import.meta.url);
const committed = (): LibraryHistory => parseLibraryHistory(readFileSync(FILE, 'utf8'));
const noGit = (): Promise<never[]> => Promise.resolve([]);

async function currentVersions(): Promise<{ name: string; hash: string }[]> {
  const folders = (await Promise.all(LIBRARY_DIRS.map((root) => listSectionFolders(`${PACKAGE_DIR}${root}`)))).flat();
  const sections = await Promise.all(folders.map((folder) => readSectionFolder(folder)));
  return sections.map((files) => ({ name: nameOf(files) ?? '', hash: hashOf(files) }));
}

describe('сторож: текущая версия каждой библиотечной секции — в истории', () => {
  it('отпечаток файлов папки есть в файле под именем секции', async () => {
    const history = committed();
    const current = await currentVersions();
    expect(current.length).toBeGreaterThanOrEqual(36);
    const missing = current.filter(({ name, hash }) => history[hash]?.name !== name).map(({ name }) => name);
    expect(missing).toEqual([]);
  });

  it('пополнение без git ничего не добавляет: файл уже полон', async () => {
    const history = committed();
    expect(await libraryHistoryOf(PACKAGE_DIR, history, noGit)).toEqual(history);
  });

  it('пустая история — каждая секция получает версию 1 из текущих папок', async () => {
    const built = await libraryHistoryOf(PACKAGE_DIR, {}, noGit);
    expect(Object.values(built).every((entry) => entry.version === 1)).toBe(true);
    expect(Object.keys(built)).toHaveLength(new Set((await currentVersions()).map(({ hash }) => hash)).size);
  });

  it('файл записан в том виде, в каком его пишет генератор', () => {
    expect(readFileSync(FILE, 'utf8')).toBe(libraryHistoryText(committed()));
  });

  it('номера версий у секции идут подряд с единицы', () => {
    const byName = Object.values(committed()).reduce<Record<string, number[]>>(
      (all, { name, version }) => ({ ...all, [name]: [...(all[name] ?? []), version] }),
      {},
    );
    for (const [name, versions] of Object.entries(byName)) {
      expect({ name, versions: [...versions].sort((a, b) => a - b) }).toEqual({
        name,
        versions: versions.map((_, index) => index + 1),
      });
    }
  });
});

describe('пополнение истории', () => {
  const base: LibraryHistory = {
    h1: { name: 'hero', version: 1 },
    h2: { name: 'hero', version: 2 },
    k1: { name: 'faq', version: 1 },
  };

  it('новые отпечатки — в конец секции по порядку появления; известные не переименовываются', () => {
    const next = addLineage(base, { name: 'hero', hashes: ['h1', 'h3', 'h2', 'h4', 'h3'] });
    expect(next).toEqual({ ...base, h3: { name: 'hero', version: 3 }, h4: { name: 'hero', version: 4 } });
  });

  it('прежние записи не удаляются, другая секция не затронута, новая секция — с единицы', () => {
    const next = addLineage(base, { name: 'tabs', hashes: ['t1'] });
    expect(next).toEqual({ ...base, t1: { name: 'tabs', version: 1 } });
  });

  it('отпечаток, уже занятый другой секцией, не перезаписывается', () => {
    expect(addLineage(base, { name: 'tabs', hashes: ['k1'] })).toEqual(base);
  });

  it('версии из git идут перед текущей и получают номера в порядке от старой к новой', async () => {
    const hero = await readSectionFolder(`${PACKAGE_DIR}fixtures/shop/hero`);
    const older = { ...hero, 'template.astro': `${hero['template.astro'] ?? ''}\n<!-- старая -->` };
    const oldest = { ...hero, 'template.astro': `${hero['template.astro'] ?? ''}\n<!-- самая старая -->` };
    const built = await libraryHistoryOf(PACKAGE_DIR, {}, (folder) =>
      Promise.resolve(folder.endsWith('/fixtures/shop/hero') ? [older, oldest] : []),
    );
    expect(built[hashOf(oldest)]).toEqual({ name: 'hero', version: 1 });
    expect(built[hashOf(older)]).toEqual({ name: 'hero', version: 2 });
    expect(built[hashOf(hero)]).toEqual({ name: 'hero', version: 3 });
  });
});

describe('секция по истории', () => {
  it('прежняя версия — библиотечная, версия и имя называются; правка мерчанта — нет', async () => {
    const hero = await readSectionFolder(`${PACKAGE_DIR}fixtures/shop/hero`);
    const old = { ...hero, 'template.astro': `${hero['template.astro'] ?? ''}\n<!-- прежняя -->` };
    const history: LibraryHistory = {
      [hashOf(old)]: { name: 'hero', version: 1 },
      [hashOf(hero)]: { name: 'hero', version: 2 },
    };
    expect(isLibrarySection(old, history)).toBe(true);
    expect(libraryVersionOf(old, history)).toEqual({ name: 'hero', version: 1 });
    const edited = { ...old, 'template.astro': `${old['template.astro'] ?? ''}\n<!-- мерчант -->` };
    expect(isLibrarySection(edited, history)).toBe(false);
    expect(libraryVersionOf(edited, history)).toBeUndefined();
  });

  it('отпечатки всех версий секции по имени', () => {
    const history: LibraryHistory = {
      a: { name: 'hero', version: 1 },
      b: { name: 'hero', version: 2 },
      c: { name: 'faq', version: 1 },
    };
    expect(libraryHashesOf('hero', history)).toEqual(new Set(['a', 'b']));
    expect(libraryHashesOf('absent', history).size).toBe(0);
  });

  it('встроенная история знает прежние версии каталога: в ней у catalog больше одной', () => {
    expect(libraryHashesOf('catalog').size).toBeGreaterThan(1);
  });
});
