import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fontsJson from '../../theme-contract/fonts/fonts.json';
import libraryJson from '../../theme-contract/fonts/library.json';
import { fontStack, fontsCss, tokensCssWithFonts } from '../src/fonts/fonts-css';
import { parseFontRegistry } from '../src/fonts/registry';
import type { TokenEdits } from '../src/types';
import { sample } from './support';

// Реестр шрифтов packages/theme-contract/fonts/fonts.json (design.md блока 12) — его пишет pnpm fonts:library.
describe('реестр packages/theme-contract/fonts/fonts.json', () => {
  const registry = parseFontRegistry(fontsJson);

  it('шрифты — ровно список library.json (те же 50, что у конструктора, Т12-1 А), версии — его', () => {
    expect(Object.keys(registry.fonts)).toEqual(Object.keys(libraryJson.fonts).sort());
    Object.entries(libraryJson.fonts).forEach(([key, pin]) => {
      expect([registry.fonts[key].package, registry.fonts[key].version]).toEqual([pin.package, pin.version]);
    });
  });

  it('кириллицы нет у четырёх — по файлам (design.md, факт 18)', () => {
    const without = Object.keys(registry.fonts).filter((key) => !registry.fonts[key].cyrillic);
    expect(without).toEqual(['assistant', 'barlow', 'exo', 'urbanist']);
  });

  it('шрифт темы nova по умолчанию — Onest — в реестре, переменный, с кириллицей', () => {
    expect([registry.fonts.onest.family, registry.fonts.onest.axes, registry.fonts.onest.cyrillic]).toEqual([
      'Onest',
      ['wght'],
      true,
    ]);
  });

  it('путь файла ведёт к его отпечатку: 16 знаков в имени — начало sha256', () => {
    const files = Object.values(registry.fonts).flatMap((font) =>
      Object.values(font.subsets).flatMap((subset) => Object.values(subset.files)),
    );
    const mismatched = files.filter((file) => !file.path.endsWith(`.${file.hash.slice(7, 23)}.woff2`));
    expect(mismatched).toEqual([]);
  });
});

describe('fontsCss по настоящему реестру', () => {
  const registry = parseFontRegistry(fontsJson);
  const onest = registry.fonts.onest;

  it('Onest — части с unicode-range, swap, запасной на Arial; предзагрузка — кириллица', () => {
    const choice = { stack: onest.stack, weight: 400 };
    const result = fontsCss(registry, { body: choice, heading: { ...choice, weight: 600 } });
    expect(result.css).toContain(`src:url(/${onest.subsets.cyrillic.files.wght.path}) format("woff2")`);
    expect(result.css).toContain('@font-face{font-family:"Onest Fallback";src:local("Arial");size-adjust:105.2039%');
    expect(result.files).toHaveLength(Object.keys(onest.subsets).length);
    expect(result.preload).toBe(`/${onest.subsets.cyrillic.files.wght.path}`);
  });
});

// Панель блока 8 пишет в токен «Имя, system-ui, sans-serif» без кавычек (FONT_FALLBACK); CSS токенов печатает стек
// реестра с подогнанным запасным (Т12-3 А). Образец — тема с Manrope.
describe('стеки шрифтов в CSS токенов (формат панели блока 8)', () => {
  const registry = parseFontRegistry(fontsJson);
  const css = (edits: TokenEdits): string => tokensCssWithFonts(registry, sample.dictionary, sample.tokens, edits);
  const fixture = readFileSync(new URL('../fixtures/sample-theme.css', import.meta.url), 'utf8');
  const lineOf = (text: string, name: string): string | undefined =>
    text.split('\n').find((line) => line.trim().startsWith(`--${name}:`));

  it('шрифт темы — стек реестра; заголовки — тот же стек: производный font-heading не сломан', () => {
    const text = css({});
    expect(lineOf(text, 'font-body')).toBe(`  --font-body: ${registry.fonts.manrope.stack};`);
    expect(lineOf(text, 'font-heading')).toBe(`  --font-heading: ${registry.fonts.manrope.stack};`);
  });

  it('правка панели «Lora, system-ui, sans-serif» — стек Lora с «Lora Fallback»', () => {
    const text = css({ root: { 'font-body': 'Lora, system-ui, sans-serif' } });
    expect(lineOf(text, 'font-body')).toBe('  --font-body: "Lora", "Lora Fallback", serif;');
    expect(lineOf(text, 'font-heading')).toBe('  --font-heading: "Lora", "Lora Fallback", serif;');
  });

  it('системный шрифт и шрифт не из реестра — как есть', () => {
    const text = css({ root: { 'font-body': 'system-ui, sans-serif', 'font-heading': 'Papyrus, fantasy' } });
    expect(lineOf(text, 'font-body')).toBe('  --font-body: system-ui, sans-serif;');
    expect(lineOf(text, 'font-heading')).toBe('  --font-heading: Papyrus, fantasy;');
  });

  it('fontStack: имя в кавычках и в другом регистре — тот же стек; остальное CSS токенов не меняется', () => {
    expect(fontStack(registry, '"great vibes", cursive')).toBe(registry.fonts['great-vibes'].stack);
    const withoutFonts = (text: string): string[] => text.split('\n').filter((line) => !line.includes('--font-'));
    expect(withoutFonts(css({}))).toEqual(withoutFonts(fixture));
  });
});
