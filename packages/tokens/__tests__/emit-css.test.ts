import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import themeWithExtension from '../fixtures/theme-with-extension/theme.json';
import { emitCss, tokensCss } from '../src/emit-css';
import { resolveTokens } from '../src/resolve';
import { parseTheme } from '../src/values';
import { sample } from './support';

const fixture = (path: string): string => readFileSync(new URL(`../fixtures/${path}`, import.meta.url), 'utf8');
const count = (text: string, part: string): number => text.split(part).length - 1;
const blockOf = (css: string, selector: string): string => css.slice(css.indexOf(`${selector} {`)).split('\n}')[0];

describe('CSS образца', () => {
  const css = tokensCss(sample.dictionary, sample.tokens, {});

  it('совпадает с эталоном fixtures/sample-theme.css', () => {
    expect(css).toBe(fixture('sample-theme.css'));
  });

  it('наведение кнопки своё в каждой схеме, тень попапа — в каждой схеме', () => {
    expect(blockOf(css, ':root, .color-scheme-1')).toContain('--primary-hover: #2e2e2e;');
    expect(blockOf(css, '.color-scheme-2')).toContain('--primary-hover: #e0e0e0;');
    expect(count(css, '--shadow-popover: 0 0.5rem 1.5rem 0 #0000001f;')).toBe(2);
    expect(css).toContain('--shadow-card: none;');
  });

  it('emitCss от готового расчёта — то же самое', () => {
    expect(emitCss(sample.dictionary, resolveTokens(sample.dictionary, sample.tokens, {}))).toBe(css);
  });

  it('карточка на схеме 2 — свой блок .scheme-card и покраска', () => {
    const withCard = tokensCss(sample.dictionary, sample.tokens, { root: { 'scheme-card': 'scheme-2' } });
    expect(withCard).toBe(fixture('sample-theme-scheme-card.css'));
    expect(blockOf(withCard, '.scheme-card')).toContain('--background: #111111;');
    expect(withCard).toContain(':root, .color-scheme-1, .color-scheme-2, .scheme-card {');
  });

  it('межбуквенное — в em, рамка — в px, ноль — без единиц', () => {
    const edited = tokensCss(sample.dictionary, sample.tokens, {
      root: { 'tracking-heading': -0.01, 'border-width-card': 2 },
    });
    expect(edited).toContain('--tracking-heading: -0.01em;');
    expect(edited).toContain('--border-width-card: 2px;');
    expect(edited).toContain('--tracking-body: 0;');
  });

  it('непроверенное значение не того вида печатается как есть', () => {
    const resolved = { root: { 'text-xs': 12, 'radius-button': 'auto' }, schemes: {} };
    expect(emitCss(sample.dictionary, resolved)).toContain('--text-xs: 12;\n  --radius-button: auto;');
  });
});

describe('CSS темы с расширением', () => {
  const theme = parseTheme(themeWithExtension.tokens);
  const css = tokensCss(theme.dictionary, theme.tokens, {});

  it('совпадает с эталоном fixtures/theme-with-extension/theme.css', () => {
    expect(css).toBe(fixture('theme-with-extension/theme.css'));
  });

  it('свои токены: капсула, золото, надпись на золоте и свечение в каждой схеме', () => {
    expect(css).toContain('--radius-theme-pill: 62.4375rem;');
    expect(count(css, '--theme-gold-foreground: #000000;')).toBe(2);
    expect(blockOf(css, ':root, .color-scheme-1')).toContain('--shadow-theme-glow: 0 0 1.5rem 0 #c9a22759;');
    expect(blockOf(css, '.color-scheme-2')).toContain('--shadow-theme-glow: 0 0 1.5rem 0 #e0b93a59;');
  });
});
