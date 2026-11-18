import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// В коде платформы нет имён секций и их полей (владелец, 18.10: «чтобы левые секции и правые там не было хардкода
// секций. Точнее, параметров секций»): имена и поля приходят из section.json через реестр.
const PACKAGES = fileURLToPath(new URL('../../', import.meta.url));
const SOURCES = [
  'storefront-sections/src',
  'storefront-sections/scripts',
  'storefront-build/src',
  'storefront-builder/src',
];
// analytics — ещё и поле аналитики страницы (storefront-build/src/head.ts: ConfigAnalytics), не только имя секции:
// сторож на него не смотрит. Полное имя секции — «префикс:имя» с одним двоеточием (SECTION_NAME во входах сборки,
// storefront-build/src/inputs.ts); имя события ядра (merfy:section:mount, 18.11 — замер Web Vitals снимка) — не имя
// секции, у него двоеточий два.
const NAMES =
  /^(?:(?:merfy|shop|platform):[a-z0-9]+(?:-[a-z0-9]+)*|hero|cart-badge|heading-size|button-label|button-link|faq|open-first|logo-position|menu-type|text-size|newsletter|error-404)$/;
// Сервис sites (часть 4): страницы магазина и меню новой темы — тоже без имён секций; тесты (*.spec.ts) — нет.
const SITES_SOURCES = ['../src/pages'];
const LITERAL = /'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`/g;

const filesOf = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:ts|mjs|js)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));

const namedLiterals = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(LITERAL)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? '')
    .filter((literal) => NAMES.test(literal))
    .map((literal) => `${relative(PACKAGES, file)}: ${literal}`);

describe('в коде платформы нет имён секций и их полей', () => {
  it('строки с именами секций и полей «Первого экрана» есть только в section.json', () => {
    const files = [...SOURCES, ...SITES_SOURCES].flatMap((source) => filesOf(join(PACKAGES, source)));
    expect(files.filter((file) => !file.endsWith('.spec.ts')).flatMap(namedLiterals)).toEqual([]);
  });

  it('сторож видит такую строку', () => {
    expect(NAMES.test('shop:hero') && NAMES.test('heading-size') && !NAMES.test('heading')).toBe(true);
    expect(NAMES.test('platform:cart-badge') && NAMES.test('merfy:hero')).toBe(true);
  });

  it('имя события ядра — не имя секции', () => {
    expect(NAMES.test('merfy:section:mount') || NAMES.test('merfy:cart:add')).toBe(false);
  });
});
