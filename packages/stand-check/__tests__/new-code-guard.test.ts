import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packagePath } from '../src/paths';

// Сторож нового кода (design.md блока 12, «решил сам» 2): новые темы, каркас и данные платформы не опираются на то, что
// уйдёт с миграцией нынешних тем. Не импортируют React-пакет витрины packages/storefront и старые шаблоны
// templates/astro, не ходят за шрифтами к Google и не зовут сервер островов. С части 15е — адреса сервисов прода и
// глобалы `__MERFY_*__` (И4, И9), разрешённые места — `ALLOWED`. Сам старый код в этапе не трогаем
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
  // Часть 15е: код и примеры документации SDK (тексты guide/ и template/ — документация, адрес подставляет сборщик).
  'packages/sdk-docs/src',
  'packages/sdk-docs/scripts',
  'packages/sdk-docs/examples',
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
  // Часть 15е (И4, И9): адреса сервисов прода и глобалы __MERFY_*__ — только в местах из ALLOWED.
  { id: 'prod-address', pattern: /\b(?:gateway|api|admin|customize|analytics|minio)\.merfy\.ru\b/g },
  { id: 'merfy-global', pattern: /__MERFY_\w*/g },
];

// Разрешённые места (часть 15е): правило, файл от корня site-gen, причина. Место без нарушения — красный тест ниже.
const STAND_GLOBALS = ['browser/page-facts.ts', 'passport/schema.ts', 'report/report.ts', 'run/sabotage.ts', 'scenario/checks.ts'];
const ALLOWED: readonly { rule: string; file: string; why: string }[] = [
  { rule: 'merfy-global', file: 'themes/nova/src/shop/CheckoutPage.astro', why: 'Р10а-17: адрес и магазин для theme-base (И10)' },
  {
    rule: 'merfy-global',
    file: 'packages/storefront-shell/src/core/parts/checkout.ts',
    why: 'Р10а-17, факт 33: настройки оформления для theme-base',
  },
  ...STAND_GLOBALS.map((file) => ({
    rule: 'merfy-global',
    file: `packages/stand-check/src/${file}`,
    why: 'паспорт стенда ищет глобалы — проверка И9',
  })),
  { rule: 'prod-address', file: 'packages/sdk-docs/src/meta.ts', why: 'Р14-6: адрес документации, сборщик подставляет свой' },
];

const isAllowed = (violation: string): boolean =>
  ALLOWED.some((place) => violation.startsWith(`${place.rule} ${place.file}:`));

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
  {
    text: 'window.__MERFY_CONFIG__.apiUrl = config.apiUrl || "https://gateway.merfy.ru/api";',
    found: ['prod-address', 'merfy-global'],
  },
  { text: "fetch('https://api.merfy.ru/store')", found: ['prod-address'] },
  { text: "const api = 'https://gateway.dev.merfy.ru/api';", found: [] },
  { text: "const media = 'https://minio.dev.merfy.ru/storefront';", found: [] },
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
    expect(violations.filter((violation) => !isAllowed(violation))).toEqual([]);
  });

  it('у каждого разрешённого места есть нарушение — устаревших исключений нет (часть 15е)', () => {
    const violations = NEW_CODE.flatMap(sourcesOf).flatMap(({ file, text }) => findViolations(file, text));
    const stale = ALLOWED.filter((place) => !violations.some((line) => line.startsWith(`${place.rule} ${place.file}:`)));
    expect(stale.map((place) => `${place.rule} ${place.file}`)).toEqual([]);
  });
});
