import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULE_NAMES } from '../src/core/action-catalog';
import { page, TOUCH_TOP_PX, TOUCH_WINDOW_MS } from '../src/core/parts/page';
import { watchSource } from '../src/core/stores';
import type { PageModule, ReadableStore, Stop } from '../src/core/types';
import { fakeCore, fakeGateway, gate, settle } from './sdk-support';

// Модуль page (ctx.page с uses: ["page"]): те же path и query, что у ctx.page, и три стора страницы — $scroll (доля
// прокрутки 0–100), $leaving (посетитель собирается уйти) и $now (время по серверу магазина). Слушатели прошлых тестов
// остаются на window: каждый тест смотрит только свою часть и свой CoreHandle.
const SERVER_NOW = Date.parse('2026-11-01T12:00:00.000Z');
const stops: Stop[] = [];
let gateway: ReturnType<typeof fakeGateway>;

function watch<T>(store: ReadableStore<T>): T[] {
  const seen: T[] = [];
  const stop = watchSource(store)?.listen((value) => seen.push(value));
  if (stop !== undefined) stops.push(stop);
  return seen;
}

function layout(options: { height: number; viewport: number; y: number }): void {
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: options.height, configurable: true });
  Object.defineProperty(document.documentElement, 'clientHeight', { value: options.viewport, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: options.y, configurable: true, writable: true });
}

const frame = (): void => void vi.advanceTimersByTime(20);

function scrollTo(y: number): void {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
  window.dispatchEvent(new Event('scroll'));
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['Date', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    now: SERVER_NOW,
  });
  gateway = fakeGateway();
  window.history.replaceState(null, '', '/products/scarf?token=abc&q=1');
});

afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'scrollY');
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('модуль page в списках ядра', () => {
  it('page — модуль SDK: его можно объявить в uses', () => {
    expect(MODULE_NAMES).toContain('page');
  });

  it('path и query — те же, что у ctx.page: модуль вместо ctx.page не ломает адрес страницы', () => {
    const api: PageModule = page.create(fakeCore().core);
    expect(api.path).toBe('/products/scarf');
    expect(api.query).toEqual({ token: 'abc', q: '1' });
  });
});

describe('$scroll', () => {
  it('доля прокрутки целым: 0, 50, 100', () => {
    layout({ height: 2000, viewport: 1000, y: 0 });
    const api = page.create(fakeCore().core);
    const seen = watch(api.$scroll);
    expect(api.$scroll.get()).toBe(0);
    scrollTo(500);
    frame();
    scrollTo(1000);
    frame();
    expect(seen).toEqual([50, 100]);
    expect(api.$scroll.get()).toBe(100);
  });

  it('читает положение в момент подписки, а не 0', () => {
    layout({ height: 2000, viewport: 1000, y: 250 });
    const api = page.create(fakeCore().core);
    expect(api.$scroll.get()).toBe(25);
  });

  it('страница короче окна — 0; значение не выходит за 0–100', () => {
    layout({ height: 800, viewport: 1000, y: 0 });
    const api = page.create(fakeCore().core);
    expect(api.$scroll.get()).toBe(0);
    layout({ height: 2000, viewport: 1000, y: 5000 });
    const seen = watch(api.$scroll);
    scrollTo(5000);
    frame();
    expect(seen).toEqual([100]);
  });

  it('не чаще кадра: десять событий прокрутки в одном кадре — одно обновление', () => {
    layout({ height: 2000, viewport: 1000, y: 0 });
    const api = page.create(fakeCore().core);
    const seen = watch(api.$scroll);
    for (let y = 100; y <= 1000; y += 100) scrollTo(y);
    expect(seen).toEqual([]);
    frame();
    expect(seen).toEqual([100]);
  });

  it('слушатель прокрутки пассивный и стоит, только пока есть подписчик', async () => {
    layout({ height: 2000, viewport: 1000, y: 0 });
    const add = vi.spyOn(window, 'addEventListener');
    const api = page.create(fakeCore().core);
    expect(add.mock.calls.filter(([type]) => type === 'scroll')).toEqual([]);
    const stop = watchSource(api.$scroll)?.listen(() => undefined);
    const options = add.mock.calls.find(([type]) => type === 'scroll')?.[2];
    expect(options).toMatchObject({ passive: true });
    const signal = typeof options === 'object' && options !== null ? options.signal : undefined;
    expect(signal?.aborted).toBe(false);
    stop?.();
    await new Promise((resolve) => setTimeout(resolve, 1100)); // Nano Stores снимает onMount через секунду после отписки
    expect(signal?.aborted).toBe(true); // слушатель снят
  });
});

