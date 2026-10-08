import { createS3Store } from '../src/s3-store';
import type { ObjectStore } from '../src/store';
import { LOCAL_MINIO, ensureBucket } from './local-minio';

// pnpm probe:pointer — проба условной записи (design.md блока 5, В5-2 Б): указатель живёт только в хранилище,
// переключение — одна запись с If-Match. MinIO той же версии, что на dev и в проде (`pnpm minio:up`). Проверяет:
// «создать, только если нет»; запись по свежему и по старому отпечатку; гонку — из 20 одновременных записей по
// одному отпечатку проходит ровно одна, 10 раз подряд; 8 писателей по 25 правок с повтором при отказе — ни одна
// правка не потеряна. Не прошла — код выхода 1, дальше план не идёт (RULES.md, раздел 8).
// Отпечаток (ETag) у S3 — хэш содержимого: запись тех же байтов отпечаток не меняет, и следующая запись по нему
// тоже пройдёт. Поэтому каждая запись пробы несёт номер раунда, а каждая запись указателя — новый номер записи.

const JSON_TYPE = { contentType: 'application/json' };
const RACE_WRITERS = 20;
const RACE_ROUNDS = 10;
const COUNTER_WRITERS = 8;
const COUNTER_STEPS = 25;
const MAX_ATTEMPTS = 50;
const LATENCY_WRITES = 50;
const LATENCY_LIMIT_MS = 50;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const line = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

async function createOnce(store: ObjectStore, key: string): Promise<boolean> {
  const condition = { ifNoneMatch: '*' } as const;
  const first = await store.write(key, encoder.encode('{}'), { ...JSON_TYPE, condition });
  const second = await store.write(key, encoder.encode('{}'), { ...JSON_TYPE, condition });
  return first.written && !second.written;
}

async function staleRefused(store: ObjectStore, key: string): Promise<boolean> {
  const current = await store.read(key);
  const etag = current?.etag ?? '';
  const fresh = await store.write(key, encoder.encode('{"n":1}'), { ...JSON_TYPE, condition: { ifMatch: etag } });
  const stale = await store.write(key, encoder.encode('{"n":2}'), { ...JSON_TYPE, condition: { ifMatch: etag } });
  return fresh.written && !stale.written;
}

async function raceWinners(store: ObjectStore, key: string, round: number): Promise<number> {
  const etag = (await store.read(key))?.etag ?? '';
  const body = (writer: number): Uint8Array => encoder.encode(`{"round":${round},"writer":${writer}}`);
  const attempts = Array.from({ length: RACE_WRITERS }, (_, writer) =>
    store.write(key, body(writer), { ...JSON_TYPE, condition: { ifMatch: etag } }),
  );
  const results = await Promise.all(attempts);
  return results.filter((result) => result.written).length;
}

// Одна правка «прочитал → прибавил → записал, только если не менялся»; отказ — читаем заново.
async function increment(store: ObjectStore, key: string): Promise<number> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const current = await store.read(key);
    const value = Number(decoder.decode(current?.body)) + 1;
    const condition = { ifMatch: current?.etag ?? '' };
    const result = await store.write(key, encoder.encode(String(value)), { ...JSON_TYPE, condition });
    if (result.written) return attempt;
  }
  throw new Error(`правка не прошла за ${MAX_ATTEMPTS} попыток`);
}

async function counterTotal(store: ObjectStore, key: string): Promise<{ total: number; attempts: number }> {
  await store.write(key, encoder.encode('0'), JSON_TYPE);
  const writer = async (): Promise<number> => {
    let attempts = 0;
    for (let step = 0; step < COUNTER_STEPS; step += 1) attempts += await increment(store, key);
    return attempts;
  };
  const attempts = await Promise.all(Array.from({ length: COUNTER_WRITERS }, writer));
  const stored = await store.read(key);
  return { total: Number(decoder.decode(stored?.body)), attempts: attempts.reduce((sum, value) => sum + value, 0) };
}

async function medianWriteMs(store: ObjectStore, key: string): Promise<number> {
  const times: number[] = [];
  for (let index = 0; index < LATENCY_WRITES; index += 1) {
    const etag = (await store.read(key))?.etag ?? '';
    const started = performance.now();
    await store.write(key, encoder.encode(String(index)), { ...JSON_TYPE, condition: { ifMatch: etag } });
    times.push(performance.now() - started);
  }
  times.sort((left, right) => left - right);
  return Math.round((times[Math.floor(times.length / 2)] ?? 0) * 10) / 10;
}

await ensureBucket(LOCAL_MINIO);
const store = createS3Store(LOCAL_MINIO);
const run = `probe/${Date.now()}`;
const created = await createOnce(store, `${run}/pointer.json`);
const refused = await staleRefused(store, `${run}/pointer.json`);
const races: number[] = [];
for (let round = 0; round < RACE_ROUNDS; round += 1) races.push(await raceWinners(store, `${run}/pointer.json`, round));
const counter = await counterTotal(store, `${run}/counter.json`);
const median = await medianWriteMs(store, `${run}/pointer.json`);
const expected = COUNTER_WRITERS * COUNTER_STEPS;
line(`«создать, только если нет»: ${created ? 'да' : 'нет'}`);
line(`запись по старому отпечатку отклонена: ${refused ? 'да' : 'нет'}`);
line(`гонка ${RACE_WRITERS} записей по одному отпечатку, ${RACE_ROUNDS} раз: прошло ${races.join(', ')}`);
line(
  `${COUNTER_WRITERS} писателей по ${COUNTER_STEPS} правок: итог ${counter.total} из ${expected}, попыток ${counter.attempts}`,
);
line(`условная запись: медиана ${median} мс`);
const passed =
  created &&
  refused &&
  races.every((winners) => winners === 1) &&
  counter.total === expected &&
  median <= LATENCY_LIMIT_MS;
line(passed ? 'проба прошла' : 'проба не прошла');
process.exitCode = passed ? 0 : 1;
