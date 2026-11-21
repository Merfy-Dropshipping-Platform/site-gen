// Событие «после публикации стало хуже» и сводка последней проверенной публикации (этап 5b, Ч1).
import { describe, expect, it, vi } from 'vitest';
import { summaryAnswer } from '../src/audit/answer';
import type { AuditJob, AuditResult } from '../src/audit/contract';
import { forMerchant, isRegression, type AuditRegressed } from '../src/audit/regressed';
import { onAuditResult, type AuditResultDeps } from '../src/audit/results';
import type { AuditMetrics, AuditReport } from '../src/checks/audit/report';
import type { Queryable } from '../src/shop-state';

const SHOP = '25669e80-6add-4fd5-b39d-b9065d2cc918';
const TENANT = 'org-7';
const BUILD = 1795000000000;

const WAS: AuditMetrics = { perf: 0.91, lcpMs: 2100, fcpMs: 900, tbtMs: 100, cls: 0, siMs: 1500 };
const report = (metrics: Partial<AuditMetrics>): AuditReport => ({
  metrics: { ...WAS, ...metrics },
  lcp: { where: 'img hero.jpg', section: 'hero-1', name: 'shop:hero' },
  opportunities: [],
});
const WORSE = report({ lcpMs: 3400, perf: 0.7 });

const result = (patch: Partial<AuditResult> = {}): AuditResult => ({
  v: 1,
  siteId: SHOP,
  build: BUILD,
  pageId: 'home',
  path: '/',
  status: 'done',
  reason: null,
  report: report({}),
  measuredAt: '2026-11-21T12:00:00.000Z',
  ...patch,
});

const JOB: AuditJob = {
  v: 1,
  siteId: SHOP,
  build: BUILD,
  pageId: 'home',
  path: '/',
  url: 'https://25669e806add.dev.merfy.ru/',
  hash: 'f'.repeat(64),
  platform: [],
  samples: [],
};

// Серия из трёх прогонов: строка пишется сразу (без перемера); `platform` — секции сборки, оставшиеся библиотечными.
const series = (reports: AuditReport[], platform: string[] = []): AuditResult =>
  result({ report: reports.at(-1) ?? null, job: { ...JOB, platform, samples: reports.slice(0, -1) } });

// База-двойник: прошлый аудит страницы, организация магазина, записи.
function fakeDb(previous: AuditMetrics | null) {
  const writes: unknown[][] = [];
  const query = vi.fn().mockImplementation((...args: unknown[]) => {
    const [sql, params] = args;
    if (typeof sql !== 'string') return Promise.resolve({ rows: [] });
    if (sql.includes('INSERT INTO storefront_audit') && Array.isArray(params)) writes.push(params);
    if (sql.includes('FROM site')) return Promise.resolve({ rows: [{ tenant_id: TENANT }] });
    return Promise.resolve({ rows: sql.includes('FROM storefront_audit') && previous ? [previous] : [] });
  });
  const db: Queryable = { query };
  return { db, writes };
}

function depsOf(db: Queryable) {
  const publishRegressed = vi.fn<(event: AuditRegressed) => Promise<void>>().mockResolvedValue(undefined);
  const publishAudit = vi.fn().mockResolvedValue(undefined);
  const log = vi.fn();
  const deps: AuditResultDeps = { db, publishAudit, publishRegressed, log };
  return { deps, publishRegressed, publishAudit, log };
}

describe('правило «стало хуже для мерчанта»', () => {
  it('done и находка не платформы — да; одни платформенные, чистый аудит, failed — нет', () => {
    const silent = { fix: 'silent' };
    const platform = { fix: 'platform' };
    expect(isRegression('done', [platform, silent])).toBe(true);
    expect(isRegression('done', [platform])).toBe(false);
    expect(isRegression('done', [])).toBe(false);
    expect(isRegression('failed', [silent])).toBe(false);
    expect(forMerchant([platform, silent])).toEqual([silent]);
  });
});

