import { describe, expect, it } from 'vitest';
import {
  BUNDLE_DIR,
  BUNDLE_INLINE_MAX_BYTES,
  bundleEntry,
  bundlePage,
  type BundleSection,
  type BundleSource,
} from '../src/bundle';
import { sha256 } from '../src/canonical';

// Бандл страницы (design.md блока 5, раздел 3.10): esbuild собирает ядро и модули секций в один ES-модуль. Ядро в
// тесте — маленькая библиотека с теми же экспортами, что у dist/core.js. Модули — в том виде, в каком их сохраняет
// проверка при сохранении: ES-модуль, @merfy/shell — внешний импорт.
const CORE = [
  'export const start = (options) => { globalThis.merfyStarted = options; };',
  'export const defineSection = (definition) => definition;',
  "export const auth = { name: 'auth' };",
  "export const cart = { name: 'cart' };",
  "export const favorites = { name: 'favorites' };",
  "export const analytics = { name: 'analytics' };",
  'export const pageStores = (list) => list;',
  "export const unused = 'unused-export';",
].join('\n');
// Ядро тяжелее порога встраивания: start хранит длинную строку — бандл идёт файлом.
const HEAVY_CORE = CORE.replace(
  'globalThis.merfyStarted = options;',
  `globalThis.merfyStarted = [options, '${'x'.repeat(5000)}'];`,
);
const PARTS = ['auth', 'cart', 'favorites', 'analytics'];
const USES = ['auth', 'cart', 'favorites'];
const MODULES = {
  badge: 'import{defineSection as e}from"@merfy/shell";export default e({mount(){globalThis.badge="badge-mounted"}});',
  reviews: 'export default {mount(){globalThis.reviews="reviews-mounted"}};',
  geo: 'export default {mount(){globalThis.geo="geo-mounted"}};',
  old: 'import{defineSection as e,part as p}from"@merfy/shell";export default e({async mount(){await p("cart")}});',
  foreign: 'import x from"lodash";export default {mount(){x()}};',
  closing: 'export default {mount(){globalThis.text="</script><!-- -->"}};',
};

const hexOf = (text: string): string => sha256(text).slice('sha256:'.length);
const section = (name: string, text: string, kind: BundleSection['kind'] = 'section'): BundleSection => ({
  name,
  kind,
  script: hexOf(text),
  uses: USES,
});
const BADGE = section('shop:cart-badge', MODULES.badge);
const REVIEWS = section('reviews:list', MODULES.reviews);
const GEO = section('geo:locate', MODULES.geo, 'global');
const OLD = section('shop:old-badge', MODULES.old);
const FOREIGN = section('shop:lodash', MODULES.foreign);

function sourceOf(sections: readonly BundleSection[], core = CORE): BundleSource {
  const modules = new Map(Object.values(MODULES).map((text): [string, string] => [hexOf(text), text]));
  return { core, parts: PARTS, sections, modules };
}

const entryOf = (entry: BundleSection, at: string): string =>
  `{name:${JSON.stringify(entry.name)},kind:${JSON.stringify(entry.kind)},script:${JSON.stringify(entry.script)},uses:["auth","cart","favorites"],definition:${at}`;

const LOAD =
  'const loadSection = (get, key) => { try { return get(); } catch (error) { return { [key]: () => { throw new Error(`скрипт секции не загрузился: ${error}`); } }; } };';

describe('аргументы сборки бандла', () => {
  it('строка: импорт start и частей из @merfy/shell/core, модули по sha256, start со списком секций по порядку', () => {
    expect(bundleEntry(['auth', 'cart'], [BADGE, GEO])).toBe(
      [
        "import { start, auth, cart } from '@merfy/shell/core';",
        LOAD,
        `const s0 = loadSection(() => require("merfy-section:${BADGE.script}").default, "mount");`,
        `const s1 = loadSection(() => require("merfy-section:${GEO.script}").default, "mount");`,
        `start({ parts: [auth, cart], sections: [{ name: "shop:cart-badge", kind: "section", script: "${BADGE.script}", uses: ["auth","cart","favorites"], definition: s0 }, { name: "geo:locate", kind: "global", script: "${GEO.script}", uses: ["auth","cart","favorites"], definition: s1 }] });`,
        '',
      ].join('\n'),
    );
    expect(bundleEntry([], [])).toBe(
      "import { start } from '@merfy/shell/core';\nstart({ parts: [], sections: [] });\n",
    );
  });
});

