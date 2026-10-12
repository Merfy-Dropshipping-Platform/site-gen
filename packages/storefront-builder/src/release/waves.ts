// Волны выпуска (design.md блока 10, «Волны»): волна 0 — тестовый магазин владельца; волны 1–3 — 10 %, 50 % и все
// остальные магазины, в волне не меньше одного. Порядок — случайный с зерном «номер выпуска»: повторный прогон даёт тот
// же порядок, и человек может заранее сказать, какой магазин в какой волне.
export const WAVE_SHARES = [0.1, 0.5, 1] as const;

export interface PlannedShop {
  siteId: string;
  wave: number;
  position: number;
}

// mulberry32: короткий генератор с зерном; для порядка волн криптостойкость не нужна.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// Фишер — Йейтс с зерном.
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const random = seededRandom(seed);
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

// Сколько магазинов обновлено к концу волны 1, 2, 3.
export const cutsOf = (count: number): number[] =>
  WAVE_SHARES.reduce<number[]>((cuts, share) => {
    const previous = cuts.at(-1) ?? 0;
    return [...cuts, Math.min(count, Math.max(previous + 1, Math.floor(count * share)))];
  }, []);

const waveOf = (cuts: readonly number[], index: number): number => cuts.findIndex((cut) => index < cut) + 1;

export function planWaves(siteIds: readonly string[], testShop: string | null, seed: number): PlannedShop[] {
  const unique = [...new Set(siteIds)];
  const hasTest = testShop !== null && unique.includes(testShop);
  const others = shuffled(unique.filter((id) => id !== testShop).sort(), seed);
  const cuts = cutsOf(others.length);
  const zero: PlannedShop[] = hasTest ? [{ siteId: testShop, wave: 0, position: 0 }] : [];
  return [...zero, ...others.map((siteId, index) => ({ siteId, wave: waveOf(cuts, index), position: index + 1 }))];
}
