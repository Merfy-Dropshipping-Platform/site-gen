import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_TOKEN_KEY } from '../src/core/customer-token';
import { navigation } from '../src/core/navigation';
import { start, type StartedCore } from '../src/core/start';
import { configTag, entry, placeSection } from './core-support';

// Страницы кабинета (блок 10 «Секций и SDK», «Решил сам» п. 20; часть 10в, Р10в-9): гостья без токена уходит на
// «Вход» с адресом возврата, секции страницы не запускаются; превью и вошедшая — без перехода.
let core: StartedCore | undefined;
let go: ReturnType<typeof vi.spyOn>;
const pageTag = (mode: 'live' | 'preview', id: string, path: string): string =>
  configTag(mode).replace('"page":{"id":"home","path":"/"}', `"page":{"id":"${id}","path":"${path}"}`);

function openPage(mode: 'live' | 'preview', id: string, path: string) {
  document.head.innerHTML = pageTag(mode, id, path);
  placeSection('shop:probe', 'probe-1');
  const mounted: string[] = [];
  core = start({ parts: [], sections: [entry('shop:probe', { mount: () => void mounted.push('probe') })] });
  return mounted;
}

beforeEach(() => {
  localStorage.clear();
  go = vi.spyOn(navigation, 'go').mockImplementation(() => undefined);
});

afterEach(() => {
  core?.stop();
  core = undefined;
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('страницы кабинета', () => {
  it('гостья на «Заказах» — переход на «Вход» с адресом и параметрами; секции не запущены', () => {
    window.history.replaceState(null, '', '/account/orders?n=1042');
    const mounted = openPage('live', 'page-orders', '/account/orders');
    expect(go).toHaveBeenCalledWith('/login?redirect=%2Faccount%2Forders%3Fn%3D1042');
    expect(mounted).toEqual([]);
  });

  it('вошедшая — без перехода, секции запущены', () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, 't-customer-1');
    window.history.replaceState(null, '', '/account/profile');
    expect(openPage('live', 'page-profile', '/account/profile')).toEqual(['probe']);
    expect(go).not.toHaveBeenCalled();
  });

  it('превью кабинета и другие страницы — без перехода', () => {
    expect(openPage('preview', 'page-profile', '/account/profile')).toEqual(['probe']);
    core?.stop();
    document.body.replaceChildren();
    expect(openPage('live', 'page-wishlist', '/wishlist')).toEqual(['probe']);
    expect(go).not.toHaveBeenCalled();
  });
});
