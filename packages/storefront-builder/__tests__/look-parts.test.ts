// Снимок черновика: части без браузера — нарезка экранов и вес, фильтр адресов, очередь отрисовок, адрес открытия
// страницы (перенесено 28.10 из merfy-mcp `tests/server/nova-look-parts.spec.ts`).
import { describe, expect, it } from 'vitest';
import { Slots } from '../src/look/look-browser';
import {
  BUDGET_BYTES,
  MAX_FULL_SCREENS,
  QUALITY_STEPS,
  base64Size,
  fitShots,
  plannedScreens,
  screensIn,
  trimToBudget,
} from '../src/look/look-fit';
import { isAllowedRequest, isInternalHost } from '../src/look/look-guard';
import { entryUrlOf } from '../src/look/look-page';
import { fakeSession, type ShootCall } from './look-fixture';

describe('экраны', () => {
  it('сколько экранов в странице и сколько снимать', () => {
    expect(screensIn(0, 900)).toBe(1);
    expect(screensIn(900, 900)).toBe(1);
    expect(screensIn(901, 900)).toBe(2);
    expect(plannedScreens(9, false)).toBe(1);
    expect(plannedScreens(30, true)).toBe(MAX_FULL_SCREENS);
    expect(plannedScreens(9, true)).toBe(9);
  });

  it('размер в base64 — как у кодирования', () => {
    for (const size of [0, 1, 2, 3, 4, 1000])
      expect(base64Size(size)).toBe(Buffer.alloc(size).toString('base64').length);
  });
});

describe('вес снимков', () => {
  const shots = (count: number, bytes: number): Uint8Array[] =>
    Array.from({ length: count }, () => new Uint8Array(bytes));

  it('первый экран — по одному снимку на устройство, лучшее качество', async () => {
    const calls: ShootCall[] = [];
    const sessions = [
      fakeSession('mobile', { pageHeight: 5_000 }, calls),
      fakeSession('desktop', { pageHeight: 5_000 }, calls),
    ];

    const fitted = await fitShots(sessions, false);

    expect(fitted.map((entry) => [entry.device, entry.shots.length, entry.total])).toEqual([
      ['mobile', 1, 6],
      ['desktop', 1, 6],
    ]);
    expect(calls.every((call) => call.quality === QUALITY_STEPS[0])).toBe(true);
  });

  it('вся страница: не больше предела числа экранов', async () => {
    const calls: ShootCall[] = [];

    const [desktop] = await fitShots([fakeSession('desktop', { pageHeight: 20 * 900 }, calls)], true);

    expect(desktop?.total).toBe(20);
    expect(desktop?.shots).toHaveLength(MAX_FULL_SCREENS);
  });

  it('не влезло — качество снижается по ступеням, пока не влезет, экраны остаются', async () => {
    const calls: ShootCall[] = [];
    // Вес растёт с качеством; восемь экранов в base64 влезают в предел 1,5 МБ только со 100 КБ на экран.
    const weights: Record<number, number> = { 80: 200_000, 62: 150_000, 45: 100_000, 30: 50_000 };
    const weight = (_index: number, quality: number): number => weights[quality] ?? 0;
    const session = fakeSession('desktop', { pageHeight: 8 * 900, shotBytes: weight }, calls);

    const [desktop] = await fitShots([session], true);

    expect(desktop?.shots).toHaveLength(8);
    expect([...new Set(calls.map((call) => call.quality))]).toEqual([80, 62, 45]);
    expect(desktop?.shots[0]).toHaveLength(100_000);
  });

  it('не влезло и на худшем качестве — хвостовые экраны убираются у того, где их больше', () => {
    const kept = trimToBudget([shots(6, 300_000), shots(2, 100_000)], BUDGET_BYTES);

    expect(kept.map((group) => group.length)).toEqual([3, 2]);
  });

  it('экранов поровну — убирается у того, чьи снимки тяжелее', () => {
    const kept = trimToBudget([shots(3, 300_000), shots(3, 100_000)], BUDGET_BYTES);

    expect(kept.map((group) => group.length)).toEqual([2, 3]);
  });

  it('по одному экрану остаётся, даже если и он не влезает', () => {
    const kept = trimToBudget([shots(3, 2_000_000), shots(3, 2_000_000)], BUDGET_BYTES);

    expect(kept.map((group) => group.length)).toEqual([1, 1]);
  });

  it('влезает — ничего не убирается', () => {
    const groups = [shots(2, 1_000), shots(2, 1_000)];

    expect(trimToBudget(groups, BUDGET_BYTES)).toEqual(groups);
  });
});

