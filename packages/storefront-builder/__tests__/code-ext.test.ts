import { sha256 } from '@merfy/storefront-build';
import type { SectionRow } from '@merfy/storefront-sections';
import { describe, expect, it } from 'vitest';
import { codeOf, enabledForShop, extensionStorefrontOf, storefrontsOf, type CodeContext } from '../src/code';
import type { LogFields } from '../src/log';

// Сторы и методы расширений в коде магазина (блок 9 «Секций и SDK», часть 9в): описания — из extensions.enabledForShop,
// во входы — только для расширений из scriptMeta.uses секций, которые стоят на страницах (Р9в-21). Расширение —
// test-ext «Отзывы-тест».
const SHELL = { version: '0.1.0', hash: sha256('ядро'), parts: ['auth', 'cart', 'favorites'], code: '' };
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const TEST_EXT = {
  stores: { summary: { fn: 'shopSummary' } },
  methods: { vote: { fn: 'voteReview', params: ['review-id'] } },
};

// Строка реестра своей секции магазина SDK 1 со скриптом; uses — в section.json, script_meta — как его пишет приём
// (часть 5в; "ext:<id>" и часть ext — 9в-4).
function shopRow(name: string, uses?: readonly string[]): SectionRow {
  const [, id = ''] = name.split(':');
  const render = `export default 1; // ${name}`;
  const script = `export default {}; // ${name}`;
  const ext = (uses ?? []).filter((use) => use.startsWith('ext:'));
  return {
    id: name,
    name,
    kind: 'section',
    author: 'shop',
    owner: SHOP,
    release: null,
    sourceHash: sha256(`исходник ${name}`),
    contentHash: sha256(`правка ${name}`),
    manifest: { sdk: 1, name: id, kind: 'section', title: name, settings: [], ...(uses === undefined ? {} : { uses }) },
    template: `<p>${name}</p>`,
    style: '',
    render,
    renderHash: sha256(render),
    script,
    scriptHash: sha256(script),
    scriptMeta: { uses: ext, parts: ext.length === 0 ? [] : ['ext'], classes: [] },
    warnings: [],
    draft: false,
    published: true,
    createdAt: '2026-10-10T09:00:00.000Z',
  };
}

function contextOf(extensions?: CodeContext['extensions']) {
  const logged: [string, LogFields][] = [];
  const log = (event: string, fields: LogFields = {}): void => void logged.push([event, fields]);
  const context: CodeContext = { shell: SHELL, shopId: SHOP, log, ...(extensions === undefined ? {} : { extensions }) };
  return { context, logged };
}

const placed = (id: string, section: string) => ({ id, section, settings: {} });

describe('codeOf: описания расширений', () => {
  it('секция с ext:test-ext в script_meta на странице — описание test-ext в коде; ext:test-ext — в meta, не в uses', () => {
    const { context } = contextOf(new Map([['test-ext', TEST_EXT]]));
    const shop = codeOf(
      [shopRow('shop:reviews', ['ext:test-ext'])],
      { home: [placed('reviews-1', 'shop:reviews')] },
      context,
    );
    expect(shop.code.extensions).toEqual({ 'test-ext': TEST_EXT });
    expect(shop.code.sections.map((section) => [section.uses, section.meta?.uses])).toEqual([[[], ['ext:test-ext']]]);
  });

  it('строка без script_meta (до 5в) — описания нет и строки журнала нет: id берутся из script_meta', () => {
    const { context, logged } = contextOf(new Map([['test-ext', TEST_EXT]]));
    const row = { ...shopRow('shop:reviews', ['ext:test-ext']), scriptMeta: null };
    const shop = codeOf([row], { home: [placed('reviews-1', 'shop:reviews')] }, context);
    expect('extensions' in shop.code).toBe(false);
    expect(logged).toEqual([]);
  });

  it('секций с ext нет — ключа extensions нет: входы и ключ сборки прежние', () => {
    const { context } = contextOf(new Map([['test-ext', TEST_EXT]]));
    const shop = codeOf([shopRow('shop:hero')], { home: [placed('hero-1', 'shop:hero')] }, context);
    expect('extensions' in shop.code).toBe(false);
  });

  it('секция с ext не стоит на страницах — описания нет', () => {
    const { context } = contextOf(new Map([['test-ext', TEST_EXT]]));
    const shop = codeOf([shopRow('shop:reviews', ['ext:test-ext'])], { home: [] }, context);
    expect('extensions' in shop.code).toBe(false);
  });

  it('расширение не включено — описания нет, строка журнала section-extension-missing; сборка идёт', () => {
    const { context, logged } = contextOf(new Map());
    const shop = codeOf(
      [shopRow('shop:reviews', ['ext:loyalty'])],
      { home: [placed('reviews-1', 'shop:reviews')] },
      context,
    );
    expect('extensions' in shop.code).toBe(false);
    expect(logged).toEqual([
      ['section-extension-missing', { shopId: SHOP, section: 'shop:reviews', extension: 'loyalty' }],
    ]);
  });
});

describe('описания из ответа extensions.enabledForShop', () => {
  it('из storefront манифеста — только stores и methods', () => {
    expect(extensionStorefrontOf({ ...TEST_EXT, cart: { note: 'Отзывов: {reviews}' } })).toEqual(TEST_EXT);
  });

  it('нет stores и methods или storefront нет — пустые', () => {
    expect(extensionStorefrontOf({ product: { form: 'bookingForm', submit: 'bookingSubmit' } })).toEqual({
      stores: {},
      methods: {},
    });
    expect(extensionStorefrontOf(undefined)).toEqual({ stores: {}, methods: {} });
  });

  it('не той формы — null', () => {
    expect(extensionStorefrontOf({ stores: { $summary: { fn: 'shopSummary' } } })).toBeNull();
    expect(extensionStorefrontOf({ stores: [] })).toBeNull();
  });

  it('карта описаний: не той формы — расширения нет, строка журнала extension-storefront-invalid', () => {
    const { context, logged } = contextOf();
    const list = [
      { id: 'test-ext', version: '0.1.0', storefront: TEST_EXT },
      { id: 'broken', version: '1.0.0', storefront: { stores: [] } },
    ];
    expect([...storefrontsOf(list, context).keys()]).toEqual(['test-ext']);
    expect(logged).toEqual([['extension-storefront-invalid', { shopId: SHOP, extension: 'broken' }]]);
  });

  it('enabledForShop — id, версия и storefront каждого включённого расширения', async () => {
    const answer = { success: true, data: [{ id: 'test-ext', version: '0.1.0', storefront: TEST_EXT, hooks: [] }] };
    const request = { call: () => Promise.resolve(answer), timeoutMs: 1_500, log: () => undefined };
    expect(await enabledForShop(request, SHOP)).toEqual([{ id: 'test-ext', version: '0.1.0', storefront: TEST_EXT }]);
  });
});
