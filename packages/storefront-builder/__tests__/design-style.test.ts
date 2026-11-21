import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { finishBand, finishStyle, isEmptyPart, mergeParts, missingPaths, buildPart } from '../src/design/design-style';
import {
  PILL,
  categoryOf,
  contrast,
  familyOf,
  hexColor,
  isDark,
  opaqueHex,
  parseColor,
  px,
  radius,
  readableOn,
  sourceOf,
  visibleShadow,
  weight,
  wholePx,
} from '../src/design/design-values';
import { dembrandtStyle, trimmed } from '../src/design/tools/dembrandt';
import { designlangStyle } from '../src/design/tools/designlang';
import { ownStyle, OWN_VERSION } from '../src/design/tools/own';
import { byCount, partFont } from '../src/design/tools/shared';
import { ToolFailed, pinned } from '../src/design/tools/tool';

// Переходники стиля на записанных ответах инструментов (прототип Визи, 21.11): витрина nova на dev, Tilda Store,
// InSales (bestpohod). Ответы — в __tests__/design-fixtures/*.json.gz.
const fixture = (name: string): unknown =>
  JSON.parse(gunzipSync(readFileSync(new URL(`./design-fixtures/${name}.json.gz`, import.meta.url))).toString('utf8'));
const facts = { google: new Set<string>(['onest']) };
const source = { url: 'https://shop.example/', finalUrl: 'https://shop.example/', title: 'Магазин' };

describe('значения CSS', () => {
  it('цвета', () => {
    expect(hexColor('rgb(15, 118, 110)')).toBe('#0f766e');
    expect(hexColor('#ABC')).toBe('#aabbcc');
    expect(hexColor('rgba(0, 0, 0, 0.5)', '#ffffff')).toBe('#808080');
    expect(hexColor('rgba(0, 0, 0, 50%)')).toBe('#808080');
    expect(hexColor('#00000080', 'rgb(255,255,255)')).toBe('#7f7f7f');
    expect(hexColor('rgba(0,0,0,0)')).toBeNull();
    expect(hexColor('transparent')).toBeNull();
    expect(hexColor(42)).toBeNull();
    expect(parseColor('#12345')).toBeNull();
    expect(opaqueHex('rgba(1,2,3,0.4)')).toBeNull();
    expect(opaqueHex('rgb(1,2,3)')).toBe('#010203');
    expect(visibleShadow('rgba(0,0,0,0) 0 0 0, rgba(0,0,0,0.2) 0 2px 4px')).toBe(true);
    expect(visibleShadow('none')).toBe(false);
    expect(visibleShadow('0 1px 2px #0000')).toBe(false);
    expect(visibleShadow('0 1px 2px #000')).toBe(true);
    expect(isDark('#111111')).toBe(true);
    expect(readableOn('#111111')).toBe('#ffffff');
    expect(readableOn('#fafafa')).toBe('#000000');
    expect(Math.round(contrast('#000000', '#ffffff'))).toBe(21);
  });

  it('пиксели, скругления, вес', () => {
    expect(px('16px')).toBe(16);
    expect(px('0px 0px 12px')).toBe(0);
    expect(px('normal')).toBeNull();
    expect(px(Number.NaN)).toBeNull();
    expect(wholePx('-3px')).toBeNull();
    expect(radius('3.35544e+07px')).toBe(PILL);
    expect(radius('6.4px')).toBe(6);
    expect(radius('auto')).toBeNull();
    expect(weight('bold')).toBe(700);
    expect(weight(450)).toBe(500);
    expect(weight('1000')).toBe(900);
    expect(weight(null)).toBeNull();
  });

  it('шрифты: семейство, категория, источник', () => {
    expect(familyOf('"Geograph", system-ui')).toBe('Geograph');
    expect(familyOf('')).toBeNull();
    expect(categoryOf('"Akkurat Mono", monospace')).toBe('mono');
    expect(categoryOf('Self Modern Serif')).toBe('serif');
    expect(categoryOf('"PT Sans", sans-serif')).toBe('sans');
    expect(categoryOf('Lobster, cursive')).toBe('script');
    expect(categoryOf('Georgia')).toBe('serif');
    expect(categoryOf('Unknown')).toBe('sans');
    expect(sourceOf('Arial', new Set())).toBe('system');
    expect(sourceOf('Onest', new Set(['onest']))).toBe('google');
    expect(sourceOf('TildaSans', new Set())).toBe('custom');
    expect(partFont('', 400, null, new Set())).toBeNull();
    expect(byCount(3, 3)).toBe(0.8);
  });
});

