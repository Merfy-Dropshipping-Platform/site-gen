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
const MERFY_SCOPE = '@merfy/';
const packageName = z.object({ name: z.string().optional() });
const packageEntries = z.object({
  main: z.string().optional(),
  exports: z.record(z.string(), z.string()).optional(),
});

const candidates = (path: string): string[] => [path, `${path}.ts`, join(path, 'index.ts')];
const firstFile = (path: string): string | undefined =>
  candidates(path).find((candidate) => existsSync(candidate) && statSync(candidate).isFile());

const packageJsonOf = (dir: string): unknown => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

// Пакеты репозитория по имени из package.json: каталог не всегда совпадает с именем (@merfy/shell — в
// packages/storefront-shell).
const PACKAGE_DIRS = new Map(
  readdirSync(join(ROOT, 'packages'))
    .map((entry) => join(ROOT, 'packages', entry))
    .filter((dir) => existsSync(join(dir, 'package.json')))
    .flatMap((dir): [string, string][] => {
      const { name } = packageName.parse(packageJsonOf(dir));
      return name === undefined ? [] : [[name, dir]];
    }),
);

// Имя пакета и подпуть в виде ключа exports: @merfy/shell/behaviors/catalog → @merfy/shell и ./behaviors/catalog.
function splitSpecifier(specifier: string): { name: string; subpath: string } {
  const parts = specifier.split('/');
  const rest = parts.slice(2);
  return { name: parts.slice(0, 2).join('/'), subpath: rest.length === 0 ? '.' : `./${rest.join('/')}` };
}

// Файл импорта. Относительный путь — от файла; @merfy/<пакет>[/<подпуть>] — пакет репозитория по name, файл — по
// exports его package.json (корень без exports — main). Пакета или входа нет — ошибка: иначе импорт ушёл бы из счёта
// молча. Остальные пакеты (zod, node:*) — вне счёта: их версии закреплены в package.json, а он в списке.
function resolveImport(from: string, specifier: string): string | undefined {
  if (specifier.startsWith('.')) return firstFile(resolve(dirname(from), specifier));
  if (!specifier.startsWith(MERFY_SCOPE)) return undefined;
  const { name, subpath } = splitSpecifier(specifier);
  const dir = PACKAGE_DIRS.get(name);
  if (dir === undefined) throw new Error(`пакета ${name} нет в packages/`);
  const { main, exports } = packageEntries.parse(packageJsonOf(dir));
  const target = exports?.[subpath] ?? (subpath === '.' ? main : undefined);
  if (target === undefined) throw new Error(`у ${name} нет входа ${subpath} в exports`);
  return firstFile(join(dir, target));
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

// Резолвер сторожа (блок 6 «Секций и SDK», часть 6б): пакет — по name из package.json (каталог может называться
// иначе), подпуть — по exports. Пакета или входа нет — ошибка: импорт не уходит из счёта молча.
describe('резолвер импортов сторожа', () => {
  const FROM = join(PACKAGE_SRC, 'code.ts');
  const at = (path: string): string => join(ROOT, path);

  it('@merfy/<пакет> — по name из package.json', () => {
    expect(resolveImport(FROM, '@merfy/tokens')).toBe(at('packages/tokens/src/index.ts'));
    expect(resolveImport(FROM, '@merfy/shell')).toBe(at('packages/storefront-shell/src/core/index.ts'));
  });

  it('подпуть — по exports пакета', () => {
    expect(resolveImport(FROM, '@merfy/shell/core')).toBe(at('packages/storefront-shell/src/core/index.ts'));
    expect(resolveImport(FROM, '@merfy/shell/behaviors/catalog')).toBe(
      at('packages/storefront-shell/src/core/behaviors/catalog.ts'),
    );
    expect(resolveImport(FROM, '@merfy/shell/behaviors/motion-css')).toBe(
      at('packages/storefront-shell/src/core/behaviors/motion-css.ts'),
    );
    expect(resolveImport(FROM, '@merfy/storefront-config/read')).toBe(at('packages/storefront-config/src/read.ts'));
  });

  it('входа или пакета нет — ошибка с именем', () => {
    expect(() => resolveImport(FROM, '@merfy/shell/no-such-entry')).toThrow('у @merfy/shell нет входа ./no-such-entry');
    expect(() => resolveImport(FROM, '@merfy/no-such-package')).toThrow('пакета @merfy/no-such-package нет');
  });

  it('чужие пакеты и node:* — вне счёта', () => {
    expect(resolveImport(FROM, 'zod')).toBeUndefined();
    expect(resolveImport(FROM, 'node:fs')).toBeUndefined();
  });
});
