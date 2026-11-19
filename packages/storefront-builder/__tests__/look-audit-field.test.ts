// Последний аудит страницы после публикации — в ответе снимка черновика (поле `audit`), откуда его берёт MCP.
import { describe, expect, it, vi } from 'vitest';
import { auditUrl } from '../src/audit/read';
import { LOOK_PATTERN, runLookJob, type LookDeps, type LookReply } from '../src/look/look-job';
import { fakeRenderer } from './look-fixture';

const NOW = 1_800_000_000_000;
const SITE = '3a9626f7-390d-4a66-bca5-a3b806ca6c1b';
const SITES = 'http://sites-service-dev:3114';

const AUDIT = {
  build: 1795000000000,
  path: '/',
  status: 'done',
  reason: null,
  measuredAt: '2026-11-20T12:00:00.000Z',
  metrics: { perf: 0.91, lcpMs: 3100, fcpMs: 900, tbtMs: 100, cls: 0, siMs: 1500 },
  lcp: { where: 'img hero.jpg', section: 'hero-1' },
  opportunities: [],
  previous: { perf: 0.95, lcpMs: 2000, fcpMs: 900, tbtMs: 100, cls: 0, siMs: 1400 },
  limits: { lcpMs: 2500, cls: 0.1, tbtMs: 200 },
  findings: [],
};

const job = (data: Record<string, unknown> = {}) => ({
  pattern: LOOK_PATTERN,
  data: { v: 1, siteId: SITE, page: 'home', devices: 'mobile', full: false, deadline: NOW + 55_000, ...data },
});

const page = () =>
  new Response('<!doctype html><html><body></body></html>', { status: 200, headers: { 'content-type': 'text/html' } });

function setup(audit: () => Promise<Response>) {
  const calls: string[] = [];
  const fetch: LookDeps['fetch'] = (url) => {
    calls.push(url);
    return url.includes('/audit?') ? audit() : Promise.resolve(page());
  };
  const deps: LookDeps = {
    renderer: fakeRenderer().renderer,
    fetch,
    sitesUrl: `${SITES}/`,
    log: vi.fn(),
    now: () => NOW,
  };
  return { deps, calls };
}

const auditOf = (reply: LookReply) => (reply.ok ? reply.snapshot.audit : 'ошибка снимка');

describe('аудит в снимке страницы', () => {
  it('sites отдал аудит — он в снимке; спрашивается страница снимка', async () => {
    const { deps, calls } = setup(() => Promise.resolve(Response.json(AUDIT)));
    expect(auditOf(await runLookJob(deps, job({ page: 'catalog' })))).toEqual(AUDIT);
    expect(calls).toEqual([`${SITES}/api/sites/${SITE}/preview?page=catalog`, auditUrl(SITES, SITE, 'catalog')]);
  });

  it.each([
    ['аудита не было (404)', () => Promise.resolve(new Response('{}', { status: 404 }))],
    ['sites недоступен', () => Promise.reject(new Error('сеть'))],
    ['ответ не по форме', () => Promise.resolve(Response.json({ perf: 1 }))],
    ['ответ не JSON', () => Promise.resolve(new Response('не json', { status: 200 }))],
  ])('%s — снимок идёт без поля', async (_name, audit) => {
    const reply = await runLookJob(setup(audit).deps, job());
    expect(reply.ok).toBe(true);
    expect(auditOf(reply)).toBeUndefined();
  });

  it('снимок секции аудит не спрашивает', async () => {
    const { deps, calls } = setup(() => Promise.resolve(Response.json(AUDIT)));
    await runLookJob(deps, job({ section: 'hero-1' }));
    expect(calls.some((url) => url.includes('/audit?'))).toBe(false);
  });
});
