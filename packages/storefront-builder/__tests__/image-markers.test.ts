import type { Marker } from '@merfy-dropshipping-platform/images';
import { describe, expect, it } from 'vitest';
import { MARKER_MISS_MS, MARKER_PARALLEL, createImageMarkers } from '../src/image-markers';

// Чтение маркеров копий: кеш (найден — навсегда, не найден — 5 минут), порции по 16, сбои — картинка без копий. Хранилище —
// подставная функция fetch, время — управляемые часы.
const ORIGIN = 'https://minio.dev.merfy.ru';
const HOSTS = ['minio.dev.merfy.ru', 'minio.merfy.ru'];
const photo = (name: string): string => `${ORIGIN}/product-images/${name}.jpg`;

const MARKER: Marker = {
  rulesVersion: 1,
  status: 'ok',
  attempts: 1,
  width: 2400,
  height: 1600,
  variants: [
    { kind: 'm', width: 800, key: 'm' },
    { kind: 'd', width: 1600, key: 'd' },
  ],
};

// Хранилище: адрес маркера → ответ. Нет в таблице — 404.
function storage(answers: Record<string, Response | Error>) {
  const asked: string[] = [];
  let running = 0;
  let peak = 0;
  const fetcher = async (address: string): Promise<Response> => {
    asked.push(address);
    running += 1;
    peak = Math.max(peak, running);
    await Promise.resolve();
    running -= 1;
    const answer = answers[address];
    if (answer instanceof Error) throw answer;
    return answer ?? new Response('', { status: 404 });
  };
  return { fetcher, asked, peak: () => peak };
}

function setup(answers: Record<string, Response | Error>) {
  const store = storage(answers);
  const lines: string[] = [];
  let now = Date.parse('2026-11-20T10:00:00.000Z');
  const reader = createImageMarkers({
    origin: ORIGIN,
    hosts: HOSTS,
    fetch: store.fetcher,
    clock: () => new Date(now),
    log: (message, fields) => lines.push(`${message} ${JSON.stringify(fields ?? {})}`),
  });
  return { reader, store, lines, wait: (ms: number) => (now += ms) };
}

const ok = (marker: Marker = MARKER): Response => new Response(JSON.stringify(marker), { status: 200 });

describe('маркеры копий картинок', () => {
  it('картинки находятся в ревизии, секциях и сущностях; маркер читается с хоста контура по пути адреса', async () => {
    const prod = 'https://minio.merfy.ru/product-images/b.jpg';
    const { reader, store } = setup({
      [`${photo('a')}.v.json`]: ok(),
      [`${ORIGIN}/product-images/b.jpg.v.json`]: ok(),
    });
    const images = await reader.read([
      { tokens: {} },
      { home: [{ settings: { photo: photo('a') } }] },
      [{ data: { image: prod } }],
    ]);
    expect(images).toEqual({ origin: ORIGIN, markers: { [photo('a')]: MARKER, [prod]: MARKER } });
    expect(store.asked.sort()).toEqual([`${photo('a')}.v.json`, `${ORIGIN}/product-images/b.jpg.v.json`]);
  });

  it('чужой хост, gif и копии не читаются; нет картинок — undefined', async () => {
    const { reader, store } = setup({});
    const values = [['https://cdn.example/a.jpg', `${ORIGIN}/a.gif`, `${photo('a')}.d.webp`]];
    expect(await reader.read(values)).toBeUndefined();
    expect(store.asked).toEqual([]);
  });

  it('нет маркера (404) — картинки нет во входах; остальные остаются', async () => {
    const { reader } = setup({ [`${photo('a')}.v.json`]: ok() });
    const images = await reader.read([[photo('a'), photo('missing')]]);
    expect(Object.keys(images?.markers ?? {})).toEqual([photo('a')]);
  });

  it('маркер без копий, failed и битый — как нет маркера', async () => {
    const small: Marker = { ...MARKER, variants: [] };
    const failed: Marker = { rulesVersion: 1, status: 'failed', attempts: 3, width: null, height: null, variants: [] };
    const { reader } = setup({
      [`${photo('small')}.v.json`]: ok(small),
      [`${photo('failed')}.v.json`]: ok(failed),
      [`${photo('broken')}.v.json`]: new Response('{не json', { status: 200 }),
    });
    expect(await reader.read([[photo('small'), photo('failed'), photo('broken')]])).toBeUndefined();
  });

  it('сбой сети и ошибка хранилища — картинка без копий, сборку не роняют; одна строка журнала на чтение', async () => {
    const { reader, lines } = setup({
      [`${photo('net')}.v.json`]: new Error('ECONNRESET'),
      [`${photo('err')}.v.json`]: new Response('', { status: 503 }),
      [`${photo('ok')}.v.json`]: ok(),
    });
    const images = await reader.read([[photo('net'), photo('err'), photo('ok')]]);
    expect(Object.keys(images?.markers ?? {})).toEqual([photo('ok')]);
    expect(lines).toEqual(['image-markers-failed {"failed":2,"asked":3}']);
  });

  it('найденный маркер — в кеше навсегда: второе чтение без запросов, даже через сутки', async () => {
    const { reader, store, wait } = setup({ [`${photo('a')}.v.json`]: ok() });
    await reader.read([[photo('a')]]);
    wait(24 * 60 * 60_000);
    const again = await reader.read([[photo('a')]]);
    expect(Object.keys(again?.markers ?? {})).toEqual([photo('a')]);
    expect(store.asked).toHaveLength(1);
  });

  it('ненайденный маркер — в кеше 5 минут: до истечения запроса нет, после — снова спрашиваем и подхватываем появившийся', async () => {
    const answers: Record<string, Response | Error> = {};
    const { reader, store, wait } = setup(answers);
    expect(await reader.read([[photo('late')]])).toBeUndefined();
    wait(MARKER_MISS_MS - 1);
    expect(await reader.read([[photo('late')]])).toBeUndefined();
    expect(store.asked).toHaveLength(1);
    answers[`${photo('late')}.v.json`] = ok();
    wait(1);
    const images = await reader.read([[photo('late')]]);
    expect(Object.keys(images?.markers ?? {})).toEqual([photo('late')]);
    expect(store.asked).toHaveLength(2);
  });

  it('до 16 запросов одновременно; один адрес в одном чтении — один запрос', async () => {
    const count = MARKER_PARALLEL * 2 + 4;
    const urls = Array.from({ length: count }, (_, index) => photo(`img-${index}`));
    const { reader, store } = setup({});
    await reader.read([urls, urls]);
    expect(store.asked).toHaveLength(count);
    expect(store.peak()).toBeLessThanOrEqual(MARKER_PARALLEL);
    expect(store.peak()).toBeGreaterThan(1);
  });
});
