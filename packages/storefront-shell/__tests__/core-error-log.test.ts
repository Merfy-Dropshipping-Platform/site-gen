import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineSection } from '../src/core/define';
import { start, type StartedCore } from '../src/core/start';
import { FLUSH_DELAY_MS, recordOf } from '../src/error-log';
import { API_URL, SHOP_ID, configTag, entry, hash, placeSection, watchFailures } from './core-support';

// Журнал ошибок секций и ядро блока 5 (design.md блока 5, раздел 3.7; 3.12 — «три расхождения»): событие
// merfy:section:error на document, хеш скрипта — поле script из списка секций бандла, а не адрес файла.
let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;
const beacon = vi.fn<(url: string, body: string) => boolean>(() => true);
const broken = defineSection({
  mount() {
    throw new Error('сломалась');
  },
});

beforeEach(() => {
  failures = watchFailures();
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
});

afterEach(() => {
  core?.stop();
  core = undefined;
  failures.stop();
  beacon.mockClear();
  Reflect.deleteProperty(navigator, 'sendBeacon');
  vi.useRealTimers();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('журнал ошибок и ядро секций', () => {
  it('хеш скрипта — из поля script события, без адреса файла', () => {
    const detail = { section: 'shop:scarf-match', id: 'pick-1', script: hash('c'), stage: 'runtime', message: 'x' };
    expect(recordOf(detail)).toEqual({
      section: 'shop:scarf-match',
      script: hash('c'),
      stage: 'runtime',
      message: 'x',
    });
  });

  it.each([
    ['короче 64 знаков', 'abc'],
    ['не hex', 'z'.repeat(64)],
  ])('script %s и нет src — записи нет', (_case, script) => {
    expect(recordOf({ section: 'shop:a', script, stage: 'mount', message: 'x' })).toBeNull();
  });

  it('на витрине сбой секции уходит в шлюз пачкой через 2 с', () => {
    vi.useFakeTimers();
    document.head.innerHTML = configTag('live');
    placeSection('shop:broken', 'broken-1');
    core = start({ parts: [], sections: [entry('shop:broken', broken, { script: hash('d') })] });
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0]?.[0]).toBe(`${API_URL}/storefront/section-errors`);
    const body: unknown = JSON.parse(beacon.mock.calls[0]?.[1] ?? '{}');
    expect(body).toEqual({
      v: 1,
      shopId: SHOP_ID,
      errors: [{ section: 'shop:broken', script: hash('d'), stage: 'mount', message: 'сломалась' }],
    });
  });

  it('в превью журнал в шлюз не пишет', () => {
    vi.useFakeTimers();
    document.head.innerHTML = configTag('preview');
    placeSection('shop:broken', 'broken-1');
    core = start({ parts: [], sections: [entry('shop:broken', broken)] });
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    expect(beacon).not.toHaveBeenCalled();
    expect(failures.details).toHaveLength(1);
  });
});
