import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, matchesGlob, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import themeVersionsJson from '../theme-versions.json';
import { PLATFORM_RENDER_FILES, THEME_FILES, platformRenderHash } from '../src/render-files';
import { checkThemeVersion, parseThemeVersions, readThemeState } from '../src/theme-version';

// Сторожа на настоящем репозитории (design.md блока 4, В4-1 В): файлы новых тем учтены, их версии записаны, код
// платформы, который рисует страницы, весь в отпечатке платформы.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PACKAGE_SRC = join(ROOT, 'packages', 'storefront-build', 'src');

// Новые темы — те, у которых есть конфиг рисовальщика.
const NEW_THEMES = readdirSync(join(ROOT, 'themes')).filter((id) =>
  existsSync(join(ROOT, 'themes', id, 'astro.renderer.config.mjs')),
);

// Файлы папки темы под git — вместе с ещё не добавленными, без спрятанных .gitignore.
function themeFiles(themeId: string): string[] {
  const args = ['ls-files', '--cached', '--others', '--exclude-standard', '--', `themes/${themeId}`];
  const output = execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  const files = output.split('\n').filter((line) => line !== '');
  return files.map((file) => relative(`themes/${themeId}`, file));
}

const listsOf = (file: string): string[] =>
  Object.entries(THEME_FILES)
    .filter(([, patterns]) => patterns.some((pattern) => matchesGlob(file, pattern)))
    .map(([list]) => list);

describe('новые темы', () => {
  it('среди них nova', () => {
    expect(NEW_THEMES).toContain('nova');
  });

  it.each(NEW_THEMES)('файл не учтён: каждый файл темы %s — ровно в одном списке', (themeId) => {
    const wrong = themeFiles(themeId).filter((file) => listsOf(file).length !== 1);
    expect(wrong).toEqual([]);
  });

  it.each(NEW_THEMES)('версия и отпечаток темы %s записаны', async (themeId) => {
    const versions = parseThemeVersions(themeVersionsJson);
    const current = await readThemeState(ROOT, themeId);
    expect(() => checkThemeVersion(themeId, versions[themeId], current)).not.toThrow();
  });

  it('в записи версий — только новые темы', () => {
    expect(Object.keys(parseThemeVersions(themeVersionsJson)).sort()).toEqual([...NEW_THEMES].sort());
  });
});

// Импорты в исходниках: import … from '…', export … from '…', import '…'.
const IMPORT = /(?:from|import)\s*['"]([^'"]+)['"]/g;
const packageMain = z.object({ main: z.string() });

const candidates = (path: string): string[] => [path, `${path}.ts`, join(path, 'index.ts')];
const firstFile = (path: string): string | undefined =>
  candidates(path).find((candidate) => existsSync(candidate) && statSync(candidate).isFile());

// Файл импорта. Относительный путь — от файла; @merfy/<пакет> — вход пакета из его package.json. Остальные пакеты
// (zod, node:*) — вне счёта: их версии закреплены в package.json, а он в списке.
function resolveImport(from: string, specifier: string): string | undefined {
  if (specifier.startsWith('.')) return firstFile(resolve(dirname(from), specifier));
  if (!specifier.startsWith('@merfy/')) return undefined;
  const packageDir = join(ROOT, 'packages', specifier.slice('@merfy/'.length));
  const { main } = packageMain.parse(JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')));
  return firstFile(join(packageDir, main));
}

function importedFiles(file: string, seen: Set<string>): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  if (!file.endsWith('.ts')) return seen;
  const specifiers = [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((match) => match[1]);
  const targets = specifiers
    .map((specifier) => resolveImport(file, specifier))
    .filter((target) => target !== undefined);
  targets.forEach((target) => importedFiles(target, seen));
  return seen;
}

describe('код платформы', () => {
  it('импорт не учтён: каждый файл, до которого доходят импорты src/, — в списке платформы', () => {
    const entries = readdirSync(PACKAGE_SRC).map((name) => join(PACKAGE_SRC, name));
    const files = entries.reduce((seen, entry) => importedFiles(entry, seen), new Set<string>());
    const outside = [...files]
      .map((file) => relative(ROOT, file))
      .filter((file) => !PLATFORM_RENDER_FILES.some((pattern) => matchesGlob(file, pattern)));
    expect(outside).toEqual([]);
  });

  it('отпечаток платформы — по списку, в формате sha256', async () => {
    await expect(platformRenderHash(ROOT)).resolves.toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
