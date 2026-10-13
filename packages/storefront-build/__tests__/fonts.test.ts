import { describe, expect, it } from 'vitest';
import standInputsJson from '../fixtures/stand-inputs.json';
import { buildStorefront, type ThemeBuild } from '../src/build';
import { hashOf } from '../src/canonical';
import { FONT_LIBRARY_HASH, FONT_REGISTRY } from '../src/fonts';
import { pageLocals, shopFonts } from '../src/head';
import { routeOf } from '../src/routes';
import { previewTokens } from '../src/stand';
import { changedInputs, standInputs } from './support';
import { fakeRender, novaTokens } from './support-theme';

// Шрифты магазина новой темы (design.md блока 12): CSS шрифтов и предзагрузка в данных страницы, файлы шрифтов — в
// манифесте без байтов, тот же CSS — в превью. Шрифт nova — Onest (блок 9), он есть в реестре. Правки мерчанта — в
// формате панели блока 8: «Lora, system-ui, sans-serif» (FONT_FALLBACK), в CSS токенов — стек реестра.
const HOME = routeOf('/');
const onest = FONT_REGISTRY.fonts.onest;
const lora = FONT_REGISTRY.fonts.lora;
const PANEL_LORA = 'Lora, system-ui, sans-serif';
const withFont = (stack: string) =>
  changedInputs((inputs) => (inputs.revision.tokens = { root: { 'font-body': stack } }));
const fontLine = (css: string, name: string): string | undefined =>
  css.split('\n').find((line) => line.trim().startsWith(`--${name}:`));

describe('шрифты в данных страницы', () => {
  const locals = pageLocals(standInputs, HOME, novaTokens);

  it('CSS шрифтов: части Onest с unicode-range и swap, подогнанный запасной', () => {
    expect(locals.head.fontsCss).toContain(`src:url(/${onest.subsets.cyrillic.files.wght.path}) format("woff2")`);
    expect(locals.head.fontsCss).toContain('font-display:swap');
    expect(locals.head.fontsCss).toContain('@font-face{font-family:"Onest Fallback";src:local("Arial")');
  });

  it('предзагрузка — один файл: кириллица шрифта текста', () => {
    expect(locals.head.fontPreload).toBe(`/${onest.subsets.cyrillic.files.wght.path}`);
  });

  it('nova по умолчанию: в CSS токенов — стек реестра «"Onest", "Onest Fallback", …» у текста и заголовков', () => {
    expect(fontLine(locals.head.tokensCss, 'font-body')).toBe(`  --font-body: ${onest.stack};`);
    expect(fontLine(locals.head.tokensCss, 'font-heading')).toBe(`  --font-heading: ${onest.stack};`);
  });

  it('мерчант выбрал Lora в панели — её файлы, предзагрузка и стек с «Lora Fallback»; заголовки — тот же шрифт', () => {
    const head = pageLocals(withFont(PANEL_LORA), HOME, novaTokens).head;
    expect(head.fontsCss).toContain('font-family:"Lora"');
    expect(head.fontsCss).toContain('font-family:"Lora Fallback"');
    expect(head.fontsCss).not.toContain('font-family:"Onest"');
    expect(head.fontPreload).toBe(`/${lora.subsets.cyrillic.files.wght.path}`);
    expect(fontLine(head.tokensCss, 'font-body')).toBe('  --font-body: "Lora", "Lora Fallback", serif;');
    expect(fontLine(head.tokensCss, 'font-heading')).toBe('  --font-heading: "Lora", "Lora Fallback", serif;');
  });

  it('системный шрифт — ни CSS шрифтов, ни предзагрузки; стек в CSS токенов как есть', () => {
    const head = pageLocals(withFont('system-ui, sans-serif'), HOME, novaTokens).head;
    expect([head.fontsCss, head.fontPreload]).toEqual(['', '']);
    expect(fontLine(head.tokensCss, 'font-body')).toBe('  --font-body: system-ui, sans-serif;');
  });
});

describe('шрифты в сборке', () => {
  const theme: ThemeBuild = { tokens: novaTokens, render: fakeRender, clientFiles: [] };

  it('файлы шрифтов — в манифесте с отпечатками реестра, байтов среди файлов сборки нет', async () => {
    const { manifest, files } = await buildStorefront(
      standInputsJson,
      {
        platformCommit: '0123456789abcdef0123456789abcdef01234567',
      },
      theme,
    );
    const fonts = shopFonts(standInputs, novaTokens).files;
    expect(fonts.map((file) => file.path)).toContain(onest.subsets.latin.files.wght.path);
    fonts.forEach((file) => expect(manifest.files[file.path]).toBe(file.hash));
    expect(files.filter((file) => file.path.startsWith('_fonts/'))).toEqual([]);
  });

  it('версия библиотеки шрифтов — отпечаток реестра', () => {
    expect(FONT_LIBRARY_HASH).toBe(hashOf(FONT_REGISTRY));
  });
});

describe('шрифты в превью', () => {
  it('правка шрифта в панели меняет CSS шрифтов и стек в CSS токенов — их подменяет слушатель превью', () => {
    const answer = previewTokens(novaTokens, { root: { 'font-body': PANEL_LORA } });
    expect(answer.fontsCss).toContain('font-family:"Lora Fallback"');
    expect(fontLine(answer.css, 'font-body')).toBe('  --font-body: "Lora", "Lora Fallback", serif;');
  });
});
