import { EXT_POINTS } from '@merfy/shell/ext-points';
import { EXT_POINT_NAMES, parseStorefrontConfig, type StorefrontConfig } from '@merfy/storefront-config';
import { describe, expect, it } from 'vitest';
import { buildStorefront, type ThemeBuild } from '../src/build';
import { sha256 } from '../src/canonical';
import type { BuildFile } from '../src/client-files';
import { pageExtPointParts, pageExtPoints, type CodeAssets } from '../src/code';
import { partsOfExtPoints } from '../src/ext-points';
import { parseBuildInputs, type BuildInputs, type CodeSection } from '../src/inputs';
import { buildKey, dataKey } from '../src/key';
import { HERO, MODULES, RENDERS, codeInputs } from './support-code';
import { fakeRender, novaTokens } from './support-theme';

// Места блоков расширений в бандле и конфиге страницы (блок 15 «Секций и SDK», часть 15д; design.md блока 7, С7-21 А,
// С-3 Б): часть места — только если её включил магазин (code.extPointParts, 15г — обобщён на все места); points и
// records — где место есть в разметке секции страницы, purchase — на каждой странице с бандлом. Описания мест — в
// конфиге страницы (code.extPoints), браузер их не запрашивает. Магазин без расширений — бандл и конфиг без мест.
const REFERENCES = { platformCommit: '0123456789abcdef0123456789abcdef01234567' };
const THEME: ThemeBuild = { tokens: novaTokens, render: fakeRender, clientFiles: [] };
const CORE = [
  `export const start = (options) => { globalThis.merfyStarted = [options, '${'x'.repeat(5000)}']; };`,
  'export const defineSection = (definition) => definition;',
  ...['auth', 'cart', 'favorites', 'analytics', 'checkout', 'points', 'records', 'purchase'].map(
    (name) => `export const ${name} = { name: '${name}' };`,
  ),
].join('\n');
const SHELL_BUILD = { version: '0.1.0', hash: sha256(CORE), parts: ['auth', 'cart', 'favorites'], code: CORE };
const ASSETS: CodeAssets = { shell: SHELL_BUILD, modules: MODULES, renders: RENDERS };
const CONFIG_OPEN = '<script type="application/json" id="merfy-config">';

// Секции с местами — script_meta как у приёма (Р12б-13): панель корзины (cart → points) — в overlay каждой страницы,
// «Мои заказы» (orders → records) — на главной. Разметка — от «Первого экрана».
const DRAWER: CodeSection = { ...HERO, name: 'shop:cart-drawer', meta: { uses: [], parts: ['points'], classes: [] } };
const ORDERS: CodeSection = { ...HERO, name: 'shop:orders', meta: { uses: [], parts: ['records'], classes: [] } };
const REQUESTS = { requests: { orders: { list: 'mineListV2', get: 'mineGetV2' }, product: { form: 'productFormV2' } } };
const LOYALTY = { loyalty: { cart: { note: { text: 'У вас {balance} бонусов', when: 'balance' } } } };

type Places = NonNullable<BuildInputs['code']['extPoints']>;

// Входы так, как их пишет сборщик: места и части мест — из одного разбора.
function shopWith(extPoints?: Places): BuildInputs {
  return codeInputs((inputs) => {
    inputs.shell = { version: SHELL_BUILD.version, hash: SHELL_BUILD.hash, parts: SHELL_BUILD.parts };
    inputs.code = {
      sections: [DRAWER, HERO, ORDERS],
      pages: {
        home: [
          { id: 'hero-1', section: HERO.name, settings: {} },
          { id: 'orders-1', section: ORDERS.name, settings: {} },
        ],
        overlay: [{ id: 'cart-drawer-1', section: DRAWER.name, settings: {} }],
      },
      globals: [],
      ...(extPoints === undefined ? {} : { extPoints, extPointParts: partsOfExtPoints(extPoints) }),
    };
  });
}

const text = (files: readonly BuildFile[], path: string): string =>
  Buffer.from(files.find((file) => file.path === path)?.content ?? new Uint8Array()).toString('utf8');

