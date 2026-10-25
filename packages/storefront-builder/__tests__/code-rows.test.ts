import { sha256 } from '@merfy/storefront-build';
import type { Queryable } from '@merfy/storefront-sections';
import { describe, expect, it, vi } from 'vitest';
import { readVisibleSections, type CodeDeps } from '../src/code';

// Какие строки таблицы секций читает превью (блок 14, Р14-14): rows из зависимостей, без них — опубликованные.
describe('строки секций для превью', () => {
  it('readVisibleSections читает строки функцией rows с магазином и расширениями', async () => {
    const rows = vi.fn(() => Promise.resolve([]));
    const db: Queryable = { query: vi.fn() };
    const deps: CodeDeps = {
      db,
      shell: { version: '0.1.0', hash: sha256('ядро'), parts: ['auth', 'cart', 'favorites'], code: '' },
      call: () => Promise.resolve({ success: true, data: [{ id: 'reviews', version: '1.4.0' }] }),
      timeoutMs: 1_000,
      log: () => undefined,
      rows,
    };
    expect(await readVisibleSections(deps, 'shop-1')).toEqual(new Map());
    expect(rows).toHaveBeenCalledWith(db, { shopId: 'shop-1', extensions: [{ id: 'reviews', version: '1.4.0' }] });
  });
});
