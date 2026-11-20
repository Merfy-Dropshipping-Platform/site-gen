// Медиана прогонов аудита: метрики по отдельности; элемент и возможности — из прогона с медианным LCP.
import { describe, expect, it } from 'vitest';
import { median, medianMetrics, medianReport } from '../src/checks/audit/median';
import type { AuditMetrics, AuditReport } from '../src/checks/audit/report';

const metrics = (patch: Partial<AuditMetrics>): AuditMetrics => ({
  perf: 0.9,
  lcpMs: 2000,
  fcpMs: 900,
  tbtMs: 100,
  cls: 0,
  siMs: 1500,
  ...patch,
});

const reportOf = (patch: Partial<AuditMetrics>, where: string): AuditReport => ({
  metrics: metrics(patch),
  lcp: { where, section: null, name: null },
  opportunities: [{ id: where, title: where, savingsMs: 1, savingsBytes: 1 }],
});

describe('median', () => {
  it('нечётное число — средний, чётное — среднее двух средних, порядок значений не важен', () => {
    expect(median([8200, 3300, 3400])).toBe(3400);
    expect(median([3, 1])).toBe(2);
    expect(median([5])).toBe(5);
  });
});

describe('medianMetrics', () => {
  it('каждая метрика — своя медиана', () => {
    const list = [
      metrics({ lcpMs: 3300, tbtMs: 500, perf: 0.8 }),
      metrics({ lcpMs: 8200, tbtMs: 100, perf: 0.6 }),
      metrics({ lcpMs: 3400, tbtMs: 120, perf: 0.85 }),
    ];
    expect(medianMetrics(list)).toMatchObject({ lcpMs: 3400, tbtMs: 120, perf: 0.8 });
  });

  it('пустой список — ошибка вызова', () => {
    expect(() => medianMetrics([])).toThrow(/пустого списка/);
  });
});

describe('medianReport', () => {
  it('метрики — медианы, элемент и возможности — из прогона с медианным LCP', () => {
    const slow = reportOf({ lcpMs: 8200 }, 'медленный');
    const middle = reportOf({ lcpMs: 3400 }, 'средний');
    const fast = reportOf({ lcpMs: 3300 }, 'быстрый');
    const result = medianReport([slow, fast, middle]);
    expect(result.metrics.lcpMs).toBe(3400);
    expect(result.lcp?.where).toBe('средний');
    expect(result.opportunities[0]?.id).toBe('средний');
  });

  it('один прогон — он сам; два — прогон с меньшим LCP даёт элемент, метрики — среднее', () => {
    const only = reportOf({}, 'один');
    expect(medianReport([only])).toEqual(only);
    const two = medianReport([reportOf({ lcpMs: 3000 }, 'хуже'), reportOf({ lcpMs: 2000 }, 'лучше')]);
    expect(two.lcp?.where).toBe('лучше');
    expect(two.metrics.lcpMs).toBe(2500);
  });
});
