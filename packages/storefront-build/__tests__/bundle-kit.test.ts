import { describe, expect, it } from 'vitest';
import { bundleEntry, bundlePage, type BundleSection, type BundleSource, type KitPlan } from '../src/bundle';
import { sha256 } from '../src/canonical';
import { KIT_FILES } from './support-kit';

// Поведения в бандле страницы (блок 6, часть 6б; Р6б-2, Р6б-3): строка входа, склейка файлов dist/behaviors с общим
// куском, запрет ходить в kit из модуля секции. Ядро — как в bundle.test.ts: библиотека с теми же экспортами, что у core.js.
const CORE = [
  'export const start = (options) => { globalThis.merfyStarted = options; };',
  'export const defineSection = (definition) => definition;',
  "export const auth = { name: 'auth' };",
  "export const cart = { name: 'cart' };",
  "export const favorites = { name: 'favorites' };",
  "export const analytics = { name: 'analytics' };",
].join('\n');
const PARTS = ['auth', 'cart', 'favorites', 'analytics'];
const NONE: KitPlan = { behaviors: [], reveal: false, animate: false };
const plan = (change: Partial<KitPlan>): KitPlan => ({ ...NONE, ...change });

const MODULES = {
  quiet: 'export default {mount(){globalThis.quiet="quiet-mounted"}};',
  sneaky: 'import{behaviors as b}from"merfy-kit:part.js";export default {mount(){b({list:[]})}};',
};
const hexOf = (text: string): string => sha256(text).slice('sha256:'.length);
const section = (name: string, text: string): BundleSection => ({
  name,
  kind: 'section',
  script: hexOf(text),
  uses: ['auth', 'cart', 'favorites'],
});

function sourceOf(kit: KitPlan | null, sections: readonly BundleSection[] = [], files = KIT_FILES): BundleSource {
  const modules = new Map(Object.values(MODULES).map((text): [string, string] => [hexOf(text), text]));
  return { core: CORE, parts: PARTS, sections, modules, ...(kit === null ? {} : { kit: { files, plan: kit } }) };
}

describe('строка входа с поведениями', () => {
  it('часть behaviors — после частей ядра; импорты по порядку: part, поведения, reveal, animate', () => {
    expect(bundleEntry(['auth'], [], plan({ behaviors: ['accordion', 'nav-menu'], reveal: true }))).toBe(
      [
        "import { start, auth } from '@merfy/shell/core';",
        'import { behaviors as kitBehaviors } from "merfy-kit:part.js";',
        'import { accordion as kit0 } from "merfy-kit:accordion.js";',
        'import { navMenu as kit1 } from "merfy-kit:nav-menu.js";',
        'import { reveal as kitReveal } from "merfy-kit:reveal.js";',
        'start({ parts: [auth, kitBehaviors({ list: [kit0, kit1], reveal: kitReveal })], sections: [] });',
        '',
      ].join('\n'),
    );
  });

  it('только провайдер animate; пустой набор и отсутствие набора — строка как в 5б', () => {
    expect(bundleEntry([], [], plan({ animate: true }))).toContain(
      'start({ parts: [kitBehaviors({ list: [], animate: kitAnimate })], sections: [] });',
    );
    expect(bundleEntry(['auth'], [], NONE)).toBe(bundleEntry(['auth'], []));
  });

  it('имя поведения не kebab-case — bundle-failed до esbuild', () => {
    expect(() => bundleEntry([], [], plan({ behaviors: ['x; alert(1)'] }))).toThrowError(/kebab-case/);
  });
});

describe('бандл с поведениями', () => {
  it('только нужные файлы; общий кусок один раз; части ядра и аналитика на месте', async () => {
    const bundle = await bundlePage(sourceOf(plan({ behaviors: ['accordion', 'carousel'], reveal: true })));
    const text = bundle.tag;
    for (const marker of ['kit-part', 'kit-accordion', 'kit-carousel', 'kit-reveal', 'name:"auth"', 'name:"analytics"'])
      expect(text).toContain(marker);
    expect(text.split('kit-chunk')).toHaveLength(2);
    for (const marker of ['kit-nav-menu', 'kit-animate']) expect(text).not.toContain(marker);
    expect(text).not.toMatch(/\bimport\b/);
    expect(bundle.notices).toEqual([]);
  });

  it('только провайдер animate — без reveal и поведений', async () => {
    const text = (await bundlePage(sourceOf(plan({ animate: true })))).tag;
    expect(text).toContain('kit-animate');
    for (const marker of ['kit-reveal', 'kit-accordion', 'kit-chunk']) expect(text).not.toContain(marker);
  });

  it('набор пустой или без kit — в бандле нет ни одной метки поведений', async () => {
    for (const kit of [NONE, null]) expect((await bundlePage(sourceOf(kit))).tag).not.toContain('kit-');
  });

  it('модуль секции не может импортировать файлы поведений — секция пропущена, остальное собрано', async () => {
    const bundle = await bundlePage(
      sourceOf(plan({ behaviors: ['accordion'] }), [section('shop:sneaky', MODULES.sneaky), section('shop:quiet', MODULES.quiet)]),
    );
    expect(bundle.notices.map((notice) => [notice.code, notice.section])).toEqual([
      ['section-script-skipped', 'shop:sneaky'],
    ]);
    expect(bundle.tag).toContain('quiet-mounted');
  });

  it('нужного файла нет в kit или файл ходит за чужим пакетом — bundle-failed', async () => {
    const lost = new Map([...KIT_FILES].filter(([name]) => name !== 'accordion.js'));
    await expect(bundlePage(sourceOf(plan({ behaviors: ['accordion'] }), [], lost))).rejects.toMatchObject({
      code: 'bundle-failed',
    });
    const foreign = new Map([...KIT_FILES, ['accordion.js', 'import x from "lodash"; export const accordion = x;']]);
    await expect(bundlePage(sourceOf(plan({ behaviors: ['accordion'] }), [], foreign))).rejects.toMatchObject({
      code: 'bundle-failed',
    });
  });
});
