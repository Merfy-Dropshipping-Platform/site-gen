import { describe, expect, it } from 'vitest';
import type { LogFields } from '../src/log';
import { logRouteDuplicates } from '../src/route-duplicates';

// Совпавшие адреса записей (блок 8 «Секций и SDK», часть 8б): строка журнала на запись, сборка идёт.
describe('совпавшие адреса записей в журнале', () => {
  it('строка route-duplicate: магазин, сборка, запись, занятый адрес и полученный адрес', () => {
    const lines: [string, LogFields | undefined][] = [];
    const log = (message: string, fields?: LogFields): void => {
      lines.push([message, fields]);
    };
    logRouteDuplicates(log, { shopId: 's1', buildId: 7 }, [
      { type: 'product', id: 'p2', path: '/product/sharf', page: '/product/p2' },
      { type: 'product', id: 'p3', path: '/product/sharf', page: null },
    ]);
    logRouteDuplicates(log, { shopId: 's1', buildId: 8 }, []);
    expect(lines).toEqual([
      [
        'route-duplicate',
        { shopId: 's1', buildId: 7, type: 'product', id: 'p2', path: '/product/sharf', page: '/product/p2' },
      ],
      ['route-duplicate', { shopId: 's1', buildId: 7, type: 'product', id: 'p3', path: '/product/sharf', page: null }],
    ]);
  });
});
