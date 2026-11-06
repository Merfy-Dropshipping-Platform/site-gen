import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navigation } from '../src/core/navigation';
import { CART_ID_KEY, cart } from '../src/core/parts/cart';
import { linkHold } from '../src/core/parts/link-hold';
import { REQUEST_TIMEOUT_MS } from '../src/core/requests';
import type { CartModule, CoreHandle, Modules } from '../src/core/types';
import { SHOP_ID, fakeCore, fakeGateway, gate, serverItem } from './sdk-support';

// Потеря товара (06.11): счётчик прибавил, запрос ещё идёт, покупатель нажал ссылку — переход рвал запрос, /cart пустой.
const CART = { id: 'c-1', shopId: SHOP_ID, status: 'cart' };
const created = { status: 201, body: { cart: CART } };
const itemReply = { status: 201, body: { item: serverItem('l-1', 'p12', 1) } };
const CREATE = 'POST /store/carts';
const ITEM = 'POST /store/carts/c-1/items';

const go = vi.fn();

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await vi.advanceTimersByTimeAsync(0);
};

const isCart = <N extends keyof Modules>(api: CartModule): api is CartModule & Modules[N] => api !== undefined;

function started(mode: 'live' | 'preview' = 'live'): CartModule {
  const base = fakeCore(mode).core;
  const module = cart.create(base);
  const core: CoreHandle = {
    ...base,
    part: <N extends keyof Modules>(): Modules[N] => {
      if (!isCart<N>(module)) throw new Error('корзины в тесте нет');
      return module;
    },
  };
  linkHold.create(core);
  return module;
}

const linkOf = (attributes: string): HTMLAnchorElement => {
  document.body.insertAdjacentHTML('beforeend', `<a ${attributes}><span>Ссылка</span></a>`);
  const link = document.body.lastElementChild;
  if (!(link instanceof HTMLAnchorElement)) throw new Error('нет ссылки');
  return link;
};

// Нажатие: true — браузер перешёл бы сам, false — переход отменён.
const click = (node: Element, init: MouseEventInit = {}): boolean =>
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.spyOn(navigation, 'go').mockImplementation(go);
  go.mockClear();
});

// Слушатель части живёт до конца страницы: зависший запрос прошлого теста не должен держать ссылки в следующем.
afterEach(async () => {
  await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
  await settle();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('переход во время добавления в корзину', () => {
  it('ссылка ждёт оба запроса и ведёт туда же, товар сохранён', async () => {
    const gateway = fakeGateway();
    const open = gate();
    gateway.answer(CREATE, created);
    gateway.answer(ITEM, { ...itemReply, gate: open.promise });
    const module = started();

    void module.add({ productId: 'p12' });
    expect(click(linkOf('href="/cart"').querySelector('span') ?? document.body)).toBe(false);
    await settle();
    expect(gateway.keys()).toContain(ITEM);
    expect(go).not.toHaveBeenCalled();

    open.open();
    await settle();
    expect(go).toHaveBeenCalledExactlyOnceWith(new URL('/cart', window.location.href).href);
    expect(localStorage.getItem(CART_ID_KEY)).toBe('c-1');
    expect(module.$cart.get().lines).toHaveLength(1);
  });

  it('сбой шлюза не запирает покупателя на странице', async () => {
    const gateway = fakeGateway();
    gateway.answer(CREATE, 'hang');
    const module = started();

    void module.add({ productId: 'p12' });
    expect(click(linkOf('href="/catalog"'))).toBe(false);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await settle();
    expect(go).toHaveBeenCalledOnce();
  });

  it('без добавления ссылка работает сама', () => {
    fakeGateway();
    started();
    expect(click(linkOf('href="/cart"'))).toBe(true);
    expect(go).not.toHaveBeenCalled();
  });

  it('новая вкладка, скачивание, якорь и почта не ждут', () => {
    const gateway = fakeGateway();
    gateway.answer(CREATE, 'hang');
    const module = started();
    void module.add({ productId: 'p12' });

    expect(click(linkOf('href="/cart" target="_blank"'))).toBe(true);
    expect(click(linkOf('href="/price.pdf" download'))).toBe(true);
    expect(click(linkOf('href="#reviews"'))).toBe(true);
    expect(click(linkOf('href="mailto:a@b.ru"'))).toBe(true);
    expect(click(linkOf('href="/cart"'), { ctrlKey: true })).toBe(true);
  });

  it('ссылка, которую уже забрало действие секции, не трогается', () => {
    const gateway = fakeGateway();
    gateway.answer(CREATE, 'hang');
    const module = started();
    void module.add({ productId: 'p12' });

    const link = linkOf('href="/cart"');
    link.addEventListener('click', (event) => event.preventDefault());
    click(link);
    expect(go).not.toHaveBeenCalled();
  });

  it('в превью переход не задерживается', () => {
    const gateway = fakeGateway();
    gateway.answer(CREATE, 'hang');
    const module = started('preview');
    void module.add({ productId: 'p12' });
    expect(click(linkOf('href="/cart"'))).toBe(true);
  });

  it('запрос с телом переживает уход со страницы, чтение — нет', async () => {
    const gateway = fakeGateway();
    gateway.answer(CREATE, created);
    gateway.answer(ITEM, itemReply);
    const module = started();

    await module.add({ productId: 'p12' });
    const inits = vi.mocked(fetch).mock.calls.map(([, init]) => init);
    expect(inits.filter((init) => init?.method === 'POST').every((init) => init?.keepalive === true)).toBe(true);
    expect(inits.filter((init) => init?.method === 'GET').some((init) => init?.keepalive === true)).toBe(false);
  });
});