describe('переходник own (свой скрипт)', () => {
  it('nova: полоса, шрифты Onest с кириллицей, радиусы, отступы', () => {
    const part = ownStyle(fixture('nova.own'), facts);
    expect(part.bands?.value[0]).toMatchObject({
      bg: '#ffffff',
      fg: '#16181d',
      primary: '#0f766e',
      primaryFg: '#ffffff',
    });
    expect(part['fonts.heading']?.value).toEqual({
      family: 'Onest',
      category: 'sans',
      weight: 600,
      cyrillic: true,
      source: 'google',
    });
    expect(part['radius.button']).toEqual({ value: 12, confidence: 0.8 });
    expect(part['button.look']?.value).toBe('filled');
    expect(part['card.look']?.value).toBe('flat');
    expect(part['spacing.sectionGap']?.value).toBe(112);
    expect(part.typeScale?.value).toContainEqual({ role: 'body', px: 16 });
    expect(part.widthPage?.value).toBe(1250);
    expect(missingPaths(part)).toEqual([]);
    expect(OWN_VERSION).toMatch(/^js-[0-9a-f]{8}$/);
  });

  it('пустой или чужой ответ — пустая часть', () => {
    expect(isEmptyPart(ownStyle(null, facts))).toBe(true);
    expect(isEmptyPart(ownStyle({ bands: [{ background: 'transparent' }] }, facts))).toBe(true);
  });
});

describe('переходник dembrandt', () => {
  it('nova: одна полоса, шрифты, кнопка', () => {
    const part = dembrandtStyle(trimmed(fixture('nova.dembrandt')), facts);
    expect(part.bands?.value).toHaveLength(1);
    expect(part.bands?.value[0]).toMatchObject({ bg: '#ffffff', primary: '#0f766e' });
    expect(part.bands?.confidence).toBe(0.4);
    expect(part['fonts.heading']?.value.family).toBe('Onest');
    expect(part['radius.button']?.value).toBe(12);
    expect(part['button.look']?.value).toBe('filled');
  });

  it('tilda и bestpohod разбираются без исключений', () => {
    for (const name of ['tilda.dembrandt', 'bestpohod.dembrandt']) {
      const part = dembrandtStyle(trimmed(fixture(name)), facts);
      expect(part.bands?.value.length).toBe(1);
      expect(part['fonts.body']).toBeDefined();
    }
  });

  it('логотип и иконки вырезаются; ответ-ошибка — ToolFailed', () => {
    expect(trimmed({ logo: 'x', favicons: [], colors: {} })).toEqual({ colors: {} });
    expect(() => trimmed({ error: { message: 'Page blocked\nstack' } })).toThrow(ToolFailed);
    expect(() => trimmed({ error: 'нет' })).toThrow('dembrandt: нет');
    expect(pinned('dembrandt')).toBe('0.41.0');
    expect(pinned('нет-такого')).toBe('unknown');
  });
});

describe('переходник designlang (стиль)', () => {
  it('nova: полосы по площади, шрифт, вид кнопки', () => {
    const part = designlangStyle(fixture('nova.designlang'), facts);
    const bands = part.bands?.value ?? [];
    expect(bands[0]).toMatchObject({ bg: '#ffffff', fg: '#000000' });
    expect(bands.length).toBeGreaterThanOrEqual(2);
    expect(part['fonts.body']?.value.family).toBe('Onest');
    expect(part['button.look']?.value).toBe('filled');
    expect(pinned('designlang')).toBe('13.4.1');
  });

  it('карточки, поля, ширина, контурные кнопки, тени', () => {
    const part = designlangStyle(
      {
        components: {
          cards: { count: 3, baseStyle: { borderRadius: '16px', boxShadow: '0 2px 4px rgba(0,0,0,.2)' } },
          inputs: { count: 0, baseStyle: { borderRadius: '4px' } },
          buttons: { variants: [{ variant: 'outline', backgroundColor: 'transparent' }] },
        },
        layout: { containerWidths: [{ maxWidth: '1440px' }, { maxWidth: '1200px' }] },
        shadows: { values: [{ raw: '0 1px 2px #000' }] },
        animations: { keyframes: [] },
      },
      facts,
    );
    expect(part['card.look']?.value).toBe('raised');
    expect(part['radius.card']?.value).toBe(16);
    expect(part['radius.input']).toBeUndefined();
    expect(part['button.look']?.value).toBe('outline');
    expect(part.widthPage?.value).toBe(1200);
    expect(part.shadows?.value).toBe(true);
    expect(part.motion?.value).toBe(false);
    const flat = designlangStyle(
      { components: { cards: { count: 2, baseStyle: {} }, buttons: { variants: [{ variant: 'link' }] } } },
      facts,
    );
    expect(flat['card.look']?.value).toBe('flat');
    expect(flat['button.look']?.value).toBe('text');
    expect(designlangStyle({ components: { buttons: { variants: [] } } }, facts)['button.look']).toBeUndefined();
  });

  it('tilda и bestpohod разбираются', () => {
    expect(designlangStyle(fixture('tilda.designlang'), facts)['fonts.body']?.value.family).toBe('TildaSans');
    expect(designlangStyle(fixture('bestpohod.designlang'), facts).bands).toBeDefined();
  });
});

