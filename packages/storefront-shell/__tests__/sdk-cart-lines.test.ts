import { afterEach, describe, expect, it, vi } from 'vitest';
import { linesOf, totalsOf } from '../src/core/cart-lines';
import { readCart } from '../src/core/cart-server';
import { requestJson } from '../src/core/requests';
import { API_URL, SHOP_ID, cartLine, fakeGateway, serverItem } from './sdk-support';

// Строки и итоги корзины из ответа orders (блок 10 «Секций и SDK», 10.1, «Решил сам» п. 2; часть 10а, Р10а-1, Р10а-2) и
// запросы PATCH, PUT, DELETE с токеном покупателя (п. 17). Форма ответа — GET /store/carts/:id шлюза: { cart, items }.
const CART = {
  id: 'c-1',
  subtotalCents: 498000,
  discountCents: 49800,
  totalCents: 448200,
  promoCode: 'AUTO:Осень',
  extensionDiscountCents: 0,
};
const rub = (amount: number) => ({ amount, currency: 'RUB' });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('строки корзины', () => {
  it('название, фото, варианты, сумма строки — из ответа orders', () => {
    const item = {
      ...serverItem('l-1', 'p12', 2, 'v-red'),
      imageUrl: 'https://img.example/scarf.jpg',
      options: { Цвет: 'Красный' },
      totalCents: 448200,
    };
    expect(linesOf({ cart: CART, items: [item] }, 'RUB')).toEqual([
      {
        ...cartLine('l-1', 'p12', 2, 'v-red'),
        image: 'https://img.example/scarf.jpg',
        options: { Цвет: 'Красный' },
        total: rub(448200),
      },
    ]);
  });

  it('подарок акции — gift: true', () => {
    const item = { ...serverItem('l-2', 'p12', 1), unitPriceCents: 0, totalCents: 0, isBonus: true };
    expect(linesOf({ cart: CART, items: [item] }, 'RUB')?.[0]).toMatchObject({
      gift: true,
      price: rub(0),
      total: rub(0),
    });
  });

  it('нет name, imageUrl, options, totalCents — пустое название, без фото и вариантов, сумма — цена × штуки', () => {
    const item = { id: 'l-1', productId: 'p12', variantCombinationId: null, quantity: 3, unitPriceCents: 1000 };
    expect(linesOf({ items: [item] }, 'RUB')).toEqual([
      {
        id: 'l-1',
        productId: 'p12',
        variantId: null,
        quantity: 3,
        price: rub(1000),
        title: '',
        image: null,
        options: {},
        total: rub(3000),
        gift: false,
      },
    ]);
  });

  it('варианты не строкой — их нет; options не объект — вариантов нет', () => {
    const odd = { ...serverItem('l-1', 'p12', 1), options: { Цвет: 'Красный', Размер: 42, Длина: null } };
    const list = { ...serverItem('l-2', 'p12', 1), options: ['Красный'] };
    expect(linesOf({ items: [odd, list] }, 'RUB')?.map((line) => line.options)).toEqual([{ Цвет: 'Красный' }, {}]);
  });
});

describe('итоги корзины', () => {
  it('сумма, скидка, имя автоматической скидки, скидка расширения, итог', () => {
    expect(totalsOf({ cart: { ...CART, extensionDiscountCents: 10000 }, items: [] }, 'RUB')).toEqual({
      ready: true,
      subtotal: rub(498000),
      discount: rub(49800),
      discountName: 'Осень',
      extensionDiscount: rub(10000),
      total: rub(448200),
    });
  });

  it('промокод покупательницы и пустой промокод — имени нет; скидки расширения нет в ответе — 0', () => {
    // lint пакета: неиспользуемая переменная вычёркивания не разрешена — тот же bare без ключа (правило 24.10).
    const bare: Record<string, unknown> = { ...CART };
    delete bare.extensionDiscountCents;
    expect(totalsOf({ cart: { ...bare, promoCode: 'SALE10' }, items: [] }, 'RUB')).toMatchObject({
      discountName: null,
      extensionDiscount: rub(0),
    });
    expect(totalsOf({ cart: { ...CART, promoCode: null }, items: [] }, 'RUB')?.discountName).toBeNull();
    expect(totalsOf({ cart: { ...CART, promoCode: 'AUTO:' }, items: [] }, 'RUB')?.discountName).toBeNull();
  });

  it('нет cart или сумма не целое от 0 — null', () => {
    expect(totalsOf({ items: [] }, 'RUB')).toBeNull();
    expect(totalsOf({ cart: { ...CART, totalCents: -1 }, items: [] }, 'RUB')).toBeNull();
    expect(totalsOf({ cart: { ...CART, subtotalCents: '4980' }, items: [] }, 'RUB')).toBeNull();
  });

  it('readCart отдаёт строки и итоги одного ответа; ответ без итогов — totals: null', async () => {
    const gateway = fakeGateway();
    gateway.answer(
      'GET /store/carts/c-1',
      { status: 200, body: { cart: CART, items: [serverItem('l-1', 'p12', 2)] } },
      { status: 200, body: { cart: { id: 'c-1' }, items: [] } },
    );
    const api = { url: API_URL, storeId: SHOP_ID, currency: 'RUB' };
    expect(await readCart(api, 'c-1')).toMatchObject({ kind: 'lines', totals: { ready: true, total: rub(448200) } });
    expect(await readCart(api, 'c-1')).toEqual({ kind: 'lines', lines: [], totals: null });
  });
});

describe('запросы', () => {
  it('PATCH, DELETE, PUT; токен — заголовок Authorization: Bearer; без тела и токена — без заголовков', async () => {
    // lint пакета: неиспользуемые параметры не разрешены — тип шлюза задаёт типизированный хелпер (правило 24.10).
    type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    const fetchSpy = vi.fn<FetchLike>(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchSpy);
    await requestJson(`${API_URL}/x`, { method: 'PATCH', body: { quantity: 2 } });
    await requestJson(`${API_URL}/x`, { method: 'DELETE' });
    await requestJson(`${API_URL}/x`, { method: 'PUT', body: { ids: [] }, token: 'tok' });
    await requestJson(`${API_URL}/x`, { method: 'GET', token: 'tok' });
    const inits = fetchSpy.mock.calls.map(([, init]) => [init?.method, init?.headers ?? null, init?.body ?? null]);
    expect(inits).toEqual([
      ['PATCH', { 'content-type': 'application/json' }, '{"quantity":2}'],
      ['DELETE', null, null],
      ['PUT', { 'content-type': 'application/json', authorization: 'Bearer tok' }, '{"ids":[]}'],
      ['GET', { authorization: 'Bearer tok' }, null],
    ]);
  });
});
