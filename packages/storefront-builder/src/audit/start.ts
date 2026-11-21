import { routeOf, type BuildInputs } from '@merfy/storefront-build';
import { hexOf } from '@merfy/storefront-storage';
import { errorText } from '../errors';
import type { Log } from '../log';
import type { AuditJob } from './contract';
import { auditPlan, type Pages } from './plan';

// Запуск аудита после публикации: после сборки с исходом `live` — задание на каждую изменённую страницу (не больше
// пяти, по приоритету). Постановка не должна ронять сборку: витрина уже переключена, сбой — строка журнала.

export interface AuditStartDeps {
  publish: (job: AuditJob) => Promise<void>;
  log: Log;
}

export interface PublishedBuild {
  siteId: string;
  build: number;
  // Публичный адрес магазина, без пути страницы.
  publicUrl: string;
  // id страницы в конфиге витрины по её адресу (`pageIdOf`).
  pageId: (path: string) => string;
  // Страницы живой сборки до публикации; null — живой сборки не было.
  previous: Pages | null;
  next: Pages;
  // Секции этой сборки, оставшиеся библиотечными: полные имена (`data-section`).
  platform: readonly string[];
  // Кто нажал публикацию (id пользователя); нет — null или поля нет: в задании поля не будет.
  publishedBy?: string | null;
}

// Автор публикации в задании: есть — поле `publishedBy`, нет — задание прежней формы.
const publishedByField = (published: PublishedBuild): Pick<AuditJob, 'publishedBy'> =>
  published.publishedBy ? { publishedBy: published.publishedBy } : {};

// id страницы в конфиге витрины по адресу; адреса нет в таблице страниц — сам адрес.
export const pageIdOf =
  (inputs: BuildInputs) =>
  (path: string): string => {
    try {
      return routeOf(path, inputs).id;
    } catch {
      return path;
    }
  };

export function auditJobsOf(published: PublishedBuild): AuditJob[] {
  return auditPlan(published.previous, published.next).map((page) => ({
    v: 1,
    siteId: published.siteId,
    build: published.build,
    pageId: published.pageId(page.path),
    path: page.path,
    url: new URL(page.path, published.publicUrl).href,
    // ETag раздачи — hex отпечатка без «sha256:».
    hash: hexOf(page.hash),
    platform: [...published.platform],
    samples: [],
    ...publishedByField(published),
  }));
}

// Ставит задания по порядку приоритета. Возвращает, сколько поставлено.
export async function startAudits(deps: AuditStartDeps, published: PublishedBuild): Promise<number> {
  const jobs = auditJobsOf(published);
  let queued = 0;
  for (const job of jobs) {
    try {
      await deps.publish(job);
      queued += 1;
    } catch (error) {
      deps.log('audit-queue-failed', {
        shopId: job.siteId,
        buildId: job.build,
        path: job.path,
        error: errorText(error),
      });
    }
  }
  deps.log('audit-queued', { shopId: published.siteId, buildId: published.build, pages: queued });
  return queued;
}
