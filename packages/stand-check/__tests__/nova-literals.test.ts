import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packagePath } from '../src/paths';

// Сторож литералов темы nova (design.md блока 9: Т9-6 А, «решил сам» 7). Вид темы — только значения словаря: в коде
// темы нет цвета, шрифта или размера, записанного прямо. Исключений нет: правила одни для всех файлов темы. Отступы
// каркаса стенда шкалой Tailwind (p-6, gap-4) — не литералы: у словаря нет токенов этих отступов (блок 2). Пакет
// шрифта Fontsource — литерал всегда: шрифт темы приходит из библиотеки платформы, fontsCss (блок 12).
const NOVA_SRC = packagePath('../../themes/nova/src');

// Правило: что ищем; only — только в файлах с таким концом имени.
type LiteralRule = { id: string; pattern: RegExp; only?: string };

const RULES: readonly LiteralRule[] = [
  { id: 'hex', pattern: /#[0-9a-f]{3,8}\b/gi },
  { id: 'color-function', pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/gi },
  { id: 'font-family', pattern: /font-family\s*:/gi },
  { id: 'font-class', pattern: /\bfont-(?:sans|serif|mono|\[)/g },
  { id: 'font-package', pattern: /@fontsource(?:-variable)?\//g },
  { id: 'arbitrary-length', pattern: /\b[a-z][a-z0-9-]*-\[[^\]\s]*?\d(?:px|rem|em|vh|vw|%)[^\]\s]*\]/g },
  { id: 'css-length', pattern: /\b\d+(?:\.\d+)?(?:px|rem|em)\b/g, only: '.css' },
  {
    id: 'tailwind-palette',
    pattern:
      /\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|divide|placeholder|caret|accent|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)\b/g,
  },
  {
    id: 'tailwind-black-white',
    pattern:
      /\b(?:bg|text|border|ring|outline|fill|stroke|decoration|divide|placeholder|caret|accent)-(?:black|white)\b/g,
  },
];

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

const appliesTo = (rule: LiteralRule, file: string): boolean => rule.only === undefined || file.endsWith(rule.only);

// Литералы одного файла: «правило файл:строка найденное». Чистая функция — её проверяют образцы ниже.
const findLiterals = (file: string, text: string): string[] =>
  RULES.filter((rule) => appliesTo(rule, file)).flatMap((rule) =>
    [...text.matchAll(rule.pattern)].map((match) => `${rule.id} ${file}:${lineOf(text, match.index)} ${match[0]}`),
  );

// Все файлы src темы: путь от src и текст.
const novaSources = (): { file: string; text: string }[] =>
  readdirSync(NOVA_SRC, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .map((full) => ({ file: path.relative(NOVA_SRC, full), text: readFileSync(full, 'utf8') }));

// Образцы правил: что сторож находит и что пропускает.
const SAMPLES: { file: string; text: string; found: string[] }[] = [
  { file: 'shop/Card.astro', text: '<p style="color: #ff0000">', found: ['hex'] },
  { file: 'shop/Card.astro', text: '<a href="#cart">Корзина</a>', found: [] },
  { file: 'shop/Card.astro', text: '<p style="color: rgb(0 0 0)">', found: ['color-function'] },
  { file: 'shop/card.css', text: 'p { font-family: Inter; }', found: ['font-family'] },
  { file: 'shop/Card.astro', text: '<p class="font-serif">', found: ['font-class'] },
  { file: 'shop/Card.astro', text: '<p class="font-heading weight-heading">', found: [] },
  { file: 'shop/ShopHead.astro', text: 'import "@fontsource/inter/400.css";', found: ['font-package'] },
  { file: 'shop/fonts.ts', text: 'import "@fontsource/inter/400.css";', found: ['font-package'] },
  { file: 'shop/fonts.ts', text: 'import "@fontsource/onest/400.css";', found: ['font-package'] },
  {
    file: 'shop/Card.astro',
    text: '<p class="text-[14px] mt-[2rem]">',
    found: ['arbitrary-length', 'arbitrary-length'],
  },
  { file: 'shop/Card.astro', text: '<dl class="grid-cols-[max-content_1fr]">', found: [] },
  { file: 'shop/card.css', text: '.card { margin: 12px; }', found: ['css-length'] },
  { file: 'shop/Card.astro', text: '<p class="p-6 gap-4">12 px</p>', found: [] },
  {
    file: 'shop/Card.astro',
    text: '<p class="bg-red-500 text-white">',
    found: ['tailwind-palette', 'tailwind-black-white'],
  },
  { file: 'shop/Card.astro', text: '<p class="bg-primary text-primary-foreground">', found: [] },
];

describe('сторож литералов темы nova', () => {
  it.each(SAMPLES)('образец $file: $text', ({ file, text, found }) => {
    expect(findLiterals(file, text).map((line) => line.split(' ')[0])).toEqual(found);
  });

  it('в коде темы литералов нет: цвет, шрифт и размер — только из токенов', () => {
    expect(novaSources().flatMap(({ file, text }) => findLiterals(file, text))).toEqual([]);
  });
});
