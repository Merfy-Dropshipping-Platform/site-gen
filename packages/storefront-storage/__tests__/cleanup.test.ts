import { describe, expect, it } from 'vitest';
import { KEEP_LAST_BUILDS, blobsToRemove, buildsToKeep, runCleanup, type StoredBuild } from '../src/cleanup';
import type { Pointer, RoutesTable } from '../src/formats';
import { blobKey, drawnKey, manifestKey, pointerKey, routesKey } from '../src/layout';
import { jsonBytes } from '../src/objects';
import { SHOP } from './manifests';
import { createMemoryStore, type MemoryStore } from './memory-store';

const NOW = '2026-10-07T03:00:00.000Z';
const OLD = '2026-10-04T03:00:00.000Z';
const FRESH = '2026-10-07T01:00:00.000Z';
const JSON_TYPE = { contentType: 'application/json' };
// Отпечаток из одного знака hex: '7' → '777…7'.
const hexFrom = (seed: string): string => seed.repeat(64);
const blobOf = (seed: string): string => blobKey(`sha256:${hexFrom(seed)}`);
const pointerOf = (build: number, history: number[]): Pointer => ({
  v: 1,
  shop: SHOP,
  build,
  newest: build,
  rev: build,
  paused: false,
  pending: null,
  history,
});
const stored = (build: number, writtenAt = OLD): StoredBuild => ({ shop: SHOP, build, writtenAt });
const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, index) => from + index);
const ascending = (builds: Set<number>): number[] => [...builds].sort((left, right) => left - right);
// Пары версий сборок — от новых к старым, как их читает уборка.
const pairsOf = (entries: [number, string][]): Map<number, string> =>
  new Map(entries.sort(([left], [right]) => right - left));

describe('какие сборки хранить', () => {
  it(`последние ${KEEP_LAST_BUILDS}`, () => {
    const builds = range(1, 10).map((build) => stored(build));
    const pairs = pairsOf(range(1, 10).map((build) => [build, 'A']));
    expect(ascending(buildsToKeep(builds, pairs, undefined, NOW))).toEqual([6, 7, 8, 9, 10]);
  });

  it('последнюю сборку каждой из 3 последних пар «рендер + тема»', () => {
    const builds = range(1, 12).map((build) => stored(build));
    const pairOf = (build: number): string => ['A', 'A', 'B', 'B'][build - 1] ?? 'C';
    const pairs = pairsOf(range(1, 12).map((build) => [build, pairOf(build)]));
    expect(ascending(buildsToKeep(builds, pairs, undefined, NOW))).toEqual([2, 4, 8, 9, 10, 11, 12]);
  });

  it('всё моложе суток и всё, на что смотрит указатель: живую, ждущую, историю', () => {
    const builds = [...range(1, 8).map((build) => stored(build)), stored(9, FRESH), stored(10, FRESH)];
    const pointer = { ...pointerOf(2, [1]), pending: 3 };
    expect(ascending(buildsToKeep(builds, pairsOf([[10, 'A']]), pointer, NOW))).toEqual([1, 2, 3, 6, 7, 8, 9, 10]);
  });

  it('файл удаляем, только если на него не ссылается ни одна хранимая сборка и он старше суток', () => {
    const blobs = [
      { key: blobOf('a'), modifiedAt: OLD },
      { key: blobOf('b'), modifiedAt: OLD },
      { key: blobOf('c'), modifiedAt: FRESH },
    ];
    expect(blobsToRemove(blobs, new Set([hexFrom('a')]), NOW)).toEqual([blobOf('b')]);
  });
});

const tableOf = (build: number): RoutesTable => ({
  v: 1,
  shop: SHOP,
  build,
  versions: { render: `sha256:${'1'.repeat(64)}`, theme: 'nova@0.0.1' },
  notFound: null,
  files: {
    '/': { h: hexFrom(String(build)), t: 'text/html', c: 'revalidate' },
    '/s.css': { h: hexFrom('a'), t: 'text/css', c: 'immutable' },
  },
  moved: {},
  gone: {},
});

// Хранилище: сборки 1–8 магазина, у каждой свой файл ('1'…'8') и общий ('a'); указатель на 8, история — [7]; у 8
// дорисовка ('d'); ничей старый файл ('e') и ничей свежий ('f').
async function seeded(): Promise<MemoryStore> {
  let now = OLD;
  const store = createMemoryStore(() => now);
  const put = (key: string, value: unknown) => store.write(key, jsonBytes(value), JSON_TYPE);
  for (const build of range(1, 8)) {
    await put(manifestKey(SHOP, build), {});
    await put(routesKey(SHOP, build), tableOf(build));
  }
  await put(drawnKey(SHOP, 8), {
    v: 1,
    rows: { '/products/osen/': { h: hexFrom('d'), t: 'text/html', c: 'revalidate' } },
  });
  await put(drawnKey(SHOP, 1), { v: 1, rows: {} });
  await put(pointerKey('scarf'), pointerOf(8, [7]));
  for (const seed of [...range(1, 8).map(String), 'a', 'd', 'e']) await put(blobOf(seed), seed);
  now = FRESH;
  await put(blobOf('f'), 'f');
  return store;
}

describe('уборка в хранилище', () => {
  it('пробный прогон: план без удаления', async () => {
    const store = await seeded();
    const before = [...store.objects.keys()].sort();
    const plan = await runCleanup(store, NOW, false);
    expect(plan.removedBuilds.map((build) => build.build).sort()).toEqual([1, 2, 3]);
    expect(plan.removedBlobs.sort()).toEqual(['1', '2', '3', 'e'].map(blobOf).sort());
    expect([...store.objects.keys()].sort()).toEqual(before);
  });

  it('уборка: сборки вне правил — манифест, таблица и список дорисовок; файлы без ссылок старше суток', async () => {
    const store = await seeded();
    await runCleanup(store, NOW, true);
    const left = [...store.objects.keys()];
    const routes = left.filter((key) => key.includes('/routes/')).sort();
    expect(routes).toEqual(range(4, 8).map((build) => routesKey(SHOP, build)));
    expect(left).not.toContain(manifestKey(SHOP, 1));
    expect(left).not.toContain(drawnKey(SHOP, 1));
    expect(left).toContain(drawnKey(SHOP, 8));
    expect(left).toContain(blobOf('d'));
    expect(left).toContain(blobOf('f'));
    expect(left).not.toContain(blobOf('e'));
  });
});