// Бандл и конфиг главной; бандла нет — ошибка теста.
async function homeOf(inputs: BuildInputs): Promise<{ bundle: string; config: StorefrontConfig }> {
  const renderSection = (): Promise<string> => Promise.resolve('<p class="flex">секция</p>');
  const { files } = await buildStorefront(inputs, REFERENCES, THEME, ASSETS, renderSection);
  const html = text(files, 'index.html');
  const src = /src="\/(_merfy\/b\/[0-9a-f]{64}\.js)"/.exec(html)?.[1];
  if (src === undefined) throw new Error('у главной нет бандла');
  const start = html.indexOf(CONFIG_OPEN) + CONFIG_OPEN.length;
  return { bundle: text(files, src), config: parseStorefrontConfig(html.slice(start, html.indexOf('</script>', start))) };
}

const partsIn = (bundle: string): string[] =>
  ['points', 'records', 'purchase'].filter((part) => new RegExp(`name:\\s*["']${part}["']`).test(bundle));

describe('части мест расширений в бандле страницы', () => {
  it('магазин без расширений: места в разметке есть, частей мест и extPoints в конфиге нет', async () => {
    const { bundle, config } = await homeOf(shopWith());
    expect(partsIn(bundle)).toEqual([]);
    expect('extPoints' in config).toBe(false);
  });

  it('места orders и product: records — по месту на главной, purchase — без места; points нет — нет места cart', async () => {
    const { bundle, config } = await homeOf(shopWith(REQUESTS));
    expect(partsIn(bundle)).toEqual(['records', 'purchase']);
    expect(config.extPoints).toEqual(REQUESTS);
  });

  it('ещё расширение с местом cart — points по панели корзины из overlay; места по алфавиту id', async () => {
    const { bundle, config } = await homeOf(shopWith({ ...REQUESTS, ...LOYALTY }));
    expect(partsIn(bundle)).toEqual(['points', 'records', 'purchase']);
    expect(Object.keys(config.extPoints ?? {})).toEqual(['loyalty', 'requests']);
  });
});

describe('pageExtPointParts, pageExtPoints, partsOfExtPoints', () => {
  it('страница без мест в разметке: purchase и место product; панель корзины — points и место cart', () => {
    expect(pageExtPointParts(shopWith(REQUESTS), 'about')).toEqual(['purchase']);
    expect(pageExtPoints(shopWith(REQUESTS), 'about')).toEqual({ requests: { product: REQUESTS.requests.product } });
    const both = shopWith({ ...LOYALTY, ...REQUESTS });
    expect(pageExtPointParts(both, 'about')).toEqual(['points', 'purchase']);
    expect(pageExtPoints(both, 'about')).toEqual({
      loyalty: LOYALTY.loyalty,
      requests: { product: REQUESTS.requests.product },
    });
    expect([pageExtPointParts(shopWith(), 'home'), pageExtPoints(shopWith(), 'home')]).toEqual([[], {}]);
  });

  it('части — по местам; места ядра и конфига одни и те же', () => {
    expect(partsOfExtPoints(undefined)).toEqual([]);
    expect(partsOfExtPoints(REQUESTS)).toEqual(['purchase', 'records']);
    expect(partsOfExtPoints({ ...LOYALTY, other: { account: { title: 'Кабинет' } } })).toEqual(['points']);
    expect(Object.keys(EXT_POINTS).sort()).toEqual([...EXT_POINT_NAMES].sort());
  });
});

describe('extPoints во входах сборки', () => {
  it('места проходят; пустые и не той формы — ошибка входов', () => {
    const withPlaces = (value: unknown): unknown => {
      const inputs = structuredClone(shopWith());
      Reflect.set(inputs.code, 'extPoints', value);
      return inputs;
    };
    expect(parseBuildInputs(withPlaces(REQUESTS)).code.extPoints).toEqual(REQUESTS);
    expect(() => parseBuildInputs(withPlaces({}))).toThrow();
    expect(() =>
      parseBuildInputs(withPlaces({ requests: { product: { form: 'productFormV2', submit: 'submitV2' } } })),
    ).toThrow();
  });

  it('включили расширение с местом — меняются оба ключа; новое описание места — только ключ сборки', () => {
    const after = shopWith(REQUESTS);
    expect(dataKey(after)).not.toBe(dataKey(shopWith()));
    expect(buildKey(after)).not.toBe(buildKey(shopWith()));
    const renamed = shopWith({ requests: { ...REQUESTS.requests, product: { form: 'productFormV3' } } });
    expect(dataKey(renamed)).toBe(dataKey(after));
    expect(buildKey(renamed)).not.toBe(buildKey(after));
  });
});
