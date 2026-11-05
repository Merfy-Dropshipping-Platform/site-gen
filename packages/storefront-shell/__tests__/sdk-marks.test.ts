import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_TOKEN_KEY } from '../src/core/customer-token';
import { FAVORITES_KEY, favorites } from '../src/core/parts/favorites';
import { marks } from '../src/core/parts/marks';
import { MARKS_HTML } from '../src/core/roles';
import { atom, readable, watchSource } from '../src/core/stores';
import type { CoreHandle, FavoritesModule, InstanceHost, Modules, ReadableStore } from '../src/core/types';
import { fakeCore } from './sdk-support';

// Метки без скрипта секции (владелец 06.11: «логика если была поставлена, то работала»): секция ставит только разметку,
// отметку на сердечке, счётчики и ссылку профиля ведёт часть marks.
const HEART = (id: string): string =>
  `<button type="button" data-action="favorites.toggle" data-product-id="${id}"><svg fill="none"></svg></button>`;
const BADGE = (name: string, hidden = true): string => `<span data-ref="${name}"${hidden ? ' hidden' : ''}>0</span>`;
const PROFILE = '<a data-ref="profile" href="/login">Профиль</a>';

let abort: AbortController;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await vi.advanceTimersByTimeAsync(0);
};

const sectionOf = (html: string): HTMLElement => {
  const element = document.createElement('merfy-section');
  element.innerHTML = html;
  document.body.append(element);
  return element;
};

const hostOf = (element: HTMLElement): InstanceHost => ({
  element,
  name: 'shop:lookbook',
  id: 'lookbook-1',
  mode: 'live',
  signal: abort.signal,
});

const isModule = <N extends keyof Modules>(api: unknown): api is Modules[N] => api !== undefined;

function started(element: HTMLElement) {
  const base = fakeCore().core;
  const api = favorites.create(base);
  const cartCount = atom(0);
  const customer = atom<{ ready: boolean; customer: { email: string } | null }>({ ready: true, customer: null });
  const modules: Record<string, unknown> = {
    favorites: api,
    cart: { $count: readable(cartCount) },
    customer: { $customer: readable(customer) },
  };
  const core: CoreHandle = {
    ...base,
    part: <N extends keyof Modules>(name: N): Modules[N] => {
      const api = modules[name];
      if (!isModule<N>(api)) throw new Error(`части ${name} в тесте нет`);
      return api;
    },
    watch: <T>(store: ReadableStore<T>, listener: (value: T) => void) =>
      watchSource(store)?.listen(listener) ?? (() => undefined),
  };
  marks.attach?.(marks.create(core), hostOf(element));
  return { api, cartCount, customer };
}

const pressed = (element: HTMLElement, id: string): string | null | undefined =>
  element.querySelector(`[data-product-id="${id}"]`)?.getAttribute('aria-pressed');

const toggle = (api: FavoritesModule, productId: string) => api.toggle({ productId });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  document.body.innerHTML = '';
  abort = new AbortController();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  abort.abort();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('метки без скрипта секции', () => {
  it('сердечко отмечается и снимается по стору', async () => {
    const element = sectionOf(HEART('p1') + HEART('p2'));
    const { api } = started(element);
    expect(pressed(element, 'p1')).toBe('false');

    await toggle(api, 'p1');
    expect(pressed(element, 'p1')).toBe('true');
    expect(pressed(element, 'p2')).toBe('false');

    await toggle(api, 'p1');
    expect(pressed(element, 'p1')).toBe('false');
  });

  it('уже отмеченный товар виден сразу при входе на страницу', () => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify({ ids: [{ productId: 'p1', addedAt: 1 }] }));
    const element = sectionOf(HEART('p1'));
    started(element);
    expect(pressed(element, 'p1')).toBe('true');
  });

  it('счётчик избранного показывает число и скрыт при нуле', async () => {
    const element = sectionOf(BADGE('favorites-count'));
    const { api } = started(element);
    const badge = element.querySelector<HTMLElement>('[data-ref="favorites-count"]');
    expect(badge?.hidden).toBe(true);

    await toggle(api, 'p1');
    expect(badge?.textContent).toBe('1');
    expect(badge?.hidden).toBe(false);

    await toggle(api, 'p1');
    expect(badge?.hidden).toBe(true);
  });

  it('счётчик корзины идёт за стором', () => {
    const element = sectionOf(BADGE('cart-count'));
    const { cartCount } = started(element);
    cartCount.set(3);
    const badge = element.querySelector<HTMLElement>('[data-ref="cart-count"]');
    expect(badge?.textContent).toBe('3');
    expect(badge?.hidden).toBe(false);
  });

  it('счётчик, видимый в дизайне при нуле, остаётся на месте: «Корзина (0)»', () => {
    const element = sectionOf(`Корзина (${BADGE('cart-count', false)})`);
    const { cartCount } = started(element);
    const badge = element.querySelector<HTMLElement>('[data-ref="cart-count"]');
    expect(badge?.hidden).toBe(false);

    cartCount.set(2);
    cartCount.set(0);
    expect(badge?.textContent).toBe('0');
    expect(badge?.hidden).toBe(false);
  });

  it('ссылка профиля ведёт в кабинет после входа', async () => {
    const element = sectionOf(PROFILE);
    const { customer } = started(element);
    await settle();
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/login');

    customer.set({ ready: true, customer: { email: 'a@b.ru' } });
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/account');
  });

  it('карточка, дорисованная позже, тоже получает отметку', async () => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify({ ids: [{ productId: 'p2', addedAt: 1 }] }));
    const element = sectionOf(`${HEART('p1')}<ul></ul>`);
    started(element);

    element.querySelector('ul')?.insertAdjacentHTML('beforeend', `<li>${HEART('p2')}</li>`);
    await settle();
    expect(pressed(element, 'p2')).toBe('true');
  });

  it('метка только в <template> секции: строка получит отметку', async () => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify({ ids: [{ productId: 'p3', addedAt: 1 }] }));
    const element = sectionOf(`<template>${HEART('p3')}</template><ul></ul>`);
    started(element);

    element.querySelector('ul')?.insertAdjacentHTML('beforeend', `<li>${HEART('p3')}</li>`);
    await settle();
    expect(pressed(element, 'p3')).toBe('true');
  });

  it('секция без меток не подписывается: список вошедшей не читается', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, 't-1');
    started(sectionOf('<p>Текст</p>'));
    await settle();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('после снятия секции метки не меняются', async () => {
    const element = sectionOf(HEART('p1'));
    const { api } = started(element);
    abort.abort();

    await toggle(api, 'p1');
    expect(pressed(element, 'p1')).toBe('false');
  });

  it('шаблон сборки видит каждую метку и не срабатывает на обычной разметке', () => {
    for (const html of [HEART('p1'), BADGE('favorites-count'), BADGE('cart-count'), PROFILE])
      expect(MARKS_HTML.test(html)).toBe(true);
    expect(MARKS_HTML.test('<a href="/wishlist">Избранное</a>')).toBe(false);
  });
});
