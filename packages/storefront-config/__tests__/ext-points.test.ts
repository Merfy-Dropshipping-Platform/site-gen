import { describe, expect, it } from 'vitest';
import { buildStorefrontConfig, type StorefrontConfigInput } from '../src/build';
import { extensionPointsOf, storefrontExtPointsSchema } from '../src/ext-points';
import { checkStorefrontConfig } from '../src/schema';
import { withField } from './support';

// Места блоков расширений (блок 15 «Секций и SDK», часть 15д): читатель раздела storefront манифеста и поле extPoints
// конфига страницы. REQUESTS — раздел storefront с dev 26.10 (GET /store/extensions/storefront магазина 3a9626f7);
// LOYALTY — копия формы раздела из extensions (manifest.schema.spec.ts, existingPoints).
const REQUESTS = {
  orders: { get: 'mineGetV2', list: 'mineListV2' },
  methods: { form: { fn: 'sectionFormV2' }, submit: { fn: 'sectionSubmitV2' } },
  product: { form: 'productFormV2', submit: 'submitV2' },
  sections: ['request-form'],
};
const LOYALTY = {
  cart: {
    note: { from: 'view', text: 'У вас {balance} бонусов — за этот заказ получите ещё {promised}', when: 'balance' },
  },
  checkout: { input: { use: 'boolean' }, control: { kind: 'toggle', key: 'use', label: 'Списать бонусы' } },
  account: {
    title: 'Бонусы',
    source: 'account',
    fields: [
      { key: 'balance', label: 'Баланс', kind: 'number' },
      { key: 'tier', label: 'Уровень', kind: 'tag' },
    ],
    list: { source: 'customerHistory', columns: ['at', 'kind', 'amount'] },
    copy: { key: 'referralLink', label: 'Ссылка для друга' },
    form: { fn: 'setBirthDate', fields: [{ key: 'birthDate', input: 'date', label: 'Дата рождения' }] },
  },
};
const POINTS = { requests: { orders: { list: 'mineListV2', get: 'mineGetV2' }, product: { form: 'productFormV2' } } };

const input = (extPoints?: StorefrontConfigInput['extPoints']): StorefrontConfigInput => ({
  site: { id: '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70', name: 'Шарфы', publicUrl: 'https://scarves.example' },
  theme: { id: 'nova', version: '0.0.4' },
  env: { apiUrl: 'https://gateway.dev.merfy.ru/api' },
  page: { id: 'home', path: '/' },
  mode: 'preview',
  ...(extPoints === undefined ? {} : { extPoints }),
});

describe('extensionPointsOf: места из раздела storefront манифеста', () => {
  it('orders и product без submit; методы и секции — не места', () => {
    expect(extensionPointsOf(REQUESTS)).toEqual({ points: POINTS.requests, invalid: [] });
  });

  it('заметка корзины без from, кабинет целиком; checkout — не место витрины', () => {
    const { points, invalid } = extensionPointsOf(LOYALTY);
    expect(invalid).toEqual([]);
    expect(points).toEqual({
      cart: { note: { text: LOYALTY.cart.note.text, when: 'balance' } },
      account: LOYALTY.account,
    });
  });

  it.each<[string, unknown]>([
    ['раздела нет', undefined],
    ['не объект', 'мусор'],
    ['только сторы и методы', { stores: {}, methods: {} }],
    ['заметки нет', { cart: {} }],
    ['форма — пустая строка', { product: { form: '' } }],
    ['у записей нет функции записи', { orders: { list: 'mineList' } }],
    ['кабинет пустой', { account: {} }],
  ])('%s — мест нет, ошибок нет', (_title, storefront) => {
    expect(extensionPointsOf(storefront)).toEqual({ points: {}, invalid: [] });
  });

  it('поле не того вида пропускается: пустая подпись, required не true, поле без ключа', () => {
    const account = {
      title: 'Бонусы',
      fields: [{ key: 'balance', label: '', required: 'да' }, { label: 'Без ключа' }, { key: 'tier', required: true }],
    };
    expect(extensionPointsOf({ account }).points).toEqual({
      account: { title: 'Бонусы', fields: [{ key: 'balance' }, { key: 'tier', required: true }] },
    });
  });

  it('место не по схеме — места нет, оно в invalid; остальные места на месте', () => {
    const storefront = {
      product: { form: 'product form!' },
      cart: { note: { text: 'б'.repeat(501) } },
      orders: { list: 'mineList', get: 'mineGet' },
    };
    expect(extensionPointsOf(storefront)).toEqual({
      points: { orders: { list: 'mineList', get: 'mineGet' } },
      invalid: ['cart', 'product'],
    });
  });
});

describe('extPoints в конфиге страницы', () => {
  it('места — в поле extPoints как есть; нет или пусто — поля нет', () => {
    expect(buildStorefrontConfig(input(POINTS)).extPoints).toEqual(POINTS);
    expect('extPoints' in buildStorefrontConfig(input())).toBe(false);
    expect('extPoints' in buildStorefrontConfig(input({}))).toBe(false);
  });

  it.each<[string, unknown]>([
    ['id расширения с заглавной', { Requests: POINTS.requests }],
    ['незнакомое место', { requests: { checkout: { input: {} } } }],
    ['лишнее поле места', { requests: { product: { form: 'productFormV2', submit: 'submitV2' } } }],
    ['функция не по правилу имени', { requests: { orders: { list: 'mine list', get: 'mineGet' } } }],
  ])('%s — ошибка схемы конфига', (_title, extPoints) => {
    expect(storefrontExtPointsSchema.safeParse(extPoints).success).toBe(false);
    expect(() => checkStorefrontConfig(withField('extPoints', extPoints))).toThrow();
  });
});
