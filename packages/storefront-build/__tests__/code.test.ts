import { describe, expect, it } from 'vitest';
import type { CodeNotice } from '../src/bundle';
import { sha256 } from '../src/canonical';
import { NO_ASSETS, checkCodeAssets, codeHead, pageBundle, placedSections } from '../src/code';
import { parseBuildInputs } from '../src/inputs';
import { NO_SECTIONS, type PageRender } from '../src/sections-render';
import { changedInputs, errorOf, rawInputs, standInputs } from './support';
import { ASSETS, BADGE, CODE, MODULES, NO_SCRIPT, RENDERS, SHELL, SHELL_BUILD, codeInputs } from './support-code';

// Код секций в странице и в сборке (design.md блока 7, п. 12, 16, 19; блок 5 «Секций и SDK», раздел 3.10).
const withCode = (code: unknown, shell: unknown = SHELL): unknown =>
  rawInputs((raw) => Object.assign(raw, { shell, code }));
const hexOf = (hash: string | null): string => (hash ?? '').slice('sha256:'.length);

// Код, который сам с собой не сходится, → путь первой ошибки. Код ошибки у всех — code-invalid.
const instance = (id: string, section: string, settings: Record<string, string> = {}) => ({ id, section, settings });
const INVALID_CODE: [string, unknown, string][] = [
  ['секция в коде дважды', withCode({ ...CODE, sections: [...CODE.sections, BADGE] }), 'code.sections.4'],
  [
    'на странице — глобальный скрипт',
    withCode({ ...CODE, pages: { home: [instance('x-1', 'geo:locate')] } }),
    'code.pages.home.0',
  ],
  ['в globals — секцию нельзя', withCode({ ...CODE, globals: ['shop:hero'] }), 'code.globals.0'],
  ['скрипт без ядра', withCode(CODE, null), 'code.sections.0.script'],
  [
    'у секции нет модуля рендера',
    withCode({
      ...CODE,
      sections: CODE.sections.map((section) => (section.kind === 'section' ? { ...section, render: null } : section)),
    }),
    'code.sections.1.render',
  ],
  [
    'id экземпляра дважды на странице',
    withCode({ ...CODE, pages: { home: [instance('hero-1', 'shop:hero'), instance('hero-1', 'shop:hero')] } }),
    'code.pages.home.1.id',
  ],
];

const livePage = (notices: CodeNotice[] = []): PageRender => ({
  sections: { ...NO_SECTIONS, modules: RENDERS },
  mode: 'live',
  code: ASSETS,
  notice: (_pageId, notice) => notices.push(notice),
});

describe('код секций в <head>', () => {
  it('стили секций, потом тег бандла; входы с ядром { version, hash, parts } проходят схему', () => {
    const inputs = codeInputs();
    expect(parseBuildInputs(inputs)).toEqual(inputs);
    const tag = '<script type="module" src="/_merfy/b/a.js"></script>';
    expect(codeHead(inputs, 'home', '.flex{display:flex}', tag)).toBe(
      `<style id="merfy-sections">.flex{display:flex}</style>${tag}`,
    );
  });

  it('без секций на странице — только тег бандла; без тега — только стили; ни списка модулей, ни карты импортов', () => {
    expect(codeHead(standInputs, 'home', '', '<script type="module">x</script>')).toBe(
      '<script type="module">x</script>',
    );
    const styled = changedInputs((inputs) => (inputs.code = structuredClone(NO_SCRIPT)));
    expect(codeHead(styled, 'home', '')).toBe('<style id="merfy-sections"></style>');
    const head = codeHead(codeInputs(), 'home', '');
    expect(head).not.toContain('merfy-modules');
    expect(head).not.toContain('importmap');
    expect(head).not.toContain('modulepreload');
  });

  it('</style> в CSS секций не закрывает тег', () => {
    const head = codeHead(codeInputs(), 'home', 'a::after{content:"</style><script>"}');
    expect(head.split('</style>')).toHaveLength(2);
    expect(head).toContain('content:"<\\/style><script>"');
  });

  it('старое ядро во входах (preload) и чужое имя части — inputs-invalid', () => {
    const old = withCode(CODE, { version: '0.1.0', hash: SHELL.hash, preload: ['shell.js'] });
    expect(errorOf(() => parseBuildInputs(old))).toMatchObject({ code: 'inputs-invalid' });
    const strange = withCode(CODE, { ...SHELL, parts: ['cart; alert(1)'] });
    expect(errorOf(() => parseBuildInputs(strange))).toMatchObject({ code: 'inputs-invalid', path: 'shell.parts.0' });
  });
});

