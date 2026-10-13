import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FLUSH_DELAY_MS,
  MAX_MESSAGE_LENGTH,
  MAX_RECORDS,
  listenSectionErrors,
  recordOf,
  type ErrorLogDeps,
} from '../src/error-log';
import { SECTION_ERROR_EVENT, type SectionFailure } from '../src/report';
import { startShell, type Shell } from '../src/start';
import { watchFailures } from './support';

const HASH = 'a'.repeat(64);
const SHOP_ID = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const ENDPOINT = 'https://gateway.dev.merfy.ru/api/storefront/section-errors';

const failure = (fields: Partial<SectionFailure> = {}): SectionFailure => ({
  section: 'nova:scarf-colors',
  src: `/_merfy/m/${HASH}.js`,
  stage: 'mount',
  message: 'сломалась при запуске',
  ...fields,
});

// Документ страницы без jsdom: видимость меняет сам тест.
class Page extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';

  hide(): void {
    this.visibilityState = 'hidden';
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

// Канал с подставными отправкой и таймером: тест сам решает, когда «прошли» 2 с.
function openChannel() {
  const target = new EventTarget();
  const page = new Page();
  const sent: Array<{ url: string; body: unknown }> = [];
  const timers: Array<{ run: () => void; ms: number }> = [];
  const controller = new AbortController();
  const deps: ErrorLogDeps = {
    target,
    document: page,
    send: (url, body) => {
      sent.push({ url, body: JSON.parse(body) });
    },
    later: (run, ms) => {
      timers.push({ run, ms });
    },
    url: ENDPOINT,
    shopId: SHOP_ID,
    signal: controller.signal,
  };
  listenSectionErrors(deps);
  const report = (fields: Partial<SectionFailure> = {}): void => {
    target.dispatchEvent(new CustomEvent(SECTION_ERROR_EVENT, { detail: failure(fields) }));
  };
  const runTimers = (): void => timers.splice(0).forEach((timer) => timer.run());
  return { sent, timers, page, report, runTimers, stop: () => controller.abort() };
}

describe('запись об ошибке секции', () => {
  it.each([[`/_merfy/m/${HASH}.js`], [`https://shop.example/_merfy/m/${HASH}.js?merfy-retry=1`]])(
    'отпечаток скрипта — из адреса модуля %s',
    (src) => {
      expect(recordOf(failure({ src }))).toEqual({
        section: 'nova:scarf-colors',
        script: HASH,
        stage: 'mount',
        message: 'сломалась при запуске',
      });
    },
  );

  it.each([
    ['адрес не по отпечатку', { ...failure(), src: '/m/scarf.js' }],
    ['адреса нет', { ...failure(), src: '' }],
    ['чужая стадия', { ...failure(), stage: 'boot' }],
    ['не объект', null],
  ])('%s — записи нет', (_case, detail) => {
    expect(recordOf(detail)).toBeNull();
  });

  it('текст — не длиннее 300 знаков', () => {
    const record = recordOf(failure({ message: 'я'.repeat(500) }));
    expect(record?.message).toHaveLength(MAX_MESSAGE_LENGTH);
  });
});

describe('канал ошибок', () => {
  it('две ошибки — одна пачка через 2 с: адрес шлюза, v, shopId и записи', () => {
    const channel = openChannel();
    channel.report();
    channel.report({ section: 'reviews:list', stage: 'runtime', message: 'x is not a function' });
    expect(channel.sent).toEqual([]);
    expect(channel.timers.map((timer) => timer.ms)).toEqual([FLUSH_DELAY_MS]);
    channel.runTimers();
    expect(channel.sent).toEqual([
      {
        url: ENDPOINT,
        body: {
          v: 1,
          shopId: SHOP_ID,
          errors: [
            { section: 'nova:scarf-colors', script: HASH, stage: 'mount', message: 'сломалась при запуске' },
            { section: 'reviews:list', script: HASH, stage: 'runtime', message: 'x is not a function' },
          ],
        },
      },
    ]);
  });

  it('повтор той же ошибки не шлётся', () => {
    const channel = openChannel();
    channel.report();
    channel.runTimers();
    channel.report();
    channel.runTimers();
    expect(channel.sent).toHaveLength(1);
    expect(channel.timers).toEqual([]);
  });

  it('на страницу — не больше 10 записей', () => {
    const channel = openChannel();
    Array.from({ length: 12 }, (_, index) => channel.report({ message: `ошибка ${index}` }));
    channel.runTimers();
    channel.report({ message: 'ошибка после пачки' });
    channel.runTimers();
    const first = Array.from({ length: MAX_RECORDS }, (_, index) => ({ message: `ошибка ${index}` }));
    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0]?.body).toMatchObject({ errors: first });
  });

  it('страница ушла в фон — пачка уходит сразу, пустая не уходит', () => {
    const channel = openChannel();
    channel.report();
    channel.page.hide();
    channel.page.hide();
    expect(channel.sent).toHaveLength(1);
    channel.runTimers();
    expect(channel.sent).toHaveLength(1);
  });

  it('ядро остановлено — ошибки не копятся', () => {
    const channel = openChannel();
    channel.stop();
    channel.report();
    channel.page.hide();
    expect(channel.timers).toEqual([]);
    expect(channel.sent).toEqual([]);
  });
});

describe('канал ошибок в ядре', () => {
  const MODULE = { kind: 'section', name: 'nova:scarf-colors', src: `/_merfy/m/${HASH}.js` };
  const config = (mode: string) => ({
    v: 1,
    mode,
    shop: { id: SHOP_ID, name: 'Шарфы', url: 'https://scarves.example' },
    currency: 'RUB',
    locale: 'ru-RU',
    api: { url: 'https://gateway.dev.merfy.ru/api' },
    theme: { id: 'nova', version: '0.0.4' },
    page: { id: 'home', path: '/' },
  });
  const tag = (id: string, value: unknown): string =>
    `<script type="application/json" id="${id}">${JSON.stringify(value)}</script>`;
  const beacon = vi.fn<(url: string, body: string) => boolean>(() => true);
  let watch: ReturnType<typeof watchFailures>;
  let shell: Shell | undefined;

  beforeEach(() => {
    watch = watchFailures();
    Object.defineProperty(window.navigator, 'sendBeacon', { configurable: true, value: beacon });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  });

  afterEach(() => {
    shell?.stop();
    shell = undefined;
    watch.stop();
    beacon.mockClear();
    Reflect.deleteProperty(window.navigator, 'sendBeacon');
    Reflect.deleteProperty(document, 'visibilityState');
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  async function startWith(mode: string): Promise<void> {
    document.head.innerHTML = tag('merfy-config', config(mode)) + tag('merfy-modules', { v: 1, modules: [MODULE] });
    shell = startShell({ window, importModule: () => Promise.reject(new TypeError('Failed to fetch')) });
    await shell.ready;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('витрина (live): модуль не загрузился — запись уходит в шлюз', async () => {
    await startWith('live');
    expect(watch.failures).toHaveLength(1);
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, body] = beacon.mock.calls[0] ?? [];
    expect(url).toBe(ENDPOINT);
    expect(JSON.parse(body ?? '')).toEqual({
      v: 1,
      shopId: SHOP_ID,
      errors: [{ section: 'nova:scarf-colors', script: HASH, stage: 'load', message: 'Failed to fetch' }],
    });
  });

  it('превью — ядро ничего не шлёт', async () => {
    await startWith('preview');
    expect(watch.failures).toHaveLength(1);
    expect(beacon).not.toHaveBeenCalled();
  });
});
