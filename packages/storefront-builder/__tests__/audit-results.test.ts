// Ответ аудита в сборщике: сравнение с прошлым аудитом той же страницы, запись строки, чтение последнего аудита для sites.
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { auditAnswer, supersededAnswer } from '../src/audit/answer';
import { AUDIT_RESULTS_QUEUE, type AuditJob, type AuditResult } from '../src/audit/contract';
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

// База-двойник: прошлые аудиты страницы (последние первыми; один — просто метрики) и записанные строки.
function fakeDb(previous: AuditMetrics | AuditMetrics[] | null) {
  const writes: unknown[][] = [];
  const past = [previous ?? []].flat();
  const query = vi.fn().mockImplementation((...args: unknown[]) => {
    const [sql, params] = args;
    const isWrite = typeof sql === 'string' && sql.includes('INSERT INTO storefront_audit');
    if (isWrite && Array.isArray(params)) writes.push(params);
    return Promise.resolve({ rows: isWrite ? [] : past });
  });
  const db: Queryable = { query };
  return { db, query, writes };
}

const depsOf = (db: Queryable): AuditResultDeps & { publishAudit: ReturnType<typeof vi.fn> } => ({
  db,
  publishAudit: vi.fn().mockResolvedValue(undefined),
  log: vi.fn(),
});

const JOB: AuditJob = {
  v: 1,
  siteId: SHOP,
  build: 1795000000000,
  pageId: 'home',
  path: '/',
  url: 'https://25669e806add.dev.merfy.ru/',
  hash: 'f'.repeat(64),
  platform: [],
  samples: [],
};

