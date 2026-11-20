// Медиана прогонов аудита (место `audit`): один прогон Lighthouse шумит (на нагруженной машине LCP одной страницы
// 3,2 ↔ 8,2 с), поэтому правила «стало хуже» считаются по медиане трёх прогонов, а база сравнения — медиана последних
// трёх аудитов страницы.
import type { AuditMetrics, AuditReport } from './report';

// Прогонов в серии: первый и два перемера, если на первом сработало правило.
export const SERIES_RUNS = 3;
// Прошлых аудитов страницы в базе сравнения.
export const BASELINE_AUDITS = 3;

// Медиана; у чётного числа — среднее двух средних.
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const high = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? high : ((sorted[middle - 1] ?? high) + high) / 2;
}

// Медиана каждой метрики отдельно. Пустой список — ошибка вызова: медианы нет.
export function medianMetrics(list: readonly AuditMetrics[]): AuditMetrics {
  if (list.length === 0) throw new Error('медиана пустого списка прогонов');
  const of = (field: keyof AuditMetrics): number => median(list.map((metrics) => metrics[field]));
  return {
    perf: of('perf'),
    lcpMs: of('lcpMs'),
    fcpMs: of('fcpMs'),
    tbtMs: of('tbtMs'),
    cls: of('cls'),
    siMs: of('siMs'),
  };
}

// Отчёт серии: метрики — медианы, главный элемент и возможности — из прогона с медианным LCP (он ближе всего к тому, что
// видит посетитель).
export function medianReport(reports: readonly AuditReport[]): AuditReport {
  const metrics = medianMetrics(reports.map((report) => report.metrics));
  const sorted = [...reports].sort((a, b) => a.metrics.lcpMs - b.metrics.lcpMs);
  const typical = sorted[Math.floor((sorted.length - 1) / 2)];
  if (typical === undefined) throw new Error('медиана пустого списка прогонов');
  return { metrics, lcp: typical.lcp, opportunities: typical.opportunities };
}