describe('сборка стиля', () => {
  it('слияние: самое уверенное значение, при равенстве — первое', () => {
    const dem = dembrandtStyle(trimmed(fixture('nova.dembrandt')), facts);
    const mine = ownStyle(fixture('nova.own'), facts);
    const merged = mergeParts([dem, mine]);
    expect(merged.bands).toBe(mine.bands);
    expect(merged['fonts.heading']).toBe(mine['fonts.heading']);
    const first = { 'radius.card': { value: 4, confidence: 0.5 } };
    const second = { 'radius.card': { value: 8, confidence: 0.5 }, motion: { value: true, confidence: 0.1 } };
    expect(mergeParts([first, second])).toEqual({
      'radius.card': { value: 4, confidence: 0.5 },
      motion: { value: true, confidence: 0.1 },
    });
  });

  it('итог — полный SiteStyle, недостающее нейтрально и с уверенностью 0', () => {
    const style = finishStyle({}, source);
    expect(style).toMatchObject({
      v: 1,
      title: 'Магазин',
      bands: [
        {
          bg: '#ffffff',
          fg: '#000000',
          heading: '#000000',
          primary: '#000000',
          primaryFg: '#ffffff',
          area: 1,
          top: 0,
          dark: false,
        },
      ],
      fonts: { heading: { family: 'system-ui', weight: 400 }, body: { family: 'system-ui', weight: 400 } },
      radius: { button: null, card: null, input: null, media: null },
      button: { look: 'filled' },
      card: { look: 'flat', align: 'left' },
      shadows: false,
      motion: false,
    });
    expect(style.confidence['radius.button']).toBe(0);
    expect(Object.keys(style.confidence)).not.toContain('title');
  });

  it('шрифт заголовков, которого нет, — как текста; вес по умолчанию', () => {
    const style = finishStyle(
      {
        'fonts.body': {
          value: { family: 'Inter', category: 'sans', weight: null, cyrillic: true, source: 'google' },
          confidence: 0.8,
        },
      },
      source,
    );
    expect(style.fonts.heading).toEqual({
      family: 'Inter',
      category: 'sans',
      weight: 700,
      cyrillic: true,
      source: 'google',
    });
    expect(style.fonts.body.weight).toBe(400);
  });

  it('полоса: тёмная, вторая кнопка, цвета строчными, доля в 0..1', () => {
    expect(finishBand({ bg: '#111111', secondary: '#EEEEEE', area: 1.4, top: -3.6 })).toEqual({
      bg: '#111111',
      fg: '#ffffff',
      heading: '#ffffff',
      primary: '#ffffff',
      primaryFg: '#000000',
      secondary: '#eeeeee',
      secondaryFg: '#000000',
      area: 1,
      top: 0,
      dark: true,
    });
  });

  it('таблица: упавшее поле не снято, уверенность-функция упала — 0', () => {
    const part = buildPart<{ x: number }>(
      { x: 4 },
      {
        'radius.card': {
          take: (raw) => raw.x,
          confidence: () => {
            throw new Error('нет');
          },
        },
        'radius.input': {
          take: () => {
            throw new Error('нет');
          },
          confidence: 1,
        },
        typeScale: { take: () => [], confidence: 1 },
      },
    );
    expect(part).toEqual({ 'radius.card': { value: 4, confidence: 0 } });
  });
});
