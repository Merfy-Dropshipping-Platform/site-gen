// Отчёт Lighthouse 13 по опубликованной странице: метрики, главный элемент LCP, главные возможности. Вид отчёта снят с
// настоящего прогона по стенду dev (20.11, Lighthouse 13.6, телефон).
import { describe, expect, it } from 'vitest';
import { MAX_OPPORTUNITIES, lcpNodeOf, metricsOf, opportunitiesOf } from '../src/checks/audit/report';

const numeric = (numericValue: number) => ({ numericValue, score: 0.5 });

const LHR = {
  categories: { performance: { score: 0.89 } },
  audits: {
    'largest-contentful-paint': numeric(3348.6),
    'first-contentful-paint': numeric(1216.5),
    'total-blocking-time': numeric(189),
    'cumulative-layout-shift': numeric(0.01),
    'speed-index': numeric(1400),
    'lcp-breakdown-insight': {
      score: 1,
      metricSavings: { LCP: 0 },
      details: {
        type: 'list',
        items: [
          { type: 'table', items: [{ subpart: 'timeToFirstByte' }] },
          { type: 'node', path: '1,HTML,1,BODY,0,IMG', snippet: '<img src="hero.jpg">' },
        ],
      },
    },
    'image-delivery-insight': {
      title: 'Улучшите загрузку изображений',
      score: 0,
      numericValue: 1270013,
      numericUnit: 'byte',
      metricSavings: { FCP: 0, LCP: 5450 },
      details: { type: 'table', items: [] },
    },
    'unused-javascript': {
      title: 'Удалите неиспользуемый код JavaScript',
      score: 0.5,
      details: { type: 'opportunity', overallSavingsMs: 0, overallSavingsBytes: 27400 },
    },
    'mainthread-work-breakdown': {
      title: 'Минимизируйте работу в основном потоке',
      score: 0.4,
      metricSavings: { TBT: 850 },
    },
    'dom-size': { title: 'Размер DOM', score: 1, metricSavings: { TBT: 100 } },
    viewport: { title: 'Окно просмотра', score: 0, details: { type: 'table' } },
  },
};

describe('метрики', () => {
  it('оценка 0–1 и время метрик из отчёта', () => {
    expect(metricsOf(LHR)).toEqual({ perf: 0.89, lcpMs: 3348.6, fcpMs: 1216.5, tbtMs: 189, cls: 0.01, siMs: 1400 });
  });

  it('отчёт без метрики — ошибка, а не нули', () => {
    const audits = { ...LHR.audits, 'speed-index': undefined };
    expect(() => metricsOf({ ...LHR, audits })).toThrow();
  });
});

describe('элемент LCP', () => {
  it('узел из деталей «вывода» про LCP: путь и разметка', () => {
    expect(lcpNodeOf(LHR)).toEqual({ path: '1,HTML,1,BODY,0,IMG', snippet: '<img src="hero.jpg">' });
  });

  it('узла нет (страница без LCP) — null', () => {
    expect(lcpNodeOf({ ...LHR, audits: { ...LHR.audits, 'lcp-breakdown-insight': undefined } })).toBeNull();
  });
});

describe('главные возможности', () => {
  it('по убыванию выигрыша во времени, потом в байтах; без выигрыша и пройденные — нет', () => {
    expect(opportunitiesOf(LHR)).toEqual([
      { id: 'image-delivery-insight', title: 'Улучшите загрузку изображений', savingsMs: 5450, savingsBytes: 1270013 },
      {
        id: 'mainthread-work-breakdown',
        title: 'Минимизируйте работу в основном потоке',
        savingsMs: 850,
        savingsBytes: 0,
      },
      { id: 'unused-javascript', title: 'Удалите неиспользуемый код JavaScript', savingsMs: 0, savingsBytes: 27400 },
    ]);
  });

  it(`не больше ${MAX_OPPORTUNITIES}`, () => {
    const many = Object.fromEntries(
      Array.from({ length: 8 }, (_, at) => [
        `audit-${at}`,
        { title: `Проверка ${at}`, score: 0, metricSavings: { LCP: 100 + at } },
      ]),
    );
    expect(opportunitiesOf({ ...LHR, audits: many })).toHaveLength(MAX_OPPORTUNITIES);
  });
});