describe('фильтр адресов страницы', () => {
  it.each([
    'localhost',
    'LOCALHOST.',
    'api.localhost',
    'redis',
    'sites-service-dev',
    'db.internal',
    'printer.local',
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '[::1]',
    '[fd00::1]',
    '[fe80::1]',
    '[::ffff:7f00:1]',
  ])('%s — внутренний', (host) => {
    expect(isInternalHost(host)).toBe(true);
  });

  it.each([
    'example.com',
    'gateway.dev.merfy.ru',
    'minio.merfy.ru',
    '8.8.8.8',
    '172.32.0.1',
    '100.128.0.1',
    '[2001:db8::1]',
  ])('%s — публичный', (host) => {
    expect(isInternalHost(host)).toBe(false);
  });

  it('разрешены только http и https на публичные адреса', () => {
    expect(isAllowedRequest('https://minio.merfy.ru/a.png')).toBe(true);
    expect(isAllowedRequest('http://example.com/')).toBe(true);
    expect(isAllowedRequest('http://127.0.0.1:5432/')).toBe(false);
    expect(isAllowedRequest('http://2130706433/')).toBe(false);
    expect(isAllowedRequest('http://metadata/latest')).toBe(false);
    expect(isAllowedRequest('file:///etc/passwd')).toBe(false);
    expect(isAllowedRequest('ftp://example.com/')).toBe(false);
    expect(isAllowedRequest('не адрес')).toBe(false);
  });
});

describe('очередь отрисовок', () => {
  it('не больше заданного числа одновременно, остальные ждут по порядку', async () => {
    const slots = new Slots(2);
    const order: string[] = [];
    await slots.acquire();
    await slots.acquire();
    const third = slots.acquire().then(() => order.push('третий'));
    const fourth = slots.acquire().then(() => order.push('четвёртый'));

    await Promise.resolve();
    expect(order).toEqual([]);

    slots.release();
    await third;
    expect(order).toEqual(['третий']);

    slots.release();
    await fourth;
    expect(order).toEqual(['третий', 'четвёртый']);
  });

  it('освобождённое место без очереди снова доступно', async () => {
    const slots = new Slots(1);
    await slots.acquire();
    slots.release();

    await expect(slots.acquire()).resolves.toBeUndefined();
  });
});

describe('адрес, на котором открывается страница', () => {
  const page = (config: string): string =>
    `<html><head><script type="application/json" id="merfy-config">${config}</script></head></html>`;

  it('адрес магазина из конфигурации превью, с корнем', () => {
    const config = '{"v":1,"mode":"preview","shop":{"id":"x","url":"https://4e589f747e5c.dev.merfy.ru/catalog?a=1"}}';
    expect(entryUrlOf(page(config))).toBe('https://4e589f747e5c.dev.merfy.ru/');
  });

  it.each([
    ['нет конфигурации', '<html></html>'],
    ['конфигурация не разбирается', page('{нет')],
    ['нет адреса магазина', page('{"shop":{}}')],
    ['адрес не http', page('{"shop":{"url":"ftp://x.example"}}')],
  ])('%s — запасной адрес', (_name, html) => {
    expect(entryUrlOf(html)).toBe('https://preview.merfy.invalid/');
  });
});
