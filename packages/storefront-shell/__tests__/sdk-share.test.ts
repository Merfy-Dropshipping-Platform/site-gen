import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIONS } from '../src/core/action-catalog';
import { share } from '../src/core/parts/share';
import { fakeCore } from './sdk-support';

// Часть share (базовые секции, 29.10): окно «Поделиться» системы с названием и адресом страницы, нет окна — адрес в
// буфер обмена, как у «Товара» flux и vanilla на проде. Закрытое окно — не ошибка.
const URL_NOW = 'https://scarves.example/products/scarf';
const TITLE = 'Шарф — Шарфы';

function stubNavigator(parts: { share?: unknown; clipboard?: unknown }): void {
  vi.stubGlobal('navigator', { ...parts });
}

beforeEach(() => {
  document.title = TITLE;
  window.history.replaceState(null, '', new URL(URL_NOW).pathname);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('часть share', () => {
  it('есть окно системы: название и адрес страницы, ответ method share', async () => {
    const sent = vi.fn(() => Promise.resolve());
    stubNavigator({ share: sent });
    const result = await share.create(fakeCore().core).page();
    expect(result).toEqual({ ok: true, data: { method: 'share' } });
    expect(sent).toHaveBeenCalledWith({ title: TITLE, url: window.location.href });
  });

  it('окно закрыли, не выбрав (AbortError), — не ошибка и адрес не копируется', async () => {
    const write = vi.fn(() => Promise.resolve());
    stubNavigator({
      share: () => Promise.reject(new DOMException('Share canceled', 'AbortError')),
      clipboard: { writeText: write },
    });
    const fake = fakeCore();
    expect(await share.create(fake.core).page()).toEqual({ ok: true, data: { method: 'share' } });
    expect(write).not.toHaveBeenCalled();
    expect(fake.named('merfy:notice:show')).toEqual([]);
  });

  it('окна нет — адрес страницы в буфер обмена, ответ method copy', async () => {
    const write = vi.fn(() => Promise.resolve());
    stubNavigator({ clipboard: { writeText: write } });
    expect(await share.create(fakeCore().core).page()).toEqual({ ok: true, data: { method: 'copy' } });
    expect(write).toHaveBeenCalledWith(window.location.href);
  });

  it('окно отказало (не AbortError) — запасной путь: адрес в буфер обмена', async () => {
    const write = vi.fn(() => Promise.resolve());
    stubNavigator({
      share: () => Promise.reject(new DOMException('нет разрешения', 'NotAllowedError')),
      clipboard: { writeText: write },
    });
    expect(await share.create(fakeCore().core).page()).toEqual({ ok: true, data: { method: 'copy' } });
    expect(write).toHaveBeenCalledWith(window.location.href);
  });

  it('нет ни окна, ни буфера — ошибка server и уведомление', async () => {
    stubNavigator({});
    const fake = fakeCore();
    const result = await share.create(fake.core).page();
    expect(result.ok).toBe(false);
    expect(fake.named('merfy:notice:show')).toHaveLength(1);
  });

  it('буфер отказал — ошибка server; quiet: true — без уведомления', async () => {
    stubNavigator({ clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
    const fake = fakeCore();
    const result = await share.create(fake.core).page({ quiet: true });
    expect(result.ok).toBe(false);
    expect(fake.named('merfy:notice:show')).toEqual([]);
  });
});

describe('действие share.page', () => {
  it('в таблице действий: модуль share, разметка без параметров', () => {
    expect(ACTIONS['share.page'].module).toBe('share');
    expect(ACTIONS['share.page'].markup).toEqual({});
  });

  it('разметка вызывает page() части', async () => {
    const sent = vi.fn(() => Promise.resolve());
    stubNavigator({ share: sent });
    const api = share.create(fakeCore().core);
    const action = share.markup?.page;
    expect(action?.params).toEqual([]);
    expect(await action?.call(api, {})).toEqual({ ok: true, data: { method: 'share' } });
    expect(sent).toHaveBeenCalledTimes(1);
  });
});
