// Ответ аудита в сборщике: сравнение с прошлым аудитом той же страницы, запись строки, чтение последнего аудита для sites.
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { auditAnswer } from '../src/audit/answer';
import { AUDIT_RESULTS_QUEUE, type AuditResult } from '../src/audit/contract';
import { consumeAuditResults, onAuditResult, type AuditResultDeps } from '../src/audit/results';
import type { AuditMetrics, AuditReport } from '../src/checks/audit/report';
import type { Broker, Handler } from '../src/broker';
import type { Queryable } from '../src/shop-state';

const SHOP = '25669e80-6add-4fd5-b39d-b9065d2cc918';

const WAS: AuditMetrics = { perf: 0.91, lcpMs: 2100, fcpMs: 900, tbtMs: 100, cls: 0, siMs: 1500 };
const report = (metrics: Partial<AuditMetrics>, name: string | null = 'shop:hero'): AuditReport => ({
  metrics: { ...WAS, ...metrics },
  lcp: { where: 'img hero.jpg', section: 'hero-1', name },
  opportunities: [
    { id: 'image-delivery-insight', title: 'Улучшите загрузку изображений', savingsMs: 1350, savingsBytes: 1000 },
  ],
});

const result = (patch: Partial<AuditResult> = {}): AuditResult => ({
  v: 1,
  siteId: SHOP,
  build: 1795000000000,
  pageId: 'home',
  path: '/',
  status: 'done',
  reason: null,
  report: report({}),
  measuredAt: '2026-11-20T12:00:00.000Z',
  ...patch,
});

// База-двойник: прошлый аудит страницы и записанные строки.
function fakeDb(previous: AuditMetrics | null) {
  const writes: unknown[][] = [];
  const query = vi.fn().mockImplementation((...args: unknown[]) => {
    const [sql, params] = args;
    const isWrite = typeof sql === 'string' && sql.includes('INSERT INTO storefront_audit');
    if (isWrite && Array.isArray(params)) writes.push(params);
    return Promise.resolve({ rows: isWrite || previous === null ? [] : [previous] });
  });
  const db: Queryable = { query };
  return { db, query, writes };
}

const depsOf = (db: Queryable, library: string[] = []): AuditResultDeps => ({
  db,
  library: () => Promise.resolve(new Set(library)),
  log: vi.fn(),
});

// Колонки записи по порядку RECORD_SQL.
const COLUMN = {
  status: 4,
  reason: 5,
  perf: 6,
  lcpMs: 7,
  lcpElement: 12,
  lcpSection: 13,
  previous: 15,
  findings: 16,
} as const;
const column = (write: unknown[] | undefined, at: number): unknown => write?.[at];
const FindingRow = z.array(z.object({ rule: z.string(), fix: z.string(), section: z.string().nullable() }));
const findingsOf = (write: unknown[] | undefined) =>
  FindingRow.parse(JSON.parse(String(column(write, COLUMN.findings))));

describe('onAuditResult', () => {
  it('первый аудит страницы — строка с метриками, сравнивать не с чем', async () => {
    const { db, writes } = fakeDb(null);
    await onAuditResult(depsOf(db), result());
    const [write] = writes;
    expect(write?.slice(0, 4)).toEqual([SHOP, 1795000000000, '/', 'home']);
    expect([column(write, COLUMN.status), column(write, COLUMN.perf), column(write, COLUMN.lcpMs)]).toEqual([
      'done',
      0.91,
      2100,
    ]);
    expect([column(write, COLUMN.lcpElement), column(write, COLUMN.lcpSection)]).toEqual(['img hero.jpg', 'hero-1']);
    expect(column(write, COLUMN.previous)).toBeNull();
    expect(findingsOf(write)).toEqual([]);
  });

  it('стало хуже прошлого — находки в строке, прошлые метрики рядом', async () => {
    const { db, writes } = fakeDb(WAS);
    await onAuditResult(depsOf(db), result({ report: report({ lcpMs: 3400, perf: 0.8 }) }));
    const [write] = writes;
    expect(JSON.parse(String(column(write, COLUMN.previous)))).toEqual(WAS);
    expect(findingsOf(write).map((finding) => [finding.rule, finding.fix, finding.section])).toEqual([
      ['lcp-regressed', 'silent', 'hero-1'],
      ['perf-dropped', 'silent', null],
    ]);
  });

  it('LCP в неизменённой секции платформы — fix платформе', async () => {
    const { db, writes } = fakeDb(WAS);
    await onAuditResult(depsOf(db, ['shop:hero']), result({ report: report({ lcpMs: 3400 }) }));
    expect(findingsOf(writes[0]).map((finding) => finding.fix)).toEqual(['platform']);
  });

  it('метрики с дробными миллисекундами пишутся целыми', async () => {
    const { db, writes } = fakeDb(null);
    await onAuditResult(depsOf(db), result({ report: report({ lcpMs: 3348.6117 }) }));
    expect(column(writes[0], COLUMN.lcpMs)).toBe(3349);
  });

  it('не отработал — строка с причиной без метрик и сравнения', async () => {
    const { db, writes, query } = fakeDb(WAS);
    await onAuditResult(
      depsOf(db),
      result({ status: 'failed', reason: 'Lighthouse не уложился в 120 с', report: null }),
    );
    const [write] = writes;
    expect([column(write, COLUMN.status), column(write, COLUMN.reason), column(write, COLUMN.perf)]).toEqual([
      'failed',
      'Lighthouse не уложился в 120 с',
      null,
    ]);
    expect(findingsOf(write)).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('прошлый аудит берётся по магазину, странице и более ранней сборке', async () => {
    const { db, query } = fakeDb(null);
    await onAuditResult(depsOf(db), result());
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/status = 'done' AND build < \$3/), [
      SHOP,
      '/',
      1795000000000,
    ]);
  });
});

