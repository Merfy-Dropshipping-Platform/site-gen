import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BEHAVIORS } from '../src/core/behaviors/catalog';
import { countdown } from '../src/core/behaviors/countdown';
import { behaviors } from '../src/core/behaviors/part';
import { page } from '../src/core/parts/page';
import { start, type StartedCore } from '../src/core/start';
import { configTag, corePart, errorOf } from './core-support';
import { fakeGateway, settle } from './sdk-support';

// Поведение countdown: таймер до даты. Дата окончания — data-until (ISO 8601 с поясом), части days, hours, minutes,
// seconds — дочерние элементы. Идёт по $now модуля page, то есть по времени сервера магазина; в ноль — событие
// merfy:countdown:end и остановка.
const SERVER_NOW = Date.parse('2026-11-01T12:00:00.000Z');
const UNTIL = '2026-11-03T15:30:45+03:00'; // 12:30:45 по Гринвичу: через 2 суток 30 минут 45 секунд от SERVER_NOW
const PARTS =
  '<b data-part="days"></b>:<b data-part="hours"></b>:<b data-part="minutes"></b>:<b data-part="seconds"></b>';
const timer = (until: string | null, parts = PARTS): string =>
  `<div data-behavior="countdown"${until === null ? '' : ` data-until="${until}"`}>${parts}</div>`;

let started: StartedCore | null = null;
let gateway: ReturnType<typeof fakeGateway>;
let ended: unknown[] = [];
const quietErrors = () => vi.spyOn(console, 'error').mockImplementation(() => undefined);
let errors: ReturnType<typeof quietErrors>;

const onEnd = (event: Event): void => void ended.push(event instanceof CustomEvent ? event.detail : null);

function open(html: string, options: { withModule?: boolean; mode?: 'live' | 'preview' } = {}): void {
  document.head.innerHTML = configTag(options.mode ?? 'live');
  document.body.innerHTML = `<merfy-section data-section="shop:promo" data-section-id="promo-1">${html}</merfy-section>`;
  const list = behaviors({ list: [countdown] });
  started = start({ parts: options.withModule === false ? [list] : [page, list], sections: [] });
}

const text = (name: string): string => document.querySelector(`[data-part="${name}"]`)?.textContent ?? '';
const clock = (): string => {
  const texts = ['days', 'hours', 'minutes', 'seconds'].map(text);
  return texts.every((part) => part === '') ? '' : texts.join(':');
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: SERVER_NOW });
  gateway = fakeGateway();
  gateway.answer('GET /store/time', { status: 200, body: { now: SERVER_NOW } });
  errors = quietErrors();
  ended = [];
  document.addEventListener('merfy:countdown:end', onEnd);
});

