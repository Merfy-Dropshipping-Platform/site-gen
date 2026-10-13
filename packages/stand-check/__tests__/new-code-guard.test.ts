import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packagePath } from '../src/paths';

// Сторож нового кода (design.md блока 12, «решил сам» 2): новые темы, каркас и данные платформы не опираются на то, что
// уйдёт с миграцией нынешних тем. Не импортируют React-пакет витрины packages/storefront и старые шаблоны
// templates/astro, не ходят за шрифтами к Google и не зовут сервер островов. Сам старый код в этапе не трогаем
// (У12-1…У12-3 — В). Устроен как сторож литералов nova: правила — таблицей, образцы — рядом.

// Папки нового кода от корня site-gen. Тесты не смотрим: в них образцы нарушений.
const NEW_CODE = [
  'themes/nova/src',
  'packages/theme-nova',
  'packages/theme-contract/panel',
  'packages/theme-contract/fonts',
  'packages/tokens/src',
  'packages/tokens/scripts',
  'packages/storefront-config/src',
  'packages/storefront-config/scripts',
  'packages/storefront-build/src',
  'packages/storefront-build/scripts',
  'packages/storefront-storage/src',
  'packages/storefront-storage/scripts',
  'packages/storefront-builder/src',
  'packages/storefront-builder/scripts',
  'packages/storefront-shell/src',
  'packages/storefront-shell/sections',
  'packages/storefront-shell/scripts',
  'packages/storefront-sections/src',
  'packages/storefront-sections/scripts',
  'packages/stand-check/src',
  'packages/stand-check/scripts',
];
const SOURCE_FILE = /\.(?:ts|tsx|mts|mjs|js|astro|json|css|html)$/;
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'dist-renderer', 'generated', 'coverage', '.astro']);
const ROOT = packagePath('../..');

type GuardRule = { id: string; pattern: RegExp };

const RULES: readonly GuardRule[] = [
  // Импорт React-пакета витрины: по имени пакета или путём до папки packages/storefront (не storefront-build и т. п.).
  {
    id: 'storefront-package',
    pattern: /from\s+["'](?:@merfy\/storefront|(?:\.\.\/)+(?:packages\/)?storefront)(?:\/[^"']*)?["']/g,
  },
  { id: 'old-templates', pattern: /templates\/astro/g },
  { id: 'google-fonts', pattern: /fonts\.(?:googleapis|gstatic)\.com/g },
  { id: 'islands', pattern: /ISLANDS_SERVER_URL|islands\.(?:dev\.)?merfy\.ru|<merfy-island|\/islands\/batch/g },
];

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

// Нарушения одного файла: «правило файл:строка найденное». Чистая функция — её проверяют образцы ниже.
const findViolations = (file: string, text: string): string[] =>
  RULES.flatMap((rule) =>
    [...text.matchAll(rule.pattern)].map((match) => `${rule.id} ${file}:${lineOf(text, match.index)} ${match[0]}`),
  );

const isSkipped = (full: string): boolean => full.split(path.sep).some((part) => SKIPPED_DIRS.has(part));

// Файлы папки нового кода: путь от корня site-gen и текст.
function sourcesOf(dir: string): { file: string; text: string }[] {
  const entries = readdirSync(path.join(ROOT, dir), { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && SOURCE_FILE.test(entry.name));
  const paths = files.map((entry) => path.join(entry.parentPath, entry.name)).filter((full) => !isSkipped(full));
  return paths.map((full) => ({ file: path.relative(ROOT, full), text: readFileSync(full, 'utf8') }));
}

const SAMPLES: { text: string; found: string[] }[] = [
  { text: "import { useCart } from '@merfy/storefront/cart';", found: ['storefront-package'] },
  { text: "import { Wishlist } from '../../../packages/storefront/wishlist';", found: ['storefront-package'] },
  { text: "import { buildKey } from '@merfy/storefront-build';", found: [] },
  { text: "import { tokensCss } from '../../storefront-build/src/key';", found: [] },
  { text: "const theme = join(ROOT, 'templates/astro/rose');", found: ['old-templates'] },
  { text: '<link href="https://fonts.googleapis.com/css2?family=Inter">', found: ['google-fonts'] },
  { text: 'src: url(https://fonts.gstatic.com/s/inter.woff2)', found: ['google-fonts'] },
  { text: "const url = process.env.ISLANDS_SERVER_URL ?? 'https://islands.merfy.ru';", found: ['islands', 'islands'] },
  { text: '<merfy-island data-block="ProductGrid"></merfy-island>', found: ['islands'] },
  { text: '// packages/storefront/testing/mock-data — откуда цены стенда', found: [] },
];

describe('сторож нового кода (блок 12)', () => {
  it.each(SAMPLES)('образец: $text', ({ text, found }) => {
    expect(findViolations('sample.ts', text).map((line) => line.split(' ')[0])).toEqual(found);
  });

  it('каждая папка нового кода на месте', () => {
    expect(NEW_CODE.filter((dir) => !existsSync(path.join(ROOT, dir)))).toEqual([]);
  });

  it('в новом коде нет ни одного нарушения', () => {
    const violations = NEW_CODE.flatMap(sourcesOf).flatMap(({ file, text }) => findViolations(file, text));
    expect(violations).toEqual([]);
  });
});
