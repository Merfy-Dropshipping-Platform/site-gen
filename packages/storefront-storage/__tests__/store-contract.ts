import { describe, expect, it } from 'vitest';
import type { ObjectStore } from '../src/store';

// Контракт хранилища: одни и те же проверки для памяти (быстрые тесты) и для MinIO (тесты на настоящем хранилище).
// Память ведёт себя так же, как S3, — поэтому быстрым тестам остальных модулей можно верить.

export const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
export const text = (data: Uint8Array): string => new TextDecoder().decode(data);
const JSON_TYPE = { contentType: 'application/json' };

export function describeStoreContract(name: string, setup: () => { store: ObjectStore; prefix: string }): void {
  describe(`${name}: контракт хранилища`, () => {
    it('читает записанное вместе с отпечатком версии', async () => {
      const { store, prefix } = setup();
      const written = await store.write(`${prefix}a.json`, bytes('{"a":1}'), JSON_TYPE);
      const stored = await store.read(`${prefix}a.json`);
      expect(written.written).toBe(true);
      expect(stored === null ? null : text(stored.body)).toBe('{"a":1}');
      expect(stored?.etag).toBe(written.written ? written.etag : 'нет');
      expect(await store.has(`${prefix}a.json`)).toBe(true);
    });

    it('объекта нет — read отдаёт null, has — false', async () => {
      const { store, prefix } = setup();
      expect(await store.read(`${prefix}none.json`)).toBeNull();
      expect(await store.has(`${prefix}none.json`)).toBe(false);
    });

    it('«только если нет»: второй раз не пишет', async () => {
      const { store, prefix } = setup();
      const condition = { ifNoneMatch: '*' } as const;
      expect((await store.write(`${prefix}once`, bytes('1'), { ...JSON_TYPE, condition })).written).toBe(true);
      expect((await store.write(`${prefix}once`, bytes('2'), { ...JSON_TYPE, condition })).written).toBe(false);
      const stored = await store.read(`${prefix}once`);
      expect(stored === null ? null : text(stored.body)).toBe('1');
    });

    it('«только если не менялся»: по свежему отпечатку пишет, по старому — нет', async () => {
      const { store, prefix } = setup();
      const first = await store.write(`${prefix}p`, bytes('1'), JSON_TYPE);
      const etag = first.written ? first.etag : '';
      const second = await store.write(`${prefix}p`, bytes('2'), { ...JSON_TYPE, condition: { ifMatch: etag } });
      const stale = await store.write(`${prefix}p`, bytes('3'), { ...JSON_TYPE, condition: { ifMatch: etag } });
      expect(second.written).toBe(true);
      expect(second.written ? second.etag : etag).not.toBe(etag);
      expect(stale.written).toBe(false);
    });

    // Поэтому каждая запись указателя несёт новый номер записи: иначе вторая запись по старому отпечатку прошла бы.
    it('отпечаток — по содержимому: те же байты — тот же отпечаток', async () => {
      const { store, prefix } = setup();
      const first = await store.write(`${prefix}same`, bytes('{"n":1}'), JSON_TYPE);
      const again = await store.write(`${prefix}same`, bytes('{"n":1}'), JSON_TYPE);
      const other = await store.write(`${prefix}same`, bytes('{"n":2}'), JSON_TYPE);
      expect(again.written && first.written ? again.etag : 'нет').toBe(first.written ? first.etag : '');
      expect(other.written && first.written ? other.etag : '').not.toBe(first.written ? first.etag : '');
    });

    it('список — только по префиксу, со временем записи', async () => {
      const { store, prefix } = setup();
      await store.write(`${prefix}list/a`, bytes('a'), JSON_TYPE);
      await store.write(`${prefix}list/b`, bytes('b'), JSON_TYPE);
      await store.write(`${prefix}other/c`, bytes('c'), JSON_TYPE);
      const listed = await store.list(`${prefix}list/`);
      expect(listed.map((object) => object.key)).toEqual([`${prefix}list/a`, `${prefix}list/b`]);
      expect(listed.every((object) => !Number.isNaN(Date.parse(object.modifiedAt)))).toBe(true);
    });

    it('удаляет названные ключи, отсутствующий ключ — не ошибка', async () => {
      const { store, prefix } = setup();
      await store.write(`${prefix}r/a`, bytes('a'), JSON_TYPE);
      await store.write(`${prefix}r/b`, bytes('b'), JSON_TYPE);
      await store.remove([`${prefix}r/a`, `${prefix}r/none`]);
      expect((await store.list(`${prefix}r/`)).map((object) => object.key)).toEqual([`${prefix}r/b`]);
    });
  });
}
