import { z } from 'zod';
import { SERIES_RUNS } from '../checks/audit/median';
import { AuditMetrics, AuditOpportunity, AuditReport } from '../checks/audit/report';
import { parseWith } from '../parse';

// Аудит после публикации (место проверок `audit`): сборщик после сборки с исходом `live` кладёт по заданию на страницу в
// storefront_audits, проверяющий процесс (там Chromium и Lighthouse) прогоняет опубликованную страницу и отвечает в
// storefront_audit_results; ответ берёт сборщик: сравнивает с прошлым аудитом той же страницы и пишет в
// storefront_audit. Тот же способ, что у проверок выпуска (`release/checks.ts`).
export const AUDITS_QUEUE = 'storefront_audits';
export const AUDIT_RESULTS_QUEUE = 'storefront_audit_results';

// Не больше страниц за одну публикацию: Lighthouse по странице — десятки секунд процессора.
export const MAX_AUDITS_PER_PUBLISH = 5;

const auditJobSchema = z.strictObject({
  v: z.literal(1),
  siteId: z.string().min(1),
  // Номер сборки, после которой поставлено задание.
  build: z.int().positive(),
  // id страницы в конфиге витрины (`home`, `catalog`, `product`, `page-cart`…) и её адрес на витрине.
  pageId: z.string().min(1),
  path: z.string().startsWith('/'),
  url: z.url(),
  // Отпечаток файла страницы из манифеста новой сборки: ETag раздачи совпал — отдаётся новая страница.
  hash: z.string().min(1),
  // Секции этой сборки, оставшиеся библиотечными (по её опубликованным исходникам): находки в них чинит платформа.
  platform: z.array(z.string()).default([]),
  // Прогоны серии (`checks/audit/median.ts`): задание, поставленное сборкой, пусто; перемер после сработавшего правила
  // несёт уже снятые прогоны.
  samples: z
    .array(AuditReport)
    .max(SERIES_RUNS - 1)
    .default([]),
});

const auditResultSchema = z.strictObject({
  v: z.literal(1),
  siteId: z.string().min(1),
  build: z.int().positive(),
  pageId: z.string().min(1),
  path: z.string().startsWith('/'),
  // Задание целиком: по нему сборщик ставит перемер. Ответы без него (прежний проверяющий процесс) серий не ведут.
  job: auditJobSchema.optional(),
  // `failed` — «не отработал»: причина в `reason`, отчёта нет.
  status: z.enum(['done', 'failed']),
  reason: z.string().nullable(),
  report: AuditReport.nullable(),
  // Когда прогон закончен (ISO).
  measuredAt: z.iso.datetime(),
});

// Последний аудит страницы магазина: ответ сборщика `GET /audit` (`audit/answer.ts`) для sites и проверяющего процесса,
// который кладёт его в снимок черновика (`audit` в `look-job.ts`), откуда его берёт MCP. `findings` — находки «стало
// хуже» в общем виде (`CheckFinding`); проверяющий процесс их не разбирает.
export const latestAuditSchema = z.strictObject({
  build: z.int().positive(),
  path: z.string().startsWith('/'),
  status: z.enum(['done', 'failed']),
  reason: z.string().nullable(),
  measuredAt: z.iso.datetime(),
  metrics: AuditMetrics.nullable(),
  lcp: z.strictObject({ where: z.string(), section: z.string().nullable() }).nullable(),
  opportunities: z.array(AuditOpportunity),
  previous: AuditMetrics.nullable(),
  // Пороги «хорошо» для показа (`AUDIT_LIMITS`): LCP, CLS и TBT на телефоне.
  limits: z.strictObject({ lcpMs: z.number(), cls: z.number(), tbtMs: z.number() }),
  findings: z.array(z.unknown()),
});

export type AuditJob = z.infer<typeof auditJobSchema>;
export type AuditResult = z.infer<typeof auditResultSchema>;
export type LatestAudit = z.infer<typeof latestAuditSchema>;

export const parseAuditJob = (raw: unknown): AuditJob =>
  parseWith(auditJobSchema, raw, 'message-invalid', AUDITS_QUEUE);
export const parseAuditResult = (raw: unknown): AuditResult =>
  parseWith(auditResultSchema, raw, 'message-invalid', AUDIT_RESULTS_QUEUE);
