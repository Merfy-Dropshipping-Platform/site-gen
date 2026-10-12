import type { Difference } from '@merfy/stand-check';
import { describe, expect, it } from 'vitest';
import type { DryRun } from '../../src/release/dry-run';
import { renderReleaseReport, type ReleaseReport } from '../../src/release/report';

const CLEAN: DryRun = {
  from: '0.1.0',
  to: '0.2.0',
  problems: [],
  shops: [{ siteId: 'shop-1', problems: [], declared: ['scheme-1.accent: "#000" → "#111"'] }],
  red: false,
};
const RED: DryRun = {
  ...CLEAN,
  shops: [{ siteId: 'shop-2', problems: ['root.gap: 4 → 8 — строки «вид» нет'], declared: [] }],
  red: true,
};
const BASE: ReleaseReport = {
  release: null,
  theme: 'nova',
  from: '0.1.0',
  to: '0.2.0',
  toHash: `sha256:${'a'.repeat(64)}`,
  contour: 'dev',
  status: 'не стартовал',
  dryRun: RED,
  testShop: null,
  conductorVerdict: null,
  passport: null,
  shots: null,
};
const RED_ERROR: Difference = {
  field: 'errors',
  op: 'added',
  name: 'TypeError',
  severity: 'red',
  reason: 'новая ошибка',
};
const AMBER_SCRIPT: Difference = {
  field: 'scripts',
  op: 'added',
  name: '/_astro/a.js',
  severity: 'amber',
  reason: 'новый скрипт',
};
const SHOTS = [
  {
    title: 'home, 390 px',
    before: 'http://s/b.png',
    after: 'http://s/a.png',
    diff: 'http://s/d.png',
    ratio: 0.02,
    threshold: 0.005,
    over: true,
  },
  {
    title: 'stand, 1240 px',
    before: null,
    after: 'http://s/a2.png',
    diff: null,
    ratio: 0,
    threshold: 0.005,
    over: false,
  },
];

describe('отчёт выпуска (design.md блока 10)', () => {
  it('сухой прогон красный: магазин и причина, без «Дальше» и снимков', () => {
    const text = renderReleaseReport(BASE);
    expect(text).toContain('**Сухой прогон красный — выпуск не стартует.**');
    expect(text).toContain('- shop-2: **root.gap: 4 → 8 — строки «вид» нет**');
    expect(text).not.toContain('## Дальше');
    expect(text).not.toContain('## Снимки');
  });

  it('волна 0 прошла: вердикт, отличия, снимки и команды', () => {
    const passport = { verdict: 'red' as const, differences: [RED_ERROR, AMBER_SCRIPT] };
    const report = {
      ...BASE,
      release: 12,
      status: 'awaiting',
      dryRun: CLEAN,
      testShop: 'shop-1',
      conductorVerdict: 'clean',
      passport,
      shots: SHOTS,
    };
    const text = renderReleaseReport(report);
    expect(text).toContain('# Выпуск nova 0.1.0 → 0.2.0, №12 (dev)');
    expect(text).toContain('- shop-1: scheme-1.accent: "#000" → "#111" (строка «вид»)');
    expect(text).toContain('Ведущий волн, паспорт «после» по правилам выпуска: clean.');
    expect(text).toContain('- **красный** errors added `TypeError` — новая ошибка');
    expect(text).toContain('- жёлтый scripts added `/_astro/a.js` — новый скрипт');
    expect(text).toContain(
      '| home, 390 px | [открыть](http://s/b.png) | [открыть](http://s/a.png) | [открыть](http://s/d.png) | 2.0 % | 0.5 % | **жёлтый: выше порога** |',
    );
    expect(text).toContain('| stand, 1240 px | — | [открыть](http://s/a2.png) | — | 0.0 % | 0.5 % | в пороге |');
    expect(text).toContain('theme-release approve 12');
    expect(text).toContain('theme-release revert-all 12');
  });

  it('снимки выключены', () => {
    const passport = { verdict: 'clean' as const, differences: [] };
    const text = renderReleaseReport({
      ...BASE,
      release: 3,
      status: 'awaiting',
      dryRun: CLEAN,
      testShop: 'shop-1',
      passport,
    });
    expect(text).toContain('Снимки выключены (`--no-shots`).');
    expect(text).toContain('вердикта нет');
  });
});
