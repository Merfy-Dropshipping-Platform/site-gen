import { sha256 } from '@merfy/storefront-build';
import type { Queryable } from '@merfy/storefront-sections';
import { describe, expect, it, vi } from 'vitest';
import {
  codeOf,
  extPointPartsOf,
  extPointsOf,
  readShopCode,
  type CodeContext,
  type CodeDeps,
  type EnabledExtension,
} from '../src/code';
import type { LogFields } from '../src/log';

// Места блоков расширений в коде магазина (блок 15 «Секций и SDK», часть 15д, Р15д-1, Р15д-4…Р15д-6): из раздела
// storefront включённых расширений (extensions.enabledForShop) — code.extPoints по алфавиту id и code.extPointParts
// (15г) для всех мест. REQUESTS_STOREFRONT — раздел с dev 26.10 (GET /store/extensions/storefront магазина 3a9626f7).
const SHELL = { version: '0.1.0', hash: sha256('ядро'), parts: ['auth', 'cart', 'favorites'], code: '' };
const SHOP = '3a9626f7-390d-4a66-bca5-a3b806ca6c1b';
const REQUESTS_STOREFRONT = {
  orders: { get: 'mineGetV2', list: 'mineListV2' },
  methods: { form: { fn: 'sectionFormV2' }, submit: { fn: 'sectionSubmitV2' } },
  product: { form: 'productFormV2', submit: 'submitV2' },
  sections: ['request-form'],
};
const REQUESTS_POINTS = { orders: { list: 'mineListV2', get: 'mineGetV2' }, product: { form: 'productFormV2' } };
const enabled = (id: string, storefront: unknown): EnabledExtension => ({ id, version: '1.0.0', storefront });

function contextOf(extPoints?: CodeContext['extPoints']) {
  const logged: [string, LogFields][] = [];
  const log = (event: string, fields: LogFields = {}): void => void logged.push([event, fields]);
  const context: CodeContext = { shell: SHELL, shopId: SHOP, log, ...(extPoints === undefined ? {} : { extPoints }) };
  return { context, logged };
}

describe('extPointsOf и extPointPartsOf: места включённых расширений', () => {
  it('места orders и product без submit, методов и секций; части — records и purchase', () => {
    const { context, logged } = contextOf();
    expect(extPointsOf([enabled('requests', REQUESTS_STOREFRONT)], context)).toEqual({ requests: REQUESTS_POINTS });
    expect(extPointPartsOf([enabled('requests', REQUESTS_STOREFRONT)])).toEqual(['purchase', 'records']);
    expect(extPointPartsOf([enabled('loyalty', { cart: { note: { text: 'Бонусы' } }, account: { title: 'Бонусы' } })])).toEqual([
      'points',
    ]);
    expect(logged).toEqual([]);
  });

  it('по алфавиту id; без мест, без раздела storefront и с разделом не той формы — без ключа', () => {
    const list = [
      enabled('zeta-ext', { product: { form: 'zetaForm' } }),
      enabled('alpha-ext', { product: { form: 'alphaForm' } }),
      enabled('stores-only', { stores: {}, methods: {} }),
      enabled('no-storefront', undefined),
      enabled('junk', 'мусор'),
    ];
    expect(Object.keys(extPointsOf(list, contextOf().context))).toEqual(['alpha-ext', 'zeta-ext']);
  });

  it('место не той формы — его нет, строка журнала на место; id не по правилу конфига — расширения нет', () => {
    const { context, logged } = contextOf();
    const list = [
      enabled('requests', { product: { form: 'bad name!' }, orders: { list: 'a1', get: 'b1' } }),
      enabled('X1', { product: { form: 'xForm' } }),
    ];
    expect(extPointsOf(list, context)).toEqual({ requests: { orders: { list: 'a1', get: 'b1' } } });
    expect(logged).toEqual([
      ['extension-point-invalid', { shopId: SHOP, extension: 'X1', place: 'id' }],
      ['extension-point-invalid', { shopId: SHOP, extension: 'requests', place: 'product' }],
    ]);
  });
});

describe('extPoints в коде магазина', () => {
  it('codeOf: места есть — code.extPoints; нет или пусто — ключа нет', () => {
    const shop = codeOf([], {}, contextOf({ requests: REQUESTS_POINTS }).context);
    expect(shop.code.extPoints).toEqual({ requests: REQUESTS_POINTS });
    expect('extPoints' in codeOf([], {}, contextOf().context).code).toBe(false);
    expect('extPoints' in codeOf([], {}, contextOf({}).context).code).toBe(false);
  });

  it('readShopCode — места и части мест включённых расширений из extensions.enabledForShop', async () => {
    const db: Queryable = { query: vi.fn().mockResolvedValue({ rows: [{ sections: {}, menus: [] }] }) };
    const answer = { success: true, data: [{ id: 'requests', version: '1.0.0', storefront: REQUESTS_STOREFRONT }] };
    const deps: CodeDeps = {
      db,
      shell: SHELL,
      call: () => Promise.resolve(answer),
      timeoutMs: 1_000,
      log: () => undefined,
      rows: () => Promise.resolve([]),
    };
    const shop = await readShopCode(deps, SHOP);
    expect([shop?.code.extPoints, shop?.code.extPointParts]).toEqual([{ requests: REQUESTS_POINTS }, ['purchase', 'records']]);
  });
});