describe('экземпляры секций страницы', () => {
  it('в порядке мерчанта, повтор — второй экземпляр; script: true — у секций со скриптом; нет мест — нет экземпляров', () => {
    const renders = new Map(
      codeInputs().code.sections.map((section): [string, string] => [section.name, section.render ?? '']),
    );
    expect(placedSections(codeInputs(), 'home')).toEqual([
      { id: 'cart-badge-1', name: 'shop:cart-badge', hash: renders.get('shop:cart-badge'), settings: {}, script: true },
      {
        id: 'hero-1',
        name: 'shop:hero',
        hash: renders.get('shop:hero'),
        settings: { heading: 'Шарфы к первым холодам' },
      },
      { id: 'list-1', name: 'reviews:list', hash: renders.get('reviews:list'), settings: {}, script: true },
      { id: 'list-2', name: 'reviews:list', hash: renders.get('reviews:list'), settings: {}, script: true },
    ]);
    expect(placedSections(codeInputs(), 'about')).toEqual([]);
    expect(placedSections(standInputs, 'home')).toEqual([]);
  });
});

describe('байты кода до рендера', () => {
  it('всё на месте — без ошибки; нет сборки ядра, не та сборка, нет файла скрипта или не те байты — ошибка', () => {
    const inputs = codeInputs();
    expect(() => checkCodeAssets(inputs, ASSETS)).not.toThrow();
    expect(() => checkCodeAssets(standInputs, NO_ASSETS)).not.toThrow();
    expect(errorOf(() => checkCodeAssets(inputs, NO_ASSETS))).toMatchObject({ code: 'shell-missing', path: 'shell' });
    const otherShell = { ...SHELL_BUILD, hash: sha256('другое ядро') };
    expect(errorOf(() => checkCodeAssets(inputs, { ...ASSETS, shell: otherShell }))).toMatchObject({
      code: 'shell-mismatch',
      path: 'shell.hash',
    });
    const lost = new Map([...MODULES].slice(1));
    expect(errorOf(() => checkCodeAssets(inputs, { ...ASSETS, modules: lost }))).toMatchObject({
      code: 'code-missing',
    });
    const forged = new Map([...MODULES].map(([hash]): [string, Uint8Array] => [hash, Buffer.from('чужой код')]));
    expect(errorOf(() => checkCodeAssets(inputs, { ...ASSETS, modules: forged }))).toMatchObject({
      code: 'code-missing',
    });
  });
});

describe('бандл страницы', () => {
  it('секции страницы со скриптом по одному разу, потом глобальные; части — из ядра и аналитика; uses — части ядра', async () => {
    const bundle = await pageBundle(codeInputs(), 'home', livePage());
    const text = new TextDecoder().decode(bundle?.file?.content);
    const scripts = [BADGE.script, CODE.sections[3]?.script ?? null, CODE.sections[0]?.script ?? null].map(hexOf);
    const at = scripts.map((hex) => text.indexOf(`script:"${hex}",uses:["auth","cart","favorites"]`));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((left, right) => left - right)).toEqual(at);
    expect(text.split(`script:"${scripts[1]}"`)).toHaveLength(2);
    expect(text).toContain('name:"analytics"');
    expect(bundle?.tag).toBe(`<script type="module" src="/${bundle?.file?.path}"></script>`);
  });

  it('страница без мест — бандл с глобальным скриптом; страница без кода — бандл только с ядром и частями', async () => {
    const about = await pageBundle(codeInputs(), 'about', livePage());
    expect(new TextDecoder().decode(about?.file?.content)).toContain('geo-mounted');
    const plain = await pageBundle(
      changedInputs((inputs) => (inputs.shell = structuredClone(SHELL))),
      'home',
      livePage(),
    );
    const text = new TextDecoder().decode(plain?.file?.content);
    expect(text).toContain('name:"analytics"');
    expect(text).toContain('sections:[]');
  });

  it('превью, рендер без кода и входы без ядра — без бандла', async () => {
    expect(await pageBundle(codeInputs(), 'home', { ...livePage(), mode: 'preview' })).toBeNull();
    expect(await pageBundle(codeInputs(), 'home', { sections: NO_SECTIONS, mode: 'live' })).toBeNull();
    expect(await pageBundle(standInputs, 'home', livePage())).toBeNull();
  });

  it('предупреждения сборки бандла — в page.notice с id страницы', async () => {
    const notices: CodeNotice[] = [];
    const broken = new Map([...MODULES].map(([hash, content]): [string, Uint8Array] => [hash, content]));
    const old = Buffer.from('import{part as p}from"@merfy/shell";export default {mount(){p("cart")}};');
    const inputs = codeInputs((changed) => {
      changed.code.sections = changed.code.sections.map((section) =>
        section.name === 'reviews:list' ? { ...section, script: sha256(old) } : section,
      );
    });
    broken.set(sha256(old), old);
    const page: PageRender = { ...livePage(notices), code: { ...ASSETS, modules: broken } };
    await pageBundle(inputs, 'home', page);
    expect(notices.map((notice) => [notice.code, notice.section])).toEqual([
      ['section-script-skipped', 'reviews:list'],
    ]);
  });
});

describe('код во входах сверяется сам с собой', () => {
  it.each(INVALID_CODE)('code-invalid: %s', (_name, raw, path) => {
    expect(errorOf(() => parseBuildInputs(raw))).toMatchObject({ code: 'code-invalid', path });
  });
});
