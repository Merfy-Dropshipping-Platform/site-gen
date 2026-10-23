import { describe, expect, it } from 'vitest';
import { platformDictionary } from '../src/dictionary';
import { tokenDeclarations } from '../src/emit-css';
import { SECTION_TOKENS_MAX, readSectionTokens, sectionTailwindTheme, sectionTokensCss } from '../src/section-tokens';
import { parseTokenEdits, readSectionEdits } from '../src/values';
import { sample } from './support';

// Свои токены секции (блок 4 «Секций и SDK», design.md 4.4, Р4-9…Р4-11).
const SWATCH = {
  'custom-swatch': { kind: 'color', about: 'Обводка образца ткани', derive: { rule: 'alias', from: 'primary' } },
  'radius-custom-swatch': { kind: 'radius', about: 'Скругление образца ткани', default: 999 },
};
const read = (raw: unknown) => readSectionTokens(platformDictionary, raw);
const swatch = read(SWATCH).tokens;
const SECTIONS = [
  { section: 'shop:scarf-match', tokens: swatch },
  { section: 'shop:hero', tokens: {} },
];
const indented = (lines: string[]) => lines.map((line) => `  ${line}`);

describe('readSectionTokens', () => {
  it('метка custom, цвет — alias от базового, скругление — default', () => {
    const reading = read(SWATCH);
    expect(reading.problems).toEqual([]);
    expect(Object.keys(reading.tokens)).toEqual(['custom-swatch', 'radius-custom-swatch']);
  });

  it.each([
    ['без метки custom', { gold: { kind: 'color', about: 'Золото', default: '#c9a227' } }, ['tokens.gold', 'custom-']],
    [
      'alias от своего токена темы',
      { 'custom-x': { kind: 'color', about: 'Цвет x', derive: { rule: 'alias', from: 'theme-gold' } } },
      ['tokens.custom-x', 'theme-gold'],
    ],
    ['вид font', { 'font-custom-x': { kind: 'font', about: 'Шрифт x', default: 'serif' } }, ['tokens.font-custom-x', 'font']],
    [
      'правило mix',
      { 'custom-x': { kind: 'color', about: 'Цвет x', derive: { rule: 'mix', from: ['primary', 'background'], weight: 0.5 } } },
      ['tokens.custom-x', 'alias'],
    ],
    [
      'тень без alias',
      { 'shadow-custom-x': { kind: 'shadow', about: 'Тень x', default: { x: 0, y: 1, blur: 2, spread: 0, opacity: 0.2 } } },
      ['tokens.shadow-custom-x', 'alias'],
    ],
    ['не объект', [], ['tokens']],
  ])('%s — проблема с путём', (_title, raw, parts) => {
    const reading = read(raw);
    expect(reading.problems.length).toBeGreaterThan(0);
    for (const part of parts) expect(reading.problems.join('\n')).toContain(part);
  });

  it(`не больше ${SECTION_TOKENS_MAX} токенов`, () => {
    const many = Object.fromEntries(
      Array.from({ length: SECTION_TOKENS_MAX + 1 }, (_, i) => [
        `custom-c${i}`,
        { kind: 'color', about: `Цвет ${i}`, derive: { rule: 'alias', from: 'primary' } },
      ]),
    );
    expect(read(many).problems.join('\n')).toContain(String(SECTION_TOKENS_MAX));
  });
});

describe('sectionTailwindTheme', () => {
  it('классы bg-custom-swatch и rounded-custom-swatch — строками @theme', () => {
    expect(sectionTailwindTheme(swatch)).toBe(
      [
        '@theme inline reference {',
        '  --color-custom-swatch: var(--custom-swatch);',
        '  --radius-custom-swatch: var(--radius-custom-swatch);',
        '}',
      ].join('\n'),
    );
  });

  it('насыщенность — своей утилитой; токенов нет — пусто', () => {
    const bold = read({ 'weight-custom-bold': { kind: 'weight', about: 'Жирность подписи', default: 700 } }).tokens;
    expect(sectionTailwindTheme(bold)).toContain('@utility weight-custom-bold { font-weight: var(--weight-custom-bold); }');
    expect(sectionTailwindTheme({})).toBe('');
  });
});

describe('sectionTokensCss', () => {
  it('alias — ссылка на токен словаря, default — значение по виду; секция без токенов — без правила', () => {
    expect(sectionTokensCss(SECTIONS, {})).toBe(
      [
        '@layer base {',
        'merfy-section[data-section="shop:scarf-match"] {',
        '  --custom-swatch: var(--primary);',
        ...indented(tokenDeclarations('radius', 'radius-custom-swatch', 999)),
        '}',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('правка мерчанта — вместо умолчания', () => {
    const css = sectionTokensCss(SECTIONS, { 'shop:scarf-match': { 'custom-swatch': '#c9a227' } });
    expect(css).toContain('  --custom-swatch: #c9a227;');
    expect(css).not.toContain('var(--primary)');
  });

  it('alias размера текста — со строкой высоты строки', () => {
    const big = read({ 'text-custom-big': { kind: 'text', about: 'Крупная цена', derive: { rule: 'alias', from: 'text-5xl' } } });
    const css = sectionTokensCss([{ section: 'shop:price', tokens: big.tokens }], {});
    expect(css).toContain('  --text-custom-big: var(--text-5xl);');
    expect(css).toContain('  --text-custom-big--line-height: var(--text-5xl--line-height);');
  });

  it('имя секции не по форме — правила нет; токенов ни у кого — пусто', () => {
    expect(sectionTokensCss([{ section: 'x"]{}body{', tokens: swatch }], {})).toBe('');
    expect(sectionTokensCss([{ section: 'shop:hero', tokens: {} }], {})).toBe('');
  });
});

describe('правки токенов секций', () => {
  it('по виду токена; чужие секции и токены — мимо; неверное значение — в problems', () => {
    const reading = readSectionEdits(SECTIONS, {
      sections: {
        'shop:scarf-match': { 'custom-swatch': 'red;} body{color:red', 'radius-custom-swatch': 12, 'custom-nope': '#000000' },
        'shop:gone': { 'custom-swatch': '#000000' },
      },
    });
    expect(reading.edits).toEqual({ 'shop:scarf-match': { 'radius-custom-swatch': 12 } });
    expect(reading.problems).toHaveLength(1);
    expect(reading.problems[0]).toContain('sections.shop:scarf-match.custom-swatch');
  });

  it('нет ключа sections — правок нет', () => {
    expect(readSectionEdits(SECTIONS, { root: {} })).toEqual({ edits: {}, problems: [] });
  });

  it('правки темы с ключом sections читаются, sections в них не попадает', () => {
    const edits = parseTokenEdits(sample, { sections: { 'shop:scarf-match': { 'custom-swatch': '#000000' } } });
    expect(edits).not.toHaveProperty('sections');
  });
});