describe('$leaving на компьютере', () => {
  const mouseLeave = (clientY: number): void => {
    document.documentElement.dispatchEvent(new MouseEvent('mouseleave', { clientY }));
  };

  it('курсор ушёл за верхний край окна: $leaving = true и событие merfy:page:leaving', () => {
    const fake = fakeCore();
    const api = page.create(fake.core);
    const seen = watch(api.$leaving);
    expect(api.$leaving.get()).toBe(false);
    mouseLeave(-1);
    expect(seen).toEqual([true]);
    expect(fake.named('merfy:page:leaving')).toEqual([{}]);
  });

  it('курсор вернулся в окно: $leaving снова false, без второго события', () => {
    const fake = fakeCore();
    const api = page.create(fake.core);
    const seen = watch(api.$leaving);
    mouseLeave(0);
    document.documentElement.dispatchEvent(new MouseEvent('mouseenter', { clientY: 10 }));
    expect(seen).toEqual([true, false]);
    expect(fake.named('merfy:page:leaving')).toHaveLength(1);
  });

  it('курсор ушёл вниз, влево или вправо — не уход', () => {
    const fake = fakeCore();
    const api = page.create(fake.core);
    mouseLeave(900);
    mouseLeave(400);
    expect(api.$leaving.get()).toBe(false);
    expect(fake.named('merfy:page:leaving')).toEqual([]);
  });

  it('повторный выход, пока курсор не вернулся, событие не повторяет', () => {
    const fake = fakeCore();
    page.create(fake.core);
    mouseLeave(-1);
    mouseLeave(-5);
    expect(fake.named('merfy:page:leaving')).toHaveLength(1);
  });
});

describe('$leaving на устройстве без курсора', () => {
  function touchDevice(): void {
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({ matches: query === '(hover: none)' }),
      configurable: true,
    });
  }
  const after = (ms: number): void => void vi.advanceTimersByTime(ms);

  it('рывок вверх к верху страницы: быстрее порога и не ниже TOUCH_TOP_PX', () => {
    touchDevice();
    layout({ height: 6000, viewport: 800, y: 3000 });
    const fake = fakeCore();
    const api = page.create(fake.core);
    const seen = watch(api.$leaving);
    scrollTo(3000);
    after(TOUCH_WINDOW_MS / 2);
    scrollTo(TOUCH_TOP_PX); // у верха: не ниже TOUCH_TOP_PX; поднялись на 3000 − TOUCH_TOP_PX ≥ TOUCH_RISE_PX
    expect(seen).toEqual([true]);
    expect(fake.named('merfy:page:leaving')).toEqual([{}]);
  });

  it('спокойная прокрутка вверх (1 px/мс) — не уход, даже у самого верха', () => {
    touchDevice();
    layout({ height: 6000, viewport: 800, y: 3000 });
    const fake = fakeCore();
    page.create(fake.core);
    for (let step = 0; step <= 30; step += 1) {
      scrollTo(3000 - step * 100);
      after(100);
    }
    expect(window.scrollY).toBe(0);
    expect(fake.named('merfy:page:leaving')).toEqual([]);
  });

  it('рывок вверх, который остановился далеко от верха, — не уход', () => {
    touchDevice();
    layout({ height: 6000, viewport: 800, y: 4000 });
    const fake = fakeCore();
    page.create(fake.core);
    scrollTo(4000);
    after(100);
    scrollTo(TOUCH_TOP_PX + 1500);
    expect(fake.named('merfy:page:leaving')).toEqual([]);
  });

  it('подъём дольше окна TOUCH_WINDOW_MS — не рывок', () => {
    touchDevice();
    layout({ height: 6000, viewport: 800, y: 3000 });
    const fake = fakeCore();
    page.create(fake.core);
    scrollTo(3000);
    after(TOUCH_WINDOW_MS + 1);
    scrollTo(0);
    expect(fake.named('merfy:page:leaving')).toEqual([]);
  });

  it('касание экрана снимает $leaving', () => {
    touchDevice();
    layout({ height: 6000, viewport: 800, y: 3000 });
    const api = page.create(fakeCore().core);
    const seen = watch(api.$leaving);
    scrollTo(3000);
    after(100);
    scrollTo(0);
    window.dispatchEvent(new Event('pointerdown'));
    expect(seen).toEqual([true, false]);
  });

  it('на компьютере прокрутка вверх уходом не считается', () => {
    layout({ height: 6000, viewport: 800, y: 3000 });
    const fake = fakeCore();
    page.create(fake.core);
    scrollTo(3000);
    after(100);
    scrollTo(0);
    expect(fake.named('merfy:page:leaving')).toEqual([]);
  });
});

