// Прогон аудита в проверяющем процессе: ожидание новой страницы в раздаче, бюджет, «не отработал» с причиной, уступка
// места снимку черновика.
import { describe, expect, it, vi } from 'vitest';
import type { Broker, Handler } from '../src/broker';
import { AUDITS_QUEUE, parseAuditJob, type AuditJob, type AuditResult } from '../src/audit/contract';
import { MAX_YIELDS, consumeAudits, runAuditJob, type AuditRunDeps } from '../src/audit/run';
import type { AuditReport } from '../src/checks/audit/report';
import { AuditTimeout, LighthouseYielded } from '../src/look/look-audit';

const HASH = 'f'.repeat(64);

const JOB: AuditJob = {
  v: 1,
  siteId: '25669e80-6add-4fd5-b39d-b9065d2cc918',
  build: 1795000000000,
  pageId: 'home',
  path: '/',
  url: 'https://25669e806add.dev.merfy.ru/',
  hash: HASH,
};

const REPORT: AuditReport = {
  metrics: { perf: 0.91, lcpMs: 2100, fcpMs: 900, tbtMs: 100, cls: 0, siMs: 1500 },
  lcp: { where: 'img hero.jpg', section: 'hero-1', name: 'shop:hero' },
  opportunities: [],
};

const served = (etag: string | null, status = 200): Response =>
  new Response('', { status, headers: etag === null ? {} : { etag } });

const depsOf = (patch: Partial<AuditRunDeps> = {}): AuditRunDeps => ({
  measure: () => Promise.resolve(REPORT),
  fetch: () => Promise.resolve(served(`"${HASH}"`)),
  pollMs: 1,
  waitMs: 30,
  budgetMs: 1_000,
  now: () => new Date('2026-11-20T12:00:00.000Z'),
  log: vi.fn(),
  ...patch,
});

describe('runAuditJob', () => {
  it('раздача отдаёт новую страницу — прогон и ответ done с отчётом и временем', async () => {
    const measure = vi.fn(() => Promise.resolve(REPORT));
    const result = await runAuditJob(depsOf({ measure }), JOB);
    expect(result).toEqual({
      v: 1,
      siteId: JOB.siteId,
      build: JOB.build,
      pageId: 'home',
      path: '/',
      status: 'done',
      reason: null,
      report: REPORT,
      measuredAt: '2026-11-20T12:00:00.000Z',
    });
    expect(measure).toHaveBeenCalledWith(JOB.url, expect.any(Number));
  });

  it('слабый ETag (раздача сжала ответ) — та же страница', async () => {
    const fetch = () => Promise.resolve(served(`W/"${HASH}"`));
    expect((await runAuditJob(depsOf({ fetch }), JOB)).status).toBe('done');
  });

  it('раздача ждёт новую страницу: старый ETag, потом новый', async () => {
    const answers = [served('"old"'), served('"old"'), served(`"${HASH}"`)];
    const fetch = vi.fn(() => Promise.resolve(answers.shift() ?? served(`"${HASH}"`)));
    expect((await runAuditJob(depsOf({ fetch }), JOB)).status).toBe('done');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('раздача не сменила страницу за срок — не отработал, прогона не было', async () => {
    const measure = vi.fn(() => Promise.resolve(REPORT));
    const fetch = () => Promise.resolve(served('"old"'));
    const result = await runAuditJob(depsOf({ measure, fetch }), JOB);
    expect(result).toMatchObject({ status: 'failed', report: null });
    expect(result.reason).toMatch(/раздача не сменила страницу на новую сборку за 0 с: ETag "old"/);
    expect(measure).not.toHaveBeenCalled();
  });

  it('раздача не отвечает — не отработал с «ETag нет»', async () => {
    const fetch = () => Promise.reject(new Error('сеть'));
    expect((await runAuditJob(depsOf({ fetch }), JOB)).reason).toMatch(/ETag нет/);
  });

  it('не уложился в бюджет — не отработал с причиной', async () => {
    const measure = () => Promise.reject(new AuditTimeout(120_000));
    const result = await runAuditJob(depsOf({ measure }), JOB);
    expect(result).toMatchObject({ status: 'failed', reason: 'Lighthouse не уложился в 120 с', report: null });
  });

  it('падение Lighthouse — причина первой строкой', async () => {
    const measure = () => Promise.reject(new Error('NO_FCP\nстек'));
    expect((await runAuditJob(depsOf({ measure }), JOB)).reason).toBe('NO_FCP');
  });

  it('уступил место снимку — повторяет и отдаёт отчёт', async () => {
    const measure = vi
      .fn<AuditRunDeps['measure']>()
      .mockRejectedValueOnce(new LighthouseYielded())
      .mockResolvedValueOnce(REPORT);
    expect((await runAuditJob(depsOf({ measure }), JOB)).status).toBe('done');
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it(`уступал ${MAX_YIELDS} раза — не отработал, причина названа`, async () => {
    const measure = vi.fn(() => Promise.reject(new LighthouseYielded()));
    const result = await runAuditJob(depsOf({ measure }), JOB);
    expect(measure).toHaveBeenCalledTimes(MAX_YIELDS);
    expect(result).toMatchObject({ status: 'failed', reason: 'Lighthouse уступил место снимку черновика' });
  });
});

describe('consumeAudits', () => {
  it('задание из очереди — прогон и ответ в очередь ответов', async () => {
    const results: AuditResult[] = [];
    const subscribed: Array<[string, number, Handler]> = [];
    const broker: Pick<Broker, 'consume' | 'publishAuditResult'> = {
      consume: (queue, prefetch, handler) => Promise.resolve(void subscribed.push([queue, prefetch, handler])),
      publishAuditResult: (result) => Promise.resolve(void results.push(result)),
    };
    await consumeAudits(broker, depsOf());
    const [[queue, prefetch, handler]] = subscribed;
    await handler({ exchange: '', body: JOB });
    expect([queue, prefetch]).toEqual([AUDITS_QUEUE, 1]);
    expect(results.map((result) => [result.path, result.status])).toEqual([['/', 'done']]);
  });
});

describe('задание', () => {
  it('негодное — message-invalid, а не молчание', () => {
    expect(() => parseAuditJob({ ...JOB, url: 'не адрес' })).toThrow();
    expect(() => parseAuditJob({ ...JOB, лишнее: 1 })).toThrow();
    expect(parseAuditJob(JOB)).toEqual(JOB);
  });
});