afterEach(() => {
  started?.stop();
  started = null;
  document.removeEventListener('merfy:countdown:end', onEnd);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
  Reflect.deleteProperty(Element.prototype, 'animate');
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('каталог', () => {
  it('countdown: части days, hours, minutes, seconds; параметр until; без библиотек', () => {
    expect(BEHAVIORS.countdown).toEqual({
      libraries: [],
      parts: ['days', 'hours', 'minutes', 'seconds'],
      params: { until: { kind: 'string', default: null } },
      onSection: false,
    });
  });
});

describe('поведение countdown', () => {
  it('считает до даты: сутки без нуля, часы, минуты и секунды двумя знаками', async () => {
    open(timer(UNTIL));
    await settle();
    expect(clock()).toBe('2:00:30:45');
  });

  it('идёт по времени сервера, а не по часам устройства', async () => {
    gateway = fakeGateway();
    gateway.answer('GET /store/time', { status: 200, body: { now: SERVER_NOW - 3_600_000 } }); // сервер на час раньше
    open(timer(UNTIL));
    await settle();
    expect(clock()).toBe('2:01:30:45');
  });

  it('пока время сервера не пришло, разметку не трогает и конца не объявляет', () => {
    gateway = fakeGateway();
    gateway.answer('GET /store/time', 'hang');
    open(timer('2020-01-01T00:00:00Z')); // дата давно прошла по часам устройства
    expect(clock()).toBe('');
    expect(ended).toEqual([]);
  });

  it('раз в секунду уменьшает значение', async () => {
    open(timer(UNTIL));
    await settle();
    vi.advanceTimersByTime(1000);
    expect(clock()).toBe('2:00:30:44');
    vi.advanceTimersByTime(45_000);
    expect(clock()).toBe('2:00:29:59');
  });

  it('нет части days: часы берут сутки; нет hours и days: минуты считают всё', async () => {
    open(timer(UNTIL, '<i data-part="hours"></i>h <i data-part="minutes"></i>m <i data-part="seconds"></i>s'));
    await settle();
    expect(document.body.textContent).toContain('48h 30m 45s');
    started?.stop();
    open(timer(UNTIL, '<i data-part="minutes"></i>m <i data-part="seconds"></i>s'));
    await settle();
    expect(document.body.textContent).toContain('2910m 45s');
  });

  it('в ноль: нули в частях, одно событие merfy:countdown:end и остановка', async () => {
    open(timer('2026-11-01T12:00:03Z'));
    await settle();
    expect(clock()).toBe('0:00:00:03');
    vi.advanceTimersByTime(3000);
    expect(clock()).toBe('0:00:00:00');
    expect(ended).toEqual([{ section: 'shop:promo', id: 'promo-1' }]);
    vi.advanceTimersByTime(5000);
    expect(clock()).toBe('0:00:00:00'); // не уходит в минус
    expect(ended).toHaveLength(1);
  });

  it('дата уже прошла по времени сервера: нули и событие', async () => {
    open(timer('2026-10-31T00:00:00Z'));
    await settle();
    expect(clock()).toBe('0:00:00:00');
    expect(ended).toHaveLength(1);
  });

  it('дата без пояса, мусор или пустой параметр: строка для автора, разметка нетронута', async () => {
    for (const until of ['2026-11-03T15:30:45', 'завтра', '', null]) {
      errors.mockClear();
      open(timer(until));
      await settle();
      expect(clock(), String(until)).toBe('');
      expect(errors, String(until)).toHaveBeenCalledTimes(1);
      started?.stop();
    }
  });

  it('нет модуля page: строка для автора про uses', () => {
    open(timer(UNTIL), { withModule: false });
    expect(clock()).toBe('');
    expect(errors.mock.calls.map((call) => String(call[0])).join('\n')).toContain('"uses": ["page"]');
  });

  it('внутри нет ни одной части: строка для автора, событие конца не уходит', () => {
    open(timer('2026-10-31T00:00:00Z', '<i>без частей</i>'));
    expect(errors.mock.calls.map((call) => String(call[0])).join('\n')).toContain('нет ни одной части');
    expect(ended).toEqual([]);
  });

  it('core.watch: стор модуля page отдаёт значения каждую секунду, чужой стор — ShellError sdk-call-invalid', () => {
    const spy = corePart();
    document.head.innerHTML = configTag('preview');
    started = start({ parts: [page, spy.part], sections: [] });
    const seen: (number | null)[] = [];
    const stop = spy.box.core?.watch(spy.box.core.part('page').$now, (value) => seen.push(value));
    vi.advanceTimersByTime(2000);
    stop?.();
    expect(seen).toEqual([SERVER_NOW + 1000, SERVER_NOW + 2000]);
    expect(errorOf(() => spy.box.core?.watch({ get: () => 1 }, () => undefined))).toMatchObject({
      code: 'sdk-call-invalid',
    });
  });

  it('в превью конструктора: часы устройства, запроса времени нет, цифры сразу', () => {
    open(timer(UNTIL), { mode: 'preview' });
    expect(clock()).toBe('2:00:30:45');
    expect(gateway.calls).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(clock()).toBe('2:00:30:44');
  });

  it('таймер ничего не анимирует: ни обычно, ни при «уменьшить движение»', async () => {
    const animate = vi.fn();
    Object.defineProperty(Element.prototype, 'animate', { value: animate, configurable: true, writable: true });
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({ matches: query.includes('reduce') }),
      configurable: true,
    });
    open(timer(UNTIL));
    await settle();
    vi.advanceTimersByTime(3000);
    expect(clock()).toBe('2:00:30:42');
    expect(animate).not.toHaveBeenCalled();
  });
});