describe('$now', () => {
  const TIME = 'GET /store/time';

  it('время сервера: смещение берётся из ответа шлюза, а не из часов устройства', async () => {
    gateway.answer(TIME, { status: 200, body: { now: SERVER_NOW + 3_600_000 } }); // часы устройства отстают на час
    const api = page.create(fakeCore().core);
    const seen = watch(api.$now);
    expect(api.$now.get()).toBeNull(); // запрос идёт: часам устройства верить нельзя
    await settle();
    expect(api.$now.get()).toBe(SERVER_NOW + 3_600_000);
    vi.advanceTimersByTime(1000);
    expect(seen.at(-1)).toBe(SERVER_NOW + 3_601_000);
  });

  it('половина времени пути учтена: запрос шёл 400 мс — сервер назвал время посередине', async () => {
    const door = gate();
    gateway.answer(TIME, { status: 200, body: { now: SERVER_NOW }, gate: door.promise });
    const api = page.create(fakeCore().core);
    watch(api.$now);
    vi.setSystemTime(SERVER_NOW + 400);
    door.open();
    await settle();
    expect(api.$now.get()).toBe(SERVER_NOW + 200);
  });

  it('обновляется раз в секунду, пока есть подписчики', async () => {
    gateway.answer(TIME, { status: 200, body: { now: SERVER_NOW } });
    const api = page.create(fakeCore().core);
    const seen = watch(api.$now);
    await settle();
    seen.length = 0;
    vi.advanceTimersByTime(3000);
    expect(seen).toEqual([SERVER_NOW + 1000, SERVER_NOW + 2000, SERVER_NOW + 3000]);
  });

  it('подписчиков нет — таймер стоит', async () => {
    gateway.answer(TIME, { status: 200, body: { now: SERVER_NOW } });
    const clear = vi.spyOn(window, 'clearInterval');
    const api = page.create(fakeCore().core);
    const stop = watchSource(api.$now)?.listen(() => undefined);
    await settle();
    stop?.();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(clear).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('запрос времени один на страницу, сколько бы раз ни подписывались', async () => {
    gateway.answer(TIME, { status: 200, body: { now: SERVER_NOW } });
    const api = page.create(fakeCore().core);
    watch(api.$now);
    watch(api.$now);
    await settle();
    expect(gateway.keys().filter((key) => key === TIME)).toHaveLength(1);
  });

  it('шлюз не ответил (обрыв) — часы устройства', async () => {
    gateway.answer(TIME, 'network');
    const api = page.create(fakeCore().core);
    watch(api.$now);
    await settle();
    expect(api.$now.get()).toBe(SERVER_NOW);
  });

  it('ответ не по форме — часы устройства', async () => {
    gateway.answer(TIME, { status: 200, body: { now: 'вчера' } });
    const api = page.create(fakeCore().core);
    watch(api.$now);
    await settle();
    expect(api.$now.get()).toBe(SERVER_NOW);
  });

  it('превью: часы устройства сразу и без запроса к шлюзу', () => {
    const api = page.create(fakeCore('preview').core);
    watch(api.$now);
    expect(api.$now.get()).toBe(SERVER_NOW);
    expect(gateway.keys()).toEqual([]);
  });

  it('нет конфига витрины: часы устройства, запроса нет', () => {
    const api = page.create(fakeCore('live', null).core);
    watch(api.$now);
    expect(api.$now.get()).toBe(SERVER_NOW);
    expect(gateway.keys()).toEqual([]);
  });
});