describe('onAuditResult: событие audit.regressed', () => {
  it('стало хуже — одно событие с метриками, прошлым, элементом LCP и находками', async () => {
    const { db } = fakeDb(WAS);
    const { deps, publishRegressed } = depsOf(db);
    await onAuditResult(deps, result({ report: WORSE }));
    expect(publishRegressed).toHaveBeenCalledTimes(1);
    const [event] = publishRegressed.mock.calls[0] ?? [];
    expect(event).toMatchObject({
      type: 'audit.regressed',
      eventId: `${SHOP}:${BUILD}:/`,
      siteId: SHOP,
      tenantId: TENANT,
      build: BUILD,
      path: '/',
      pageId: 'home',
      measuredAt: '2026-11-21T12:00:00.000Z',
      metrics: WORSE.metrics,
      previous: WAS,
      lcp: { element: 'img hero.jpg', section: 'hero-1' },
    });
    expect(event?.findings.map((finding) => finding.rule)).toEqual(['lcp-regressed', 'perf-dropped']);
    expect(event).not.toHaveProperty('publishedBy');
  });

  it('публикацию нажал пользователь (job.publishedBy) — он в событии; задание без поля — события без поля', async () => {
    const { db } = fakeDb(WAS);
    const { deps, publishRegressed } = depsOf(db);
    // Серия из трёх прогонов готова — перемер не нужен, строка и событие сразу.
    const done = (job: Partial<AuditJob>) => result({ report: WORSE, job: { ...JOB, samples: [WORSE, WORSE], ...job } });
    await onAuditResult(deps, done({ publishedBy: 'user-1' }));
    await onAuditResult(deps, done({}));
    await onAuditResult(deps, result({ report: WORSE }));
    const [withAuthor, withoutAuthor, withoutJob] = publishRegressed.mock.calls.map(([event]) => event);
    expect(withAuthor).toMatchObject({ type: 'audit.regressed', publishedBy: 'user-1' });
    expect(withoutAuthor).not.toHaveProperty('publishedBy');
    expect(withoutJob).not.toHaveProperty('publishedBy');
  });

  it('перемер несёт автора дальше: задание перемера — то же задание с publishedBy', async () => {
    const { db } = fakeDb(WAS);
    const { deps, publishAudit, publishRegressed } = depsOf(db);
    const first = result({ report: WORSE, job: { ...JOB, publishedBy: 'user-1' } });
    await onAuditResult(deps, first);
    expect(publishRegressed).not.toHaveBeenCalled();
    expect(publishAudit).toHaveBeenCalledWith(expect.objectContaining({ publishedBy: 'user-1' }));
  });

  it('чистый аудит — события нет', async () => {
    const { db, writes } = fakeDb(WAS);
    const { deps, publishRegressed } = depsOf(db);
    await onAuditResult(deps, result());
    expect(writes).toHaveLength(1);
    expect(publishRegressed).not.toHaveBeenCalled();
  });

  it('первый аудит страницы (сравнивать не с чем) — события нет', async () => {
    const { db } = fakeDb(null);
    const { deps, publishRegressed } = depsOf(db);
    await onAuditResult(deps, result({ report: WORSE }));
    expect(publishRegressed).not.toHaveBeenCalled();
  });

  it('одни находки платформы — события нет, запись есть', async () => {
    const { db, writes } = fakeDb(WAS);
    const { deps, publishRegressed } = depsOf(db);
    const lcpOnly = report({ lcpMs: 3400 });
    await onAuditResult(deps, series([lcpOnly, lcpOnly, lcpOnly], ['shop:hero']));
    expect(writes).toHaveLength(1);
    expect(publishRegressed).not.toHaveBeenCalled();
  });

  it('платформенные и мерчантские вместе — в событии только мерчантские', async () => {
    const { db } = fakeDb(WAS);
    const { deps, publishRegressed } = depsOf(db);
    await onAuditResult(deps, series([WORSE, WORSE, WORSE], ['shop:hero']));
    const [event] = publishRegressed.mock.calls[0] ?? [];
    expect(event?.findings.map((finding) => [finding.rule, finding.fix])).toEqual([['perf-dropped', 'silent']]);
  });

  it('перемер — события нет: строки ещё нет', async () => {
    const { db, writes } = fakeDb(WAS);
    const { deps, publishRegressed, publishAudit } = depsOf(db);
    await onAuditResult(deps, result({ report: WORSE, job: JOB }));
    expect(publishAudit).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([]);
    expect(publishRegressed).not.toHaveBeenCalled();
  });

  it('аудит не отработал — события нет', async () => {
    const { db } = fakeDb(WAS);
    const { deps, publishRegressed } = depsOf(db);
    await onAuditResult(deps, result({ status: 'failed', reason: 'не уложился', report: null }));
    expect(publishRegressed).not.toHaveBeenCalled();
  });

  it('брокер недоступен — запись сделана, сообщение не возвращается (ошибки нет), в журнале строка', async () => {
    const { db, writes } = fakeDb(WAS);
    const { deps, publishRegressed, log } = depsOf(db);
    publishRegressed.mockRejectedValue(new Error('брокер недоступен'));
    await expect(onAuditResult(deps, result({ report: WORSE }))).resolves.toBeUndefined();
    expect(writes).toHaveLength(1);
    expect(log).toHaveBeenCalledWith('audit-regressed-failed', expect.objectContaining({ error: 'брокер недоступен' }));
    expect(log).toHaveBeenCalledWith('audit-recorded', expect.objectContaining({ worse: 2 }));
  });

  it('организацию не прочитали — тоже не ломает запись', async () => {
    const { db, writes } = fakeDb(WAS);
    const failing = {
      query: vi
        .fn()
        .mockImplementation((sql: string, params?: unknown[]) =>
          sql.includes('FROM site') ? Promise.reject(new Error('нет связи')) : db.query(sql, params),
        ),
    } satisfies Queryable;
    const { deps, publishRegressed, log } = depsOf(failing);
    await onAuditResult(deps, result({ report: WORSE }));
    expect(writes).toHaveLength(1);
    expect(publishRegressed).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('audit-regressed-failed', expect.objectContaining({ error: 'нет связи' }));
  });
});

