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
// сторож на него не смотрит.
const NAMES = /^(?:(?:merfy|shop|platform):.+|hero|cart-badge|heading-size|button-label|button-link|faq|open-first)$/;
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
    expect(SOURCES.flatMap((source) => filesOf(join(PACKAGES, source))).flatMap(namedLiterals)).toEqual([]);
  });

  it('сторож видит такую строку', () => {
    expect(NAMES.test('shop:hero') && NAMES.test('heading-size') && !NAMES.test('heading')).toBe(true);
  });
});
