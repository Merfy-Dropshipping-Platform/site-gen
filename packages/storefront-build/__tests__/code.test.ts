import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/canonical';
import { NO_ASSETS, codeFiles, codeHead, pageSections, shellDir } from '../src/code';
import { parseBuildInputs } from '../src/inputs';
import { changedInputs, errorOf, rawInputs, standInputs } from './support';
import {
  ASSETS,
  BADGE,
  CODE,
  MODULES,
  REVIEWS,
  SCARF,
  SHELL,
  SHELL_BUILD,
  SRC,
  STYLE_ONLY,
  codeInputs,
} from './support-code';

// Код секций в странице и в сборке (design.md блока 7, п. 12, 16, 19).
const DIR = shellDir(SHELL.hash);
const BASE_CSS = 'merfy-section{display:block}merfy-section[hidden]{display:none}';
const HEAD_ORDER = [
  '<style id="merfy-sections">',
  'id="merfy-modules"',
  '<script type="importmap">',
  '<link rel="modulepreload"',
  '<script type="module"',
];

// JSON списка модулей из <head>.
function modulesOf(head: string): unknown {
  const json = head.split('id="merfy-modules">')[1]?.split('</script>')[0] ?? '';
  const parsed: unknown = JSON.parse(json);
  return parsed;
}

const withCode = (code: unknown, shell: unknown = SHELL): unknown =>
  rawInputs((raw) => Object.assign(raw, { shell, code }));

// Код, который сам с собой не сходится, → путь первой ошибки. Код ошибки у всех — code-invalid.
const INVALID_CODE: [string, unknown, string][] = [
  ['секция в коде дважды', withCode({ ...CODE, sections: [...CODE.sections, BADGE] }), 'code.sections.4'],
  ['на странице — глобальный скрипт', withCode({ ...CODE, pages: { home: ['geo:locate'] } }), 'code.pages.home.0'],
  ['в globals — секция', withCode({ ...CODE, globals: ['platform:cart-badge'] }), 'code.globals.0'],
  ['скрипт без ядра', withCode(CODE, null), 'code.sections.0.script'],
];

describe('код секций в <head>', () => {
  it('порядок: стили секций, список модулей, import map, подсказки, ядро; входы с кодом проходят схему', () => {
    const inputs = codeInputs();
    expect(parseBuildInputs(inputs)).toEqual(inputs);
    const head = codeHead(inputs, 'home');
    const at = HEAD_ORDER.map((marker) => head.indexOf(marker));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((left, right) => left - right)).toEqual(at);
    expect(head.startsWith(`<style id="merfy-sections">${BASE_CSS}${BADGE.css}${SCARF.css}</style>`)).toBe(true);
  });

  it('список модулей: секции страницы со скриптом и глобальные — по одному разу, адрес — по отпечатку', () => {
    expect(modulesOf(codeHead(codeInputs(), 'home'))).toEqual({
      v: 1,
      modules: [
        { kind: 'section', name: 'platform:cart-badge', src: SRC.badge },
        { kind: 'section', name: 'reviews:list', src: SRC.reviews },
        { kind: 'global', name: 'geo:locate', src: SRC.geo },
      ],
    });
    expect(SRC.badge).toMatch(/^\/_merfy\/m\/[0-9a-f]{64}\.js$/);
  });

  it('import map — одно имя @merfy/shell; modulepreload — файлы ядра из preload и модули страницы; ядро — в конце', () => {
    const head = codeHead(codeInputs(), 'home');
    expect(DIR).toMatch(/^_merfy\/shell\/[0-9a-f]{16}$/);
    expect(head).toContain(`<script type="importmap">{"imports":{"@merfy/shell":"/${DIR}/shell.js"}}</script>`);
    const preloads = [...head.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(([, href]) => href);
    expect(preloads).toEqual([`/${DIR}/shell.js`, `/${DIR}/part-AB12CD34.js`, SRC.badge, SRC.reviews, SRC.geo]);
    expect(head.endsWith(`<script type="module" src="/${DIR}/shell.js"></script>`)).toBe(true);
    expect(head.split('<script type="module"')).toHaveLength(2);
  });

  it('без кода — пусто; без скриптов — только стили; на странице без мест — только глобальные скрипты', () => {
    expect(codeHead(standInputs, 'home')).toBe('');
    const styled = changedInputs((inputs) => (inputs.code = structuredClone(STYLE_ONLY)));
    expect(codeHead(styled, 'home')).toBe(`<style id="merfy-sections">${BASE_CSS}${SCARF.css}</style>`);
    expect(modulesOf(codeHead(codeInputs(), 'about'))).toEqual({
      v: 1,
      modules: [{ kind: 'global', name: 'geo:locate', src: SRC.geo }],
    });
  });

  it('</style> в стилях секции не закрывает тег', () => {
    const inputs = codeInputs((value) => (value.code.sections[1].css = 'a::after{content:"</style><script>"}'));
    const head = codeHead(inputs, 'home');
    expect(head.split('</style>')).toHaveLength(2);
    expect(head).toContain('content:"<\\/style><script>"');
  });
});

