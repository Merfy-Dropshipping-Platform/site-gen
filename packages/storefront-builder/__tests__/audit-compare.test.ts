// Сравнение аудита страницы с прошлым (место `audit`): каждое правило «стало хуже» — одна находка; `fix` — по месту.
import { describe, expect, it } from 'vitest';
import { LCP_MIN_GROWTH_MS, PERF_DROP, RULES, auditFindings, type AuditChange } from '../src/checks/audit/compare';
import type { AuditMetrics } from '../src/checks/audit/report';
import { onPlatformSections } from '../src/checks/finding';

const GOOD: AuditMetrics = { perf: 0.91, lcpMs: 2100, fcpMs: 900, tbtMs: 100, cls: 0, siMs: 1500 };

const change = (now: Partial<AuditMetrics>, extra: Partial<AuditChange> = {}): AuditChange => ({
  path: '/catalog',
  was: GOOD,
  now: { ...GOOD, ...now },
  lcp: { where: 'img hero.jpg', section: 'hero-1', name: 'shop:hero' },
  opportunities: [],
  ...extra,
});

const rulesOf = (value: AuditChange): string[] => auditFindings(value).map((finding) => finding.rule);

describe('LCP', () => {
  it('вырос на 20 % и больше и не меньше чем на 300 мс — находка с секцией и элементом', () => {
    const [finding] = auditFindings(change({ lcpMs: 3400 }));
    expect(finding).toMatchObject({
      place: 'audit',
      check: 'lighthouse',
      rule: 'lcp-regressed',
      level: 'warning',
      section: 'hero-1',
      where: 'img hero.jpg',
      count: 1,
      fix: 'silent',
    });
    expect(finding?.text).toMatch(/^Стало хуже: LCP 2,1 → 3,4 с · /);
  });

  it.each([
    ['рост меньше 20 %', { lcpMs: 2400 }],
    ['рост 20 %, но меньше 300 мс', { lcpMs: 2100 + LCP_MIN_GROWTH_MS - 1 }],
    ['LCP уменьшился', { lcpMs: 1500 }],
  ])('нет находки: %s', (_name, now) => {
    expect(rulesOf(change(now))).toEqual([]);
  });

  it('граница: ровно +20 % и ровно +300 мс — находка', () => {
    const was = { ...GOOD, lcpMs: 1500 };
    expect(rulesOf({ ...change({ lcpMs: 1800 }), was })).toEqual(['lcp-regressed']);
  });
});

describe('CLS', () => {
  it('перешёл порог 0,1 — находка', () => {
    const [finding] = auditFindings(change({ cls: 0.14 }));
    expect(finding).toMatchObject({ rule: 'cls-over-limit', section: null, where: '/catalog' });
    expect(finding?.text).toMatch(/^Стало хуже: CLS 0 → 0,14 \(норма 0,1\) · /);
  });

  it.each([
    ['остался под порогом', GOOD, { cls: 0.1 }],
    ['был выше порога и остался', { ...GOOD, cls: 0.2 }, { cls: 0.3 }],
  ])('нет находки: %s', (_name, was, now) => {
    expect(rulesOf({ ...change(now), was })).toEqual([]);
  });
});

describe('TBT', () => {
  it('выше нормы телефона (200 мс) и выше прошлого — находка', () => {
    const [finding] = auditFindings(change({ tbtMs: 380 }));
    expect(finding?.rule).toBe('tbt-over-limit');
    expect(finding?.text).toMatch(/^Стало хуже: TBT 100 → 380 мс \(норма 200\) · /);
  });

  it.each([
    ['в норме', 100, 200],
    ['выше нормы, но не хуже прошлого', 300, 300],
  ])('нет находки: %s', (_name, wasMs, nowMs) => {
    const value = change({ tbtMs: nowMs });
    expect(rulesOf({ ...value, was: { ...GOOD, tbtMs: wasMs } })).toEqual([]);
  });
});

describe('оценка', () => {
  it('упала на 5 пунктов — находка', () => {
    expect(rulesOf(change({ perf: 0.86 }))).toEqual(['perf-dropped']);
  });

  it(`порог — ${PERF_DROP}: на 4 пункта не находка`, () => {
    expect(rulesOf(change({ perf: 0.87 }))).toEqual([]);
  });
});

describe('вместе', () => {
  it('несколько правил — по находке на правило, порядок таблицы', () => {
    const found = rulesOf(change({ lcpMs: 4000, cls: 0.2, tbtMs: 500, perf: 0.5 }));
    expect(found).toEqual(RULES.map((rule) => rule.rule));
  });

  it('без ухудшения находок нет', () => {
    expect(rulesOf(change({}))).toEqual([]);
  });

  it('главная возможность отчёта — в тексте с байтами и миллисекундами', () => {
    const opportunities = [
      { id: 'image-delivery-insight', title: 'Улучшите загрузку изображений', savingsMs: 1350, savingsBytes: 1270035 },
    ];
    const [finding] = auditFindings(change({ lcpMs: 3400 }, { opportunities }));
    expect(finding?.text).toContain('в отчёте Lighthouse: Улучшите загрузку изображений (−1350 мс, 1240 КБ)');
  });

  it('LCP без элемента — где: страница', () => {
    const [finding] = auditFindings(change({ lcpMs: 3400 }, { lcp: null }));
    expect(finding).toMatchObject({ section: null, where: '/catalog' });
  });
});

describe('fix: платформенная секция', () => {
  it('находка в неизменённой библиотечной секции — платформе, в остальных — агенту', () => {
    const findings = auditFindings(change({ lcpMs: 3400, cls: 0.2 }));
    const platform = onPlatformSections(findings, new Set(['hero-1']));
    expect(platform.map((finding) => [finding.rule, finding.fix])).toEqual([
      ['lcp-regressed', 'platform'],
      ['cls-over-limit', 'silent'],
    ]);
  });
});
