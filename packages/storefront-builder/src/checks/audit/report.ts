// Отчёт Lighthouse по опубликованной странице (место `audit`, README рядом: «Что сейчас»). Из отчёта берутся только
// числа Web Vitals, главный элемент первого экрана (LCP) и несколько главных возможностей с байтами и миллисекундами.
// Прогон — Lighthouse navigation, телефон, стандартное замедление (`look/look-audit.ts`, `navigate`).
import { z } from 'zod';

// Метрики одного прогона: оценка 0–1 и время в мс (CLS — безразмерный).
export const AuditMetrics = z.strictObject({
  perf: z.number().min(0).max(1),
  lcpMs: z.number().min(0),
  fcpMs: z.number().min(0),
  tbtMs: z.number().min(0),
  cls: z.number().min(0),
  siMs: z.number().min(0),
});
export type AuditMetrics = z.infer<typeof AuditMetrics>;

// Главный элемент первого экрана: где он (словами), секция (`data-section-id`) и её имя (`data-section`).
export const AuditLcp = z.strictObject({
  where: z.string(),
  section: z.string().nullable(),
  name: z.string().nullable(),
});
export type AuditLcp = z.infer<typeof AuditLcp>;

export const AuditOpportunity = z.strictObject({
  id: z.string(),
  title: z.string(),
  savingsMs: z.number().min(0),
  savingsBytes: z.number().min(0),
});
export type AuditOpportunity = z.infer<typeof AuditOpportunity>;

// Возможностей в отчёте: до пяти главных.
export const MAX_OPPORTUNITIES = 5;

export const AuditReport = z.strictObject({
  metrics: AuditMetrics,
  lcp: AuditLcp.nullable(),
  opportunities: z.array(AuditOpportunity).max(MAX_OPPORTUNITIES),
});
export type AuditReport = z.infer<typeof AuditReport>;

// Проверки Lighthouse с числами метрик.
const METRIC_AUDITS = {
  lcpMs: 'largest-contentful-paint',
  fcpMs: 'first-contentful-paint',
  tbtMs: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
  siMs: 'speed-index',
} as const;

const Lhr = z.object({
  categories: z.object({ performance: z.object({ score: z.number() }) }),
  audits: z.record(z.string(), z.unknown()),
});
const NumericAudit = z.object({ numericValue: z.number() });

function metricOf(audits: Record<string, unknown>, id: string): number {
  return NumericAudit.parse(audits[id]).numericValue;
}

export function metricsOf(report: unknown): AuditMetrics {
  const { categories, audits } = Lhr.parse(report);
  return AuditMetrics.parse({
    perf: categories.performance.score,
    lcpMs: metricOf(audits, METRIC_AUDITS.lcpMs),
    fcpMs: metricOf(audits, METRIC_AUDITS.fcpMs),
    tbtMs: metricOf(audits, METRIC_AUDITS.tbtMs),
    cls: metricOf(audits, METRIC_AUDITS.cls),
    siMs: metricOf(audits, METRIC_AUDITS.siMs),
  });
}

// Элемент LCP из отчёта: путь (по нему страница находит секцию) и начало разметки — запасное описание. В Lighthouse 13
// элемент стоит узлом (`type: 'node'`) среди деталей «выводов» про LCP.
const LcpNode = z.object({ type: z.literal('node'), path: z.string().optional(), snippet: z.string().optional() });
const LcpDetails = z.object({ details: z.object({ items: z.array(z.unknown()) }) });
const LCP_INSIGHTS = ['lcp-breakdown-insight', 'lcp-discovery-insight'] as const;

export interface LcpNodeRaw {
  path: string | null;
  snippet: string;
}

export function lcpNodeOf(report: unknown): LcpNodeRaw | null {
  const { audits } = Lhr.parse(report);
  const items = LCP_INSIGHTS.flatMap((id) => {
    const found = LcpDetails.safeParse(audits[id]);
    return found.success ? found.data.details.items : [];
  });
  const node = items.map((item) => LcpNode.safeParse(item)).find((item) => item.success)?.data;
  return node === undefined ? null : { path: node.path ?? null, snippet: node.snippet ?? '' };
}

// Возможность — проверка с выигрышем: у «возможностей» Lighthouse он в `details.overallSavings*`, у «выводов» (insights,
// Lighthouse 13) — в `metricSavings` по метрикам. Выигрыш по времени — наибольший по LCP, FCP и TBT.
const Savings = z.object({
  title: z.string(),
  score: z.number().nullable().optional(),
  numericValue: z.number().optional(),
  numericUnit: z.string().optional(),
  details: z.object({ overallSavingsMs: z.number().optional(), overallSavingsBytes: z.number().optional() }).optional(),
  metricSavings: z.record(z.string(), z.number()).optional(),
});
const TIME_METRICS = ['LCP', 'FCP', 'TBT'] as const;

// «Вывод» с единицей `byte`: его число — сколько байт можно сэкономить.
const bytesOf = ({ numericUnit, numericValue }: z.infer<typeof Savings>): number =>
  numericUnit === 'byte' ? (numericValue ?? 0) : 0;

function savingsOf(id: string, audit: unknown): AuditOpportunity | null {
  const parsed = Savings.safeParse(audit);
  if (!parsed.success || parsed.data.score === 1) return null;
  const { title, details, metricSavings } = parsed.data;
  const byMetric = TIME_METRICS.map((metric) => metricSavings?.[metric] ?? 0);
  const savingsMs = Math.round(Math.max(details?.overallSavingsMs ?? 0, ...byMetric));
  const savingsBytes = Math.round(details?.overallSavingsBytes ?? bytesOf(parsed.data));
  return savingsMs > 0 || savingsBytes > 0 ? { id, title, savingsMs, savingsBytes } : null;
}

export function opportunitiesOf(report: unknown): AuditOpportunity[] {
  const { audits } = Lhr.parse(report);
  return Object.entries(audits)
    .map(([id, audit]) => savingsOf(id, audit))
    .filter((item): item is AuditOpportunity => item !== null)
    .sort((a, b) => b.savingsMs - a.savingsMs || b.savingsBytes - a.savingsBytes || a.id.localeCompare(b.id))
    .slice(0, MAX_OPPORTUNITIES);
}