// Ответ серии: прогоны до последнего лежат в задании, последний — отчёт ответа.
function series(reports: AuditReport[], platform: string[] = []): AuditResult {
  const last = reports.at(-1) ?? null;
  return result({ report: last, job: { ...JOB, platform, samples: reports.slice(0, -1) } });
}

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
    await onAuditResult(depsOf(db), result({ report: report({ lcpMs: 3400, perf: 0.7 }) }));
    const [write] = writes;
    expect(JSON.parse(String(column(write, COLUMN.previous)))).toEqual(WAS);
    expect(findingsOf(write).map((finding) => [finding.rule, finding.fix, finding.section])).toEqual([
      ['lcp-regressed', 'silent', 'hero-1'],
      ['perf-dropped', 'silent', null],
    ]);
  });

  it('LCP в неизменённой секции платформы — fix платформе', async () => {
    const { db, writes } = fakeDb(WAS);
    const worse = report({ lcpMs: 3400 });
    await onAuditResult(depsOf(db), series([worse, worse, worse], ['shop:hero']));
    expect(findingsOf(writes[0]).map((finding) => finding.fix)).toEqual(['platform']);
  });

  it('секция не в списке платформенных сборки — находка агенту', async () => {
    const { db, writes } = fakeDb(WAS);
    const worse = report({ lcpMs: 3400 });
    await onAuditResult(depsOf(db), series([worse, worse, worse], ['shop:footer']));
    expect(findingsOf(writes[0]).map((finding) => finding.fix)).toEqual(['silent']);
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

// Шум замеров: правила считаются по медиане трёх прогонов, база — медиана последних трёх аудитов.
describe('onAuditResult: серия прогонов и база сравнения', () => {
  const worse = report({ lcpMs: 3400 });
  const fine = report({ lcpMs: 2100 });

  it('на первом прогоне сработало правило — ставится перемер с уже снятым прогоном, строки ещё нет', async () => {
    const { db, writes } = fakeDb(WAS);
    const deps = depsOf(db);
    await onAuditResult(deps, result({ report: worse, job: JOB }));
    expect(writes).toEqual([]);
    expect(deps.publishAudit).toHaveBeenCalledWith({ ...JOB, samples: [worse] });
    expect(deps.log).toHaveBeenCalledWith('audit-remeasure', expect.objectContaining({ run: 2 }));
  });

  it('первый прогон в норме — перемера нет, строка пишется сразу', async () => {
    const { db, writes } = fakeDb(WAS);
    const deps = depsOf(db);
    await onAuditResult(deps, result({ report: fine, job: JOB }));
    expect(deps.publishAudit).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
  });

  it('серия идёт: второй прогон ставит третий, не разбирая правила', async () => {
    const { db, writes } = fakeDb(WAS);
    const deps = depsOf(db);
    await onAuditResult(deps, series([worse, fine]));
    expect(deps.publishAudit).toHaveBeenCalledWith({ ...JOB, samples: [worse, fine] });
    expect(writes).toEqual([]);
  });

  it('три прогона: медиана в норме — находок нет, в строке медиана', async () => {
    const { db, writes } = fakeDb(WAS);
    const deps = depsOf(db);
    await onAuditResult(deps, series([worse, fine, report({ lcpMs: 2200 })]));
    expect(deps.publishAudit).not.toHaveBeenCalled();
    expect(column(writes[0], COLUMN.lcpMs)).toBe(2200);
    expect(findingsOf(writes[0])).toEqual([]);
  });

  it('три прогона: медиана хуже базы — находка по медиане', async () => {
    const { db, writes } = fakeDb(WAS);
    await onAuditResult(depsOf(db), series([worse, report({ lcpMs: 3600 }), fine]));
    expect(column(writes[0], COLUMN.lcpMs)).toBe(3400);
    expect(findingsOf(writes[0]).map((finding) => finding.rule)).toEqual(['lcp-regressed']);
  });

  it('прогон серии не отработал — строка по удавшимся прогонам, а не «не отработал»', async () => {
    const { db, writes } = fakeDb(WAS);
    const failed = result({
      status: 'failed',
      reason: 'Lighthouse не уложился в 120 с',
      report: null,
      job: { ...JOB, samples: [worse, report({ lcpMs: 3500 })] },
    });
    await onAuditResult(depsOf(db), failed);
    expect([column(writes[0], COLUMN.status), column(writes[0], COLUMN.reason)]).toEqual(['done', null]);
    expect(findingsOf(writes[0]).map((finding) => finding.rule)).toEqual(['lcp-regressed']);
  });

  it('перемер не поставился — строка по тому, что снято', async () => {
    const { db, writes } = fakeDb(WAS);
    const deps = depsOf(db);
    deps.publishAudit.mockRejectedValue(new Error('брокер недоступен'));
    await onAuditResult(deps, result({ report: worse, job: JOB }));
    expect(deps.log).toHaveBeenCalledWith(
      'audit-remeasure-failed',
      expect.objectContaining({ error: 'брокер недоступен' }),
    );
    expect(writes).toHaveLength(1);
  });

  it('ответ без задания (прежний проверяющий процесс) серий не ведёт', async () => {
    const { db, writes } = fakeDb(WAS);
    const deps = depsOf(db);
    await onAuditResult(deps, result({ report: worse }));
    expect(deps.publishAudit).not.toHaveBeenCalled();
    expect(findingsOf(writes[0]).map((finding) => finding.rule)).toEqual(['lcp-regressed']);
  });

  it('база — медиана трёх последних аудитов: один шумный прошлый не решает', async () => {
    const noisy = { ...WAS, lcpMs: 8000 };
    const past = [noisy, { ...WAS, lcpMs: 2100 }, { ...WAS, lcpMs: 2200 }];
    const { db, writes } = fakeDb(past);
    const deps = depsOf(db);
    await onAuditResult(deps, result({ report: report({ lcpMs: 3000 }), job: JOB }));
    // Против одного прошлого (8000) 3000 — не хуже; против медианы (2200) — хуже, перемер.
    expect(deps.publishAudit).toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('в строке «прошлое» — медиана базы', async () => {
    const { db, writes } = fakeDb([
      { ...WAS, lcpMs: 2000 },
      { ...WAS, lcpMs: 2600 },
      { ...WAS, lcpMs: 2200 },
    ]);
    await onAuditResult(depsOf(db), result());
    expect(JSON.parse(String(column(writes[0], COLUMN.previous)))).toMatchObject({ lcpMs: 2200 });
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

describe('supersededAnswer: вытеснено ли задание новой сборкой', () => {
  const dbWith = (rows: unknown[]) => ({
    db: { query: vi.fn().mockResolvedValue({ rows }) } satisfies Queryable,
    log: vi.fn(),
  });

  it('позже вышла живая сборка — superseded: true; запрос по магазину и номеру сборки', async () => {
    const deps = dbWith([{ '?column?': 1 }]);
    const answer = await supersededAnswer(deps, SHOP, '1795000000000');
    expect(JSON.parse(answer.body)).toEqual({ superseded: true });
    expect(deps.db.query).toHaveBeenCalledWith(expect.stringMatching(/build > \$2 AND outcome = 'live'/), [
      SHOP,
      1795000000000,
    ]);
  });

  it('новее ничего нет — superseded: false', async () => {
    expect(JSON.parse((await supersededAnswer(dbWith([]), SHOP, '1795000000000')).body)).toEqual({ superseded: false });
  });

  it('негодный запрос — 400, сбой базы — 500', async () => {
    expect((await supersededAnswer(dbWith([]), SHOP, 'abc')).status).toBe(400);
    expect((await supersededAnswer(dbWith([]), 'не uuid', '1')).status).toBe(400);
    const failing = { db: { query: vi.fn().mockRejectedValue(new Error('нет связи')) }, log: vi.fn() };
    expect((await supersededAnswer(failing, SHOP, '1795000000000')).status).toBe(500);
  });
});
