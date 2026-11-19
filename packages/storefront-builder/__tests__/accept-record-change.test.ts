import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptIncoming, type AcceptDeps } from '../src/accept';
import { parseIncoming, CONTENT_EXCHANGE, contentEventBody } from '../src/events';
import type { Accepted, ShopEvent, StartedJob } from '../src/shop-state';

// Правка записей расширения → пересборка магазина целиком; правки подряд — одна сборка (design.md блока 6, В6-3 Б).
// Строка магазина — на настоящем Postgres в stack-тестах (shop-state.test.ts); здесь — маршрут события до неё.
const mocks = vi.hoisted(() => ({ acceptEvent: vi.fn(), holdRelease: vi.fn() }));
vi.mock('../src/shop-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/shop-state')>()),
  acceptEvent: mocks.acceptEvent,
  holdRelease: mocks.holdRelease,
}));

const SITE = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
const AT = '2026-11-19T10:00:00.000Z';
const body = {
  ...contentEventBody({ type: 'extension-record-change', siteId: SITE, eventAt: AT, source: 'extensions' }),
  extensionId: 'popups',
  recordIds: ['p-1'],
};

// Свободный магазин занимается первым событием; занятый склеивает: следующая сборка одна на все.
function shopLikeRow(): (event: ShopEvent) => Accepted {
  let busy = false;
  let pending = 0;
  return ({ siteId }) => {
    if (!busy) {
      busy = true;
      return { outcome: 'started', siteId, build: 100, priority: 2 };
    }
    pending += 1;
    return { outcome: 'coalesced', siteId, events: 1, pending, build: 101 };
  };
}

function setup(status = 'published') {
  const query = vi.fn().mockResolvedValue({ rows: [{ id: SITE, status }] });
  const enqueued: StartedJob[] = [];
  const deps: AcceptDeps = {
    db: { query, connect: vi.fn() },
    themeIds: ['nova'],
    shopState: { leaseMs: 60_000, retryDelaysMs: [] },
    releaseSlots: 1,
    log: vi.fn(),
    enqueue: (job: StartedJob) => {
      enqueued.push(job);
      return Promise.resolve();
    },
  };
  return { deps, enqueued };
}

const incoming = () => parseIncoming(CONTENT_EXCHANGE, body, AT);

describe('extension-record-change на стороне сборщика', () => {
  beforeEach(() => {
    mocks.acceptEvent.mockReset();
    const row = shopLikeRow();
    mocks.acceptEvent.mockImplementation((_db: unknown, event: ShopEvent) => Promise.resolve(row(event)));
  });

  it('событие — задание сборки магазина с приоритетом правки', async () => {
    const { deps, enqueued } = setup();
    await acceptIncoming(deps, incoming());
    expect(enqueued).toEqual([expect.objectContaining({ siteId: SITE, build: 100, priority: 2 })]);
    expect(mocks.acceptEvent).toHaveBeenCalledWith(deps.db, { siteId: SITE, priority: 2, eventAt: AT }, deps.shopState);
  });

  it('пачка событий подряд — одно задание, остальные склеены', async () => {
    const { deps, enqueued } = setup();
    const outcomes: Accepted[] = [];
    for (let i = 0; i < 5; i += 1) outcomes.push(...(await acceptIncoming(deps, incoming())));
    expect(outcomes.map((result) => result.outcome)).toEqual([
      'started',
      'coalesced',
      'coalesced',
      'coalesced',
      'coalesced',
    ]);
    expect(enqueued).toHaveLength(1);
  });

  it('магазин не опубликован — события игнорируются, сборки нет', async () => {
    const { deps, enqueued } = setup('draft');
    await acceptIncoming(deps, incoming());
    expect(enqueued).toEqual([]);
    expect(mocks.acceptEvent).not.toHaveBeenCalled();
  });
});