describe('сводка последней проверенной публикации', () => {
  const row = (patch: Record<string, unknown> = {}) => ({
    build: String(BUILD),
    path: '/',
    pageId: 'home',
    ...WORSE.metrics,
    previous: WAS,
    findings: [{ rule: 'lcp-regressed', fix: 'silent', text: 'Стало хуже: LCP 2,1 → 3,4 с' }],
    measuredAt: new Date('2026-11-21T12:00:00.000Z'),
    ...patch,
  });
  const dbWith = (rows: unknown[]) => ({
    db: { query: vi.fn().mockResolvedValue({ rows }) } satisfies Queryable,
    log: vi.fn(),
  });

  it('запрос берёт строки только последней сборки с удавшимся аудитом, по магазину', async () => {
    const deps = dbWith([row()]);
    await summaryAnswer(deps, SHOP);
    const call: unknown[] = deps.db.query.mock.calls[0] ?? [];
    const [sql, params] = call;
    expect(sql).toMatch(/WHERE site_id = \$1 AND status = 'done'/);
    expect(sql).toMatch(
      /build = \(SELECT max\(build\) FROM storefront_audit WHERE site_id = \$1 AND status = 'done'\)/,
    );
    expect(params).toEqual([SHOP]);
  });

  it('страницы сборки и вердикт: есть находка не платформы — regressed, measuredAt — самый поздний аудит', async () => {
    const answer = await summaryAnswer(
      dbWith([
        row(),
        row({ path: '/catalog', pageId: 'catalog', findings: [], measuredAt: new Date('2026-11-21T12:03:00.000Z') }),
      ]),
      SHOP,
    );
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toEqual({
      build: BUILD,
      measuredAt: '2026-11-21T12:03:00.000Z',
      regressed: true,
      pages: [
        {
          path: '/',
          pageId: 'home',
          metrics: WORSE.metrics,
          previous: WAS,
          findings: [{ rule: 'lcp-regressed', fix: 'silent', text: 'Стало хуже: LCP 2,1 → 3,4 с' }],
        },
        { path: '/catalog', pageId: 'catalog', metrics: WORSE.metrics, previous: WAS, findings: [] },
      ],
    });
  });

  it('одни находки платформы — regressed: false, в страницах их нет', async () => {
    const answer = await summaryAnswer(dbWith([row({ findings: [{ rule: 'lcp-regressed', fix: 'platform' }] })]), SHOP);
    expect(JSON.parse(answer.body)).toMatchObject({ regressed: false, pages: [{ findings: [] }] });
  });

  it('платформенная и мерчантская находки на разных страницах — regressed: true', async () => {
    const platform = row({ findings: [{ rule: 'lcp-regressed', fix: 'platform' }] });
    const answer = await summaryAnswer(dbWith([platform, row({ path: '/catalog', pageId: 'catalog' })]), SHOP);
    expect(JSON.parse(answer.body)).toMatchObject({ regressed: true });
  });

  it('чистая сборка — regressed: false', async () => {
    const answer = await summaryAnswer(dbWith([row({ findings: [] })]), SHOP);
    expect(JSON.parse(answer.body)).toMatchObject({ build: BUILD, regressed: false });
  });

  it('аудита нет — 404; shop не uuid — 400; сбой базы — 500', async () => {
    expect((await summaryAnswer(dbWith([]), SHOP)).status).toBe(404);
    expect((await summaryAnswer(dbWith([]), 'не uuid')).status).toBe(400);
    expect((await summaryAnswer(dbWith([]), null)).status).toBe(400);
    const failing = { db: { query: vi.fn().mockRejectedValue(new Error('нет связи')) }, log: vi.fn() };
    expect((await summaryAnswer(failing, SHOP)).status).toBe(500);
    expect(failing.log).toHaveBeenCalledWith(
      'audit-summary-read-failed',
      expect.objectContaining({ error: 'нет связи' }),
    );
  });
});
