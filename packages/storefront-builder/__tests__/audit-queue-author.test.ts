// Автор публикации в заданиях аудита: сборка (`ClaimedJob.publishedBy`) → задание на страницу (`AuditJob.publishedBy`).
import { parseBuildInputs } from '@merfy/storefront-build';
import { describe, expect, it, vi } from 'vitest';
import standInputsJson from '../../storefront-build/fixtures/stand-inputs.json';
import { parseAuditJob, parseAuditResult, type AuditJob } from '../src/audit/contract';
import type { Pages } from '../src/audit/plan';
import { queueAudits } from '../src/build-job';
import { PRIORITY } from '../src/events';
import type { ClaimedJob } from '../src/shop-state';

const SITE = '25669e80-6add-4fd5-b39d-b9065d2cc918';
const NEXT: Pages = [
  {
    path: '/',
    file: 'index.html',
    hash: `sha256:${'a'.repeat(64)}`,
    entity: { type: 'site', id: 'shop' },
    deps: [],
    dataUpdatedAt: '2026-11-21T10:00:00.000Z',
  },
];

const jobOf = (patch: Partial<ClaimedJob>): ClaimedJob => ({
  siteId: SITE,
  build: 1795000000000,
  priority: PRIORITY.publish,
  attempt: 0,
  events: 1,
  eventAt: new Date('2026-11-21T10:00:00.000Z'),
  queuedAt: new Date('2026-11-21T10:00:00.000Z'),
  startedAt: new Date('2026-11-21T10:00:01.000Z'),
  publishedBy: null,
  ...patch,
});

// Секции магазина — стенд сборки; база без ответов: какие секции библиотечные, для автора неважно.
const INPUTS = parseBuildInputs(standInputsJson);

async function queued(job: ClaimedJob): Promise<AuditJob[]> {
  const sent: AuditJob[] = [];
  const db = { query: vi.fn().mockResolvedValue({ rows: [] }), connect: vi.fn().mockRejectedValue(new Error('нет базы')) };
  const deps = { db, log: vi.fn(), publishAudit: (audit: AuditJob) => Promise.resolve(void sent.push(audit)) };
  const snapshot = { address: { url: 'https://25669e806add.dev.merfy.ru', label: '25669e806add' } };
  await queueAudits(deps, job, snapshot, INPUTS, null, NEXT);
  return sent;
}

describe('схема задания и ответа: publishedBy необязательный', () => {
  const message = {
    v: 1,
    siteId: SITE,
    build: 1795000000000,
    pageId: 'home',
    path: '/',
    url: 'https://25669e806add.dev.merfy.ru/',
    hash: 'f'.repeat(64),
  };

  it('сообщение прежней формы без поля — верно; с полем — автор сохранён', () => {
    expect(parseAuditJob(message)).not.toHaveProperty('publishedBy');
    expect(parseAuditJob({ ...message, publishedBy: 'user-1' }).publishedBy).toBe('user-1');
  });

  it('ответ проверяющего процесса возвращает автора в job', () => {
    const answer = {
      v: 1,
      siteId: SITE,
      build: message.build,
      pageId: 'home',
      path: '/',
      job: { ...message, publishedBy: 'user-1' },
      status: 'failed',
      reason: 'не отработал',
      report: null,
      measuredAt: '2026-11-21T10:05:00.000Z',
    };
    expect(parseAuditResult(answer).job?.publishedBy).toBe('user-1');
  });

  it('пустой автор — message-invalid', () => {
    expect(() => parseAuditJob({ ...message, publishedBy: '' })).toThrow(/publishedBy/);
  });
});

describe('задания аудита после публикации: автор', () => {
  it('сборка знает, кто нажал публикацию, — он в задании', async () => {
    const [audit] = await queued(jobOf({ publishedBy: 'user-1' }));
    expect(audit).toMatchObject({ siteId: SITE, path: '/', publishedBy: 'user-1' });
  });

  it('публикация без автора — в задании поля нет', async () => {
    const [audit] = await queued(jobOf({ publishedBy: null }));
    expect(audit).toBeDefined();
    expect(audit).not.toHaveProperty('publishedBy');
  });

  it('сборка не из публикации — заданий нет, даже если автор известен', async () => {
    expect(await queued(jobOf({ priority: PRIORITY.edit, publishedBy: 'user-1' }))).toEqual([]);
  });
});
