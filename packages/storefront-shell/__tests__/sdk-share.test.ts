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

// Копирование текста (share.copy): значение из data-text кнопки. Есть буфер обмена — пишет в него, нет или он отказал —
// запасной способ (скрытое поле и execCommand('copy')). «Скопировано» уходит тем же путём, что прочие уведомления ядра.
describe('copy: скопировать текст', () => {
  const TEXT = 'SALE-2026';
  // Тексты, которые пришли в navigator.clipboard.writeText.
  const clipboardStub = () => {
    const written: string[] = [];
    const clipboard = {
      writeText: (text: string): Promise<void> => {
        written.push(text);
        return Promise.resolve();
      },
    };
    return { written, clipboard };
  };
  // document.execCommand: «команда:текст поля» на каждый вызов.
  const stubCopyCommand = (result: boolean): string[] => {
    const calls: string[] = [];
    const execCommand = (name: string): boolean => {
      calls.push(`${name}:${document.querySelector('textarea')?.value ?? ''}`);
      return result;
    };
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true, writable: true });
    return calls;
  };

  afterEach(() => {
    Reflect.deleteProperty(document, 'execCommand');
    document.body.replaceChildren();
  });

  it('есть буфер обмена: пишет туда, уведомление «Скопировано»', async () => {
    const stub = clipboardStub();
    stubNavigator({ clipboard: stub.clipboard });
    const fake = fakeCore();
    expect(await share.create(fake.core).copy({ text: TEXT })).toEqual({ ok: true, data: {} });
    expect(stub.written).toEqual([TEXT]);
    expect(fake.named('merfy:notice:show')).toEqual([{ level: 'warning', message: 'Скопировано' }]);
  });

  it('буфера нет: запасной способ — скрытое поле с текстом, команда copy, поле убрано', async () => {
    stubNavigator({});
    const calls = stubCopyCommand(true);
    const fake = fakeCore();
    expect(await share.create(fake.core).copy({ text: TEXT })).toEqual({ ok: true, data: {} });
    expect(calls).toEqual([`copy:${TEXT}`]);
    expect(document.querySelector('textarea')).toBeNull();
    expect(fake.named('merfy:notice:show')).toEqual([{ level: 'warning', message: 'Скопировано' }]);
  });

  it('буфер отказал (нет разрешения): запасной способ, фокус возвращается на кнопку', async () => {
    stubNavigator({ clipboard: { writeText: () => Promise.reject(new DOMException('нет', 'NotAllowedError')) } });
    const calls = stubCopyCommand(true);
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    expect((await share.create(fakeCore().core).copy({ text: TEXT })).ok).toBe(true);
    expect(calls).toEqual([`copy:${TEXT}`]);
    expect(document.activeElement).toBe(button);
  });

  it('ни буфера, ни команды: ошибка server и уведомление; quiet — без уведомления', async () => {
    stubNavigator({});
    const fake = fakeCore();
    const failed = await share.create(fake.core).copy({ text: TEXT });
    expect(failed.ok).toBe(false);
    expect(fake.named('merfy:notice:show')).toHaveLength(1);
    const quiet = fakeCore();
    expect((await share.create(quiet.core).copy({ text: TEXT }, { quiet: true })).ok).toBe(false);
    expect(quiet.named('merfy:notice:show')).toEqual([]);
  });

  it('запасной способ отказал (команда вернула false) — ошибка server, поле убрано', async () => {
    stubNavigator({});
    stubCopyCommand(false);
    expect((await share.create(fakeCore().core).copy({ text: TEXT })).ok).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('пустой текст — ошибка invalid для автора, уведомления покупателю нет', async () => {
    const stub = clipboardStub();
    stubNavigator({ clipboard: stub.clipboard });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = fakeCore();
    const result = await share.create(fake.core).copy({ text: '' });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(stub.written).toEqual([]);
    expect(fake.named('merfy:notice:show')).toEqual([]);
    expect(error).toHaveBeenCalled();
  });

  it('в таблице действий: модуль share, параметр разметки text; разметка берёт значение из data-text', async () => {
    expect(ACTIONS['share.copy'].module).toBe('share');
    expect(ACTIONS['share.copy'].markup).toEqual({ text: 'text' });
    const stub = clipboardStub();
    stubNavigator({ clipboard: stub.clipboard });
    const action = share.markup?.copy;
    expect(action?.params).toEqual(['text']);
    await action?.call(share.create(fakeCore().core), { text: TEXT });
    expect(stub.written).toEqual([TEXT]);
  });
});
