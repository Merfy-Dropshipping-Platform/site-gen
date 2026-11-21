// Запуск аудита после публикации: какие страницы, в каком порядке, не больше пяти; сбой постановки сборку не роняет.
import { describe, expect, it, vi } from 'vitest';
import { MAX_AUDITS_PER_PUBLISH, type AuditJob } from '../src/audit/contract';
import { auditPlan, changedPages, type Pages } from '../src/audit/plan';
import { auditJobsOf, startAudits, type PublishedBuild } from '../src/audit/start';

// Отпечаток страницы — «sha256:» и 64 знака hex; `digit` — из чего он собран.
const hashOf = (digit: string): string => `sha256:${digit.repeat(64)}`;

const row = (path: string, digit = 'a', list?: { page: number }): Pages[number] => ({
  path,
  file: `${path === '/' ? '' : path.slice(1) + '/'}index.html`,
  hash: hashOf(digit),
  entity: { type: 'site', id: 'shop' },
  deps: [],
  dataUpdatedAt: '2026-11-20T10:00:00.000Z',
  ...(list === undefined ? {} : { list }),
});

const pathsOf = (pages: Pages): string[] => pages.map((page) => page.path);

describe('изменённые страницы', () => {
  it('живой сборки не было — все страницы', () => {
    expect(pathsOf(changedPages(null, [row('/'), row('/cart')]))).toEqual(['/', '/cart']);
  });

  it('с другим отпечатком и новые; те же и удалённые — нет', () => {
    const before = [row('/', 'a'), row('/catalog', 'b'), row('/old', 'c')];
    const after = [row('/', 'a'), row('/catalog', 'd'), row('/cart')];
    expect(pathsOf(changedPages(before, after))).toEqual(['/catalog', '/cart']);
  });
});

describe('план аудита', () => {
  it('приоритет: главная, каталог, товар, корзина, остальные', () => {
    const next = [row('/about'), row('/cart'), row('/product/scarf'), row('/catalog'), row('/'), row('/blogs/news')];
    expect(pathsOf(auditPlan(null, next))).toEqual(['/', '/catalog', '/product/scarf', '/cart', '/about']);
  });

  it(`не больше ${MAX_AUDITS_PER_PUBLISH}: остальные отбрасываются с конца`, () => {
    const next = ['/z', '/y', '/x', '/w', '/v', '/u', '/'].map((path) => row(path));
    const plan = pathsOf(auditPlan(null, next));
    expect(plan).toHaveLength(MAX_AUDITS_PER_PUBLISH);
    expect(plan).toEqual(['/', '/u', '/v', '/w', '/x']);
  });

  it('страницы списка после первой не аудируются', () => {
    const next = [row('/catalog', 'a', { page: 1 }), row('/catalog/page/2', 'b', { page: 2 })];
    expect(pathsOf(auditPlan(null, next))).toEqual(['/catalog']);
  });

  it('ничего не изменилось — плана нет', () => {
    const same = [row('/'), row('/cart')];
    expect(auditPlan(same, same)).toEqual([]);
  });
});

const published = (patch: Partial<PublishedBuild> = {}): PublishedBuild => ({
  siteId: '25669e80-6add-4fd5-b39d-b9065d2cc918',
  build: 1795000000000,
  publicUrl: 'https://25669e806add.dev.merfy.ru',
  pageId: (path) => (path === '/' ? 'home' : path.slice(1)),
  previous: null,
  next: [row('/'), row('/catalog', 'b')],
  platform: ['shop:hero'],
  ...patch,
});

describe('задания аудита', () => {
  it('на каждую страницу плана: адрес на витрине, отпечаток файла, номер сборки', () => {
    const jobs = auditJobsOf(published());
    expect(jobs.map((job) => [job.pageId, job.path, job.url, job.build])).toEqual([
      ['home', '/', 'https://25669e806add.dev.merfy.ru/', 1795000000000],
      ['catalog', '/catalog', 'https://25669e806add.dev.merfy.ru/catalog', 1795000000000],
    ]);
  });

  it('в задании отпечаток — hex без «sha256:», как ETag раздачи', () => {
    expect(auditJobsOf(published()).map((job) => job.hash)).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
  });

  it('задание несёт платформенные секции сборки и пустую серию прогонов', () => {
    const [job] = auditJobsOf(published({ platform: ['shop:hero', 'shop:footer'] }));
    expect(job).toMatchObject({ platform: ['shop:hero', 'shop:footer'], samples: [] });
  });

  it('автор публикации — в каждом задании как publishedBy; нет автора (null или поля нет) — поля нет', () => {
    const withAuthor = auditJobsOf(published({ publishedBy: 'user-1' }));
    expect(withAuthor.map((job) => job.publishedBy)).toEqual(['user-1', 'user-1']);
    for (const publishedBy of [null, undefined]) {
      const jobs = auditJobsOf(published({ publishedBy }));
      jobs.forEach((job) => expect(job).not.toHaveProperty('publishedBy'));
    }
  });

  it('ставятся по порядку приоритета и считаются', async () => {
    const sent: AuditJob[] = [];
    const log = vi.fn();
    const queued = await startAudits({ publish: (job) => Promise.resolve(void sent.push(job)), log }, published());
    expect(queued).toBe(2);
    expect(sent.map((job) => job.path)).toEqual(['/', '/catalog']);
    expect(log).toHaveBeenCalledWith('audit-queued', expect.objectContaining({ pages: 2 }));
  });

  it('сбой постановки одной страницы — в журнал, остальные ставятся', async () => {
    const sent: string[] = [];
    const log = vi.fn();
    const publish = (job: AuditJob): Promise<void> =>
      job.path === '/' ? Promise.reject(new Error('брокер недоступен')) : Promise.resolve(void sent.push(job.path));
    const queued = await startAudits({ publish, log }, published());
    expect(queued).toBe(1);
    expect(sent).toEqual(['/catalog']);
    expect(log).toHaveBeenCalledWith(
      'audit-queue-failed',
      expect.objectContaining({ path: '/', error: 'брокер недоступен' }),
    );
  });

  it('изменённых страниц нет — заданий нет', async () => {
    const same = [row('/')];
    const publish = vi.fn();
    expect(await startAudits({ publish, log: vi.fn() }, published({ previous: same, next: same }))).toBe(0);
    expect(publish).not.toHaveBeenCalled();
  });
});
