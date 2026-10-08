import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { JSON_TYPE, UPDATE_ATTEMPTS, readObject, updateObject, writeObject, type Decision } from '../src/objects';
import { parseWith } from '../src/parse';
import type { ObjectStore } from '../src/store';
import { createMemoryStore } from './memory-store';
import { bytes, text } from './store-contract';
import { rejected } from './support';

const KEY = 'storefront/test/counter.json';
const counterSchema = z.strictObject({ count: z.int() });
type Counter = z.infer<typeof counterSchema>;
const parseCounter = (value: unknown, key: string): Counter => parseWith(counterSchema, value, key);

// Довести счётчик до target: уже там — не писать.
const toTarget =
  (target: number) =>
  (current: Counter | null): Decision<Counter, string> =>
    current?.count === target ? { outcome: 'уже', next: null } : { outcome: 'записал', next: { count: target } };

// Хранилище, в котором перед первой записью успевает записать кто-то ещё.
function withRival(store: ObjectStore, rival: Counter): ObjectStore {
  let raced = false;
  return {
    ...store,
    write: async (key, body, options) => {
      if (!raced) await store.write(key, bytes(JSON.stringify(rival)), { contentType: JSON_TYPE });
      raced = true;
      return store.write(key, body, options);
    },
  };
}

describe('чтение и запись объектов', () => {
  it('объекта нет — null; есть — значение по схеме и отпечаток версии', async () => {
    const store = createMemoryStore();
    expect(await readObject(store, KEY, parseCounter)).toBeNull();
    await writeObject(store, KEY, { count: 1 });
    const stored = await readObject(store, KEY, parseCounter);
    expect(stored?.value).toEqual({ count: 1 });
    expect(stored?.etag).toBe(store.objects.get(KEY)?.etag);
    expect(store.objects.get(KEY)?.contentType).toBe('application/json');
  });

  it('не JSON — object-invalid с ключом', async () => {
    const store = createMemoryStore();
    await store.write(KEY, bytes('{сломан'), { contentType: JSON_TYPE });
    expect(await rejected(() => readObject(store, KEY, parseCounter))).toMatchObject({
      code: 'object-invalid',
      path: KEY,
    });
  });

  it('не по схеме — object-invalid с путём поля', async () => {
    const store = createMemoryStore();
    await writeObject(store, KEY, { count: 'один' });
    expect(await rejected(() => readObject(store, KEY, parseCounter))).toMatchObject({ path: `${KEY}#count` });
  });
});

describe('условное обновление', () => {
  it('объекта нет — создаёт', async () => {
    const store = createMemoryStore();
    expect(await updateObject(store, KEY, parseCounter, toTarget(1))).toEqual({
      outcome: 'записал',
      value: { count: 1 },
    });
    expect(text(store.objects.get(KEY)?.body ?? bytes(''))).toBe('{"count":1}');
  });

  it('уже в нужном состоянии — не пишет', async () => {
    const store = createMemoryStore();
    await writeObject(store, KEY, { count: 2 });
    expect(await updateObject(store, KEY, parseCounter, toTarget(2))).toEqual({ outcome: 'уже', value: { count: 2 } });
    expect(store.writes).toHaveLength(1);
  });

  it('кто-то записал между чтением и записью — перечитывает и решает заново', async () => {
    const store = createMemoryStore();
    await writeObject(store, KEY, { count: 0 });
    const seen: (number | undefined)[] = [];
    const decide = (current: Counter | null): Decision<Counter, string> => {
      seen.push(current?.count);
      return { outcome: 'плюс один', next: { count: (current?.count ?? 0) + 1 } };
    };
    const result = await updateObject(withRival(store, { count: 10 }), KEY, parseCounter, decide);
    expect(seen).toEqual([0, 10]);
    expect(result.value).toEqual({ count: 11 });
  });

  it('повтор записи вернул отказ, хотя первая попытка записала, — «уже в нужном состоянии» и есть успех', async () => {
    const store = createMemoryStore();
    const lossy: ObjectStore = {
      ...store,
      write: async (key, body, options) => {
        await store.write(key, body, options);
        return { written: false };
      },
    };
    expect(await updateObject(lossy, KEY, parseCounter, toTarget(3))).toEqual({ outcome: 'уже', value: { count: 3 } });
  });

  it(`не записал за ${UPDATE_ATTEMPTS} попыток — update-conflict`, async () => {
    const store = createMemoryStore();
    const busy: ObjectStore = { ...store, write: () => Promise.resolve({ written: false }) };
    expect(await rejected(() => updateObject(busy, KEY, parseCounter, toTarget(1)))).toMatchObject({
      code: 'update-conflict',
      path: KEY,
    });
  });
});
