import { latestAuditSchema, type LatestAudit } from './contract';

// Последний аудит страницы для снимка черновика: проверяющий процесс спрашивает sites (`GET /api/sites/:id/audit`), тот —
// сборщик (`audit/answer.ts`). Аудит — довесок к снимку: нет его, sites не ответил или ответ не по форме — снимок идёт без
// поля, а не падает.
export const AUDIT_READ_TIMEOUT_MS = 2_000;

export interface AuditReadDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  // Адрес sites внутри сети: http://sites-service-dev:3114 на dev.
  sitesUrl: string;
}

export const auditUrl = (sitesUrl: string, siteId: string, page: string): string =>
  `${sitesUrl.replace(/\/+$/, '')}/api/sites/${encodeURIComponent(siteId)}/audit?page=${encodeURIComponent(page)}`;

export async function readLatestAudit(deps: AuditReadDeps, siteId: string, page: string): Promise<LatestAudit | null> {
  try {
    const response = await deps.fetch(auditUrl(deps.sitesUrl, siteId, page), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(AUDIT_READ_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const parsed = latestAuditSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
