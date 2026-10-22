import { afterEach, describe, expect, it, vi } from 'vitest';
import { REQUEST_TIMEOUT_MS, requestJson } from '../src/core/requests';
import { API_URL, fakeGateway } from './sdk-support';

// Запрос к шлюзу (блок 9, «Решил сам» п. 4): JSON, срок 10 с, без повтора; не бросает.
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('requestJson', () => {
  it('POST — тело JSON с content-type; ответ — статус и разобранное тело', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', { status: 201, body: { cart: { id: 'c-1' } } });
    const reply = await requestJson(`${API_URL}/store/carts`, { method: 'POST', body: { store_id: 's-1' } });
    expect(reply).toEqual({ status: 201, body: { cart: { id: 'c-1' } } });
    expect(gateway.calls).toEqual([{ key: 'POST /store/carts', body: { store_id: 's-1' } }]);
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  });

  it('GET — без тела; ошибка шлюза — статус и тело как есть', async () => {
    const gateway = fakeGateway();
    gateway.answer('GET /store/carts/c-1', { status: 404, body: { message: 'Cart not found' } });
    expect(await requestJson(`${API_URL}/store/carts/c-1`, { method: 'GET' })).toEqual({
      status: 404,
      body: { message: 'Cart not found' },
    });
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it('тело не JSON — body null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('<html>502 Bad Gateway</html>', { status: 502 }))),
    );
    expect(await requestJson(`${API_URL}/store/carts`, { method: 'GET' })).toEqual({ status: 502, body: null });
  });

  it('обрыв — status 0, без исключения', async () => {
    const gateway = fakeGateway();
    gateway.answer('GET /store/carts/c-1', 'network');
    expect(await requestJson(`${API_URL}/store/carts/c-1`, { method: 'GET' })).toEqual({ status: 0, body: null });
  });

  it('нет ответа 10 с — запрос отменён, status 0', async () => {
    vi.useFakeTimers();
    const gateway = fakeGateway();
    gateway.answer('GET /store/carts/c-1', 'hang');
    const pending = requestJson(`${API_URL}/store/carts/c-1`, { method: 'GET' });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ status: 0, body: null });
    expect(signal?.aborted).toBe(true);
    expect(REQUEST_TIMEOUT_MS).toBe(10_000);
  });
});