describe('consumeAuditResults', () => {
  it('ответы берутся по одному, негодный отклоняется', async () => {
    const { db, writes } = fakeDb(null);
    const subscribed: Array<[string, number, Handler]> = [];
    const broker: Pick<Broker, 'consume'> = {
      consume: (queue, prefetch, handler) => Promise.resolve(void subscribed.push([queue, prefetch, handler])),
    };
    await consumeAuditResults(broker, depsOf(db));
    const [[queue, prefetch, handler]] = subscribed;
    expect([queue, prefetch]).toEqual([AUDIT_RESULTS_QUEUE, 1]);
    await handler({ exchange: '', body: result() });
    expect(writes).toHaveLength(1);
    await expect(handler({ exchange: '', body: { v: 1 } })).rejects.toThrow();
  });
});

describe('auditAnswer: последний аудит страницы', () => {
  const row = {
    build: '1795000000000',
    path: '/',
    status: 'done',
    reason: null,
    perf: 0.91,
    lcpMs: 3100,
    fcpMs: 900,
    tbtMs: 100,
    cls: 0,
    siMs: 1500,
    lcpElement: 'img hero.jpg',
    lcpSection: 'hero-1',
    opportunities: [],
    previous: WAS,
    findings: [],
    measuredAt: new Date('2026-11-20T12:00:00.000Z'),
  };
  const dbWith = (rows: unknown[]) => ({
    db: { query: vi.fn().mockResolvedValue({ rows }) } satisfies Queryable,
    log: vi.fn(),
  });

  it('есть строка — 200 с метриками, элементом LCP и прошлыми метриками', async () => {
    const answer = await auditAnswer(dbWith([row]), SHOP, 'home');
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toMatchObject({
      build: 1795000000000,
      path: '/',
      status: 'done',
      measuredAt: '2026-11-20T12:00:00.000Z',
      metrics: { perf: 0.91, lcpMs: 3100 },
      lcp: { where: 'img hero.jpg', section: 'hero-1' },
      previous: WAS,
      limits: { lcpMs: 2500, cls: 0.1, tbtMs: 200 },
    });
  });

  it('не отработал — метрик нет, причина есть', async () => {
    const failed = {
      ...row,
      status: 'failed',
      reason: 'Lighthouse не уложился в 120 с',
      perf: null,
      lcpMs: null,
      fcpMs: null,
      tbtMs: null,
      cls: null,
      siMs: null,
      lcpElement: null,
      lcpSection: null,
      previous: null,
    };
    const answer = await auditAnswer(dbWith([failed]), SHOP, 'home');
    expect(JSON.parse(answer.body)).toMatchObject({
      status: 'failed',
      reason: 'Lighthouse не уложился в 120 с',
      metrics: null,
      lcp: null,
    });
  });

  it('аудита не было — 404; запрос без магазина или страницы — 400', async () => {
    expect((await auditAnswer(dbWith([]), SHOP, 'home')).status).toBe(404);
    expect((await auditAnswer(dbWith([]), 'не uuid', 'home')).status).toBe(400);
    expect((await auditAnswer(dbWith([]), SHOP, null)).status).toBe(400);
  });

  it('сбой базы — 500 и строка журнала', async () => {
    const failing = {
      db: { query: vi.fn().mockRejectedValue(new Error('нет связи')) } satisfies Queryable,
      log: vi.fn(),
    };
    expect((await auditAnswer(failing, SHOP, 'home')).status).toBe(500);
    expect(failing.log).toHaveBeenCalledWith('audit-read-failed', expect.objectContaining({ error: 'нет связи' }));
  });
});