describe('разметка секций страницы', () => {
  it('в порядке мерчанта, повтор — второй экземпляр; глобальному скрипту места нет; нет мест — нет разметки', () => {
    const element = (name: string, html: string): string =>
      `<merfy-section data-section="${name}">${html}</merfy-section>`;
    expect(pageSections(codeInputs(), 'home')).toEqual([
      element('platform:cart-badge', BADGE.html),
      element('nova:scarf-colors', SCARF.html),
      element('reviews:list', REVIEWS.html),
      element('reviews:list', REVIEWS.html),
    ]);
    expect(pageSections(codeInputs(), 'about')).toEqual([]);
    expect(pageSections(standInputs, 'home')).toEqual([]);
  });
});

describe('файлы кода', () => {
  it('ядро — в _merfy/shell/<16 знаков>/, скрипт — _merfy/m/<sha256>.js, один файл на отпечаток', () => {
    const files = codeFiles(codeInputs(), ASSETS);
    expect(files.map((file) => file.path)).toEqual([
      `${DIR}/part-AB12CD34.js`,
      `${DIR}/shell.js`,
      SRC.geo.slice(1),
      SRC.badge.slice(1),
      SRC.reviews.slice(1),
    ]);
    const badge = files.find((file) => file.path === SRC.badge.slice(1));
    expect(badge === undefined ? '' : sha256(badge.content)).toBe(BADGE.script);
    expect(codeFiles(standInputs, NO_ASSETS)).toEqual([]);
  });

  it('нет сборки ядра, не та сборка, нет файла скрипта или не те байты — ошибка', () => {
    const inputs = codeInputs();
    expect(errorOf(() => codeFiles(inputs, NO_ASSETS))).toMatchObject({ code: 'shell-missing', path: 'shell' });
    const otherShell = { ...SHELL_BUILD, hash: sha256('другое ядро') };
    expect(errorOf(() => codeFiles(inputs, { ...ASSETS, shell: otherShell }))).toMatchObject({
      code: 'shell-mismatch',
      path: 'shell.hash',
    });
    const lost = new Map([...MODULES].slice(1));
    expect(errorOf(() => codeFiles(inputs, { ...ASSETS, modules: lost }))).toMatchObject({ code: 'code-missing' });
    const forged = new Map([...MODULES].map(([hash]): [string, Uint8Array] => [hash, Buffer.from('чужой код')]));
    expect(errorOf(() => codeFiles(inputs, { ...ASSETS, modules: forged }))).toMatchObject({ code: 'code-missing' });
  });
});

describe('код во входах сверяется сам с собой', () => {
  it.each(INVALID_CODE)('code-invalid: %s', (_name, raw, path) => {
    expect(errorOf(() => parseBuildInputs(raw))).toMatchObject({ code: 'code-invalid', path });
  });
});