describe('бандл страницы', () => {
  it('ядро, части и модули секций — один модуль; неиспользуемые экспорты ядра — нет; меньше 4096 Б — в HTML', async () => {
    const bundle = await bundlePage(sourceOf([BADGE, REVIEWS, GEO]));
    const text = bundle.tag.slice('<script type="module">'.length, -'</script>'.length);
    expect(bundle.tag.startsWith('<script type="module">')).toBe(true);
    expect(bundle.file).toBeNull();
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(BUNDLE_INLINE_MAX_BYTES);
    for (const marker of ['badge-mounted', 'reviews-mounted', 'geo-mounted', 'name:"auth"', 'name:"analytics"'])
      expect(text).toContain(marker);
    expect(text).not.toContain('unused-export');
    expect(text).not.toMatch(/\bimport\b/);
    const order = [BADGE, REVIEWS, GEO].map((entry) => text.indexOf(entryOf(entry, '')));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    expect(bundle.notices).toEqual([]);
  });

  it('больше 4096 Б — файл _merfy/b/<sha256 содержимого>.js и тег со ссылкой на него; те же аргументы — тот же файл', async () => {
    const bundle = await bundlePage(sourceOf([BADGE], HEAVY_CORE));
    const again = await bundlePage(sourceOf([BADGE], HEAVY_CORE));
    const file = bundle.file;
    expect(file?.path).toMatch(new RegExp(`^${BUNDLE_DIR}/[0-9a-f]{64}\\.js$`));
    expect(file === null ? '' : sha256(file.content)).toBe(`sha256:${file?.path.slice(BUNDLE_DIR.length + 1, -3)}`);
    const integrity = `sha256-${Buffer.from(file?.path.slice(BUNDLE_DIR.length + 1, -3) ?? '', 'hex').toString('base64')}`;
    expect(bundle.tag).toBe(`<script type="module" src="/${file?.path}" integrity="${integrity}"></script>`);
    expect(again.file?.path).toBe(file?.path);
    expect(bundle.brotliBytes).toBeGreaterThan(0);
  });

  it('в тексте «</script» или «<!--» — файлом, даже если меньше 4096 Б', async () => {
    const closing = section('shop:closing', MODULES.closing);
    const bundle = await bundlePage(sourceOf([closing]));
    expect(bundle.file?.path).toMatch(new RegExp(`^${BUNDLE_DIR}/[0-9a-f]{64}\\.js$`));
  });

  it('модуль, на котором esbuild упал, пропущен: section-script-skipped, остальные секции в бандле', async () => {
    const bundle = await bundlePage(sourceOf([BADGE, OLD, FOREIGN, REVIEWS]));
    expect(bundle.notices.map((notice) => [notice.code, notice.section])).toEqual([
      ['section-script-skipped', 'shop:lodash'],
      ['section-script-skipped', 'shop:old-badge'],
    ]);
    expect(bundle.notices[0]?.message).toContain('lodash');
    expect(bundle.notices[1]?.message).toContain('"part"');
    const text = bundle.tag;
    expect(text).toContain('badge-mounted');
    expect(text).toContain('reviews-mounted');
    expect(text).not.toContain('shop:old-badge');
  });

  // 03.11: секция расширения с голым defineSection(…) (ReferenceError на верхнем уровне модуля) обрывала весь бандл —
  // скрипты остальных секций страницы не стартовали. Теперь упавший модуль — только сбой этой секции.
  it('модуль падает на верхнем уровне (ReferenceError) — бандл грузится, остальные секции стартуют, у упавшей mount бросает', async () => {
    const broken = 'var d = defineSection({ mount() {} });\nexport default d;';
    const brokenStore = 'export default (() => { throw new TypeError("стор не собрался"); })();';
    const modules = new Map(
      [MODULES.badge, MODULES.reviews, broken, brokenStore].map((text): [string, string] => [hexOf(text), text]),
    );
    const entries = [
      section('shop:broken', broken),
      BADGE,
      section('shop:broken-store', brokenStore, 'store'),
      REVIEWS,
    ];
    const bundle = await bundlePage({ core: CORE, parts: PARTS, sections: entries, modules });
    expect(bundle.notices).toEqual([]);
    Reflect.deleteProperty(globalThis, 'merfyStarted');
    const text = bundle.file === null ? bundle.tag.slice('<script type="module">'.length, -'</script>'.length) : '';
    expect(text).not.toBe('');
    await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
    const started: unknown = Reflect.get(globalThis, 'merfyStarted');
    const listOf = (key: string): Record<string, unknown>[] => {
      const list: unknown = typeof started === 'object' && started !== null ? Reflect.get(started, key) : undefined;
      return Array.isArray(list) ? list.map((item: object) => ({ ...item })) : [];
    };
    const sections = listOf('sections');
    expect(sections.map((item) => item.name)).toEqual(['shop:broken', 'shop:cart-badge', 'reviews:list']);
    const stores = listOf('stores');
    expect(stores.map((item) => item.name)).toEqual(['shop:broken-store']);
    const hookOf = (entry: Record<string, unknown> | undefined, key: string): (() => void) => {
      const definition: unknown = entry?.definition;
      const hook: unknown = typeof definition === 'object' && definition !== null ? Reflect.get(definition, key) : null;
      if (typeof hook !== 'function') throw new Error(`у определения нет ${key}`);
      return () => void Reflect.apply(hook, undefined, []);
    };
    expect(hookOf(sections[0], 'mount')).toThrow(
      'скрипт секции не загрузился: ReferenceError: defineSection is not defined',
    );
    expect(hookOf(stores[0], 'start')).toThrow('скрипт секции не загрузился: TypeError: стор не собрался');
    hookOf(sections[1], 'mount')();
    hookOf(sections[2], 'mount')();
    expect(Reflect.get(globalThis, 'badge')).toBe('badge-mounted');
    expect(Reflect.get(globalThis, 'reviews')).toBe('reviews-mounted');
  });

  it('ошибка не в модуле секции (части нет в ядре) — bundle-failed', async () => {
    await expect(bundlePage({ ...sourceOf([BADGE]), parts: ['auth', 'checkout'] })).rejects.toMatchObject({
      code: 'bundle-failed',
    });
  });
});
