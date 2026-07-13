import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * F-055: Bloom's `sections.map.json` routes Publications to a THEME-OWNED
 * renderer that DIVERGES from the shared contract — `Math.round`, max 6 columns
 * and max 12 cards, with `columnsCount`/`cardsCount` (number) preferred over the
 * `columns`/`cards` aliases, default 3. The passing shared/base tests do NOT
 * exercise this mapped renderer, so this probe renders the ACTUAL compiled Bloom
 * module selected by the section map — never a source-string assertion against
 * theme-base.
 *
 * jest (CJS, no --experimental-vm-modules) cannot load the compiled ESM `.mjs`
 * or the astro runtime in-process, so a child node process
 * (render-bloom-publications.mjs) does the real Astro Container render and
 * returns the HTML.
 *
 * Requires the build prerequisites (build → build:blocks → build:theme-sections
 * bloom → run-theme-build bloom).
 */

const RENDERER = resolve(__dirname, 'render-bloom-publications.mjs');

// A single child render of ALL fixtures (spawning once keeps the suite fast).
const FIXTURES = {
  currentOnly: { columnsCount: 5, cardsCount: 7 },
  legacyOnly: { columns: 4, cards: 6 },
  conflicting: { columnsCount: 2, columns: 6, cardsCount: 3, cards: 12 },
  outOfRange: { columnsCount: 99, cardsCount: 99 },
  fractional: { columnsCount: 3.6, cardsCount: 2.4 },
  malformedCurrent: { columnsCount: 'abc', columns: 4, cardsCount: 'x', cards: 5 },
  defaults: {},
  zero: { columnsCount: 0, cardsCount: 0 },
  withType: { publicationType: 'news' },
} as const;

const ORDER = Object.keys(FIXTURES) as Array<keyof typeof FIXTURES>;

function renderAll(): Record<keyof typeof FIXTURES, string> {
  const propsList = ORDER.map((k) => FIXTURES[k]);
  const stdout = execFileSync(
    'node',
    [RENDERER, JSON.stringify(propsList)],
    { encoding: 'utf-8', cwd: resolve(__dirname, '..', '..', '..') },
  );
  const htmls = JSON.parse(stdout) as string[];
  const out = {} as Record<keyof typeof FIXTURES, string>;
  ORDER.forEach((k, i) => {
    out[k] = htmls[i];
  });
  return out;
}

const cardCount = (html: string): number =>
  (html.match(/data-publication-index=/g) ?? []).length;

// Columns: the renderer emits `--pub-cols:N` only when columns !== 3 (default
// branch uses lg:grid-cols-3 with no CSS var). Report 3 for that case.
const colCount = (html: string): number => {
  const m = /--pub-cols:(\d+)/.exec(html);
  return m ? Number(m[1]) : 3;
};

describe('Bloom mapped Publications renderer (F-055 divergent contract)', () => {
  let R: Record<keyof typeof FIXTURES, string>;

  beforeAll(() => {
    R = renderAll();
  });

  it('current-only counts are used (columnsCount 5 / cardsCount 7)', () => {
    expect(colCount(R.currentOnly)).toBe(5);
    expect(cardCount(R.currentOnly)).toBe(7);
  });

  it('legacy-only aliases are used when current absent (columns 4 / cards 6)', () => {
    expect(colCount(R.legacyOnly)).toBe(4);
    expect(cardCount(R.legacyOnly)).toBe(6);
  });

  it('conflicting: current (columnsCount/cardsCount) wins over legacy', () => {
    expect(colCount(R.conflicting)).toBe(2);
    expect(cardCount(R.conflicting)).toBe(3);
  });

  it('out-of-range clamps to Bloom max 6 columns / 12 cards (NOT shared max 4)', () => {
    expect(colCount(R.outOfRange)).toBe(6);
    expect(cardCount(R.outOfRange)).toBe(12);
  });

  it('fractional uses Math.round (3.6 -> 4, 2.4 -> 2), NOT Math.trunc', () => {
    expect(colCount(R.fractional)).toBe(4);
    expect(cardCount(R.fractional)).toBe(2);
  });

  it('malformed current (non-number) falls back to legacy alias', () => {
    expect(colCount(R.malformedCurrent)).toBe(4);
    expect(cardCount(R.malformedCurrent)).toBe(5);
  });

  it('default (no props) yields 3 columns / 3 cards', () => {
    expect(colCount(R.defaults)).toBe(3);
    expect(cardCount(R.defaults)).toBe(3);
  });

  it('zero collapses to default 3 via `Math.round(0) || 3`', () => {
    expect(colCount(R.zero)).toBe(3);
    expect(cardCount(R.zero)).toBe(3);
  });

  it('publicationType is surfaced as a data attribute (type fallback marker)', () => {
    expect(R.withType).toContain('data-publication-type="news"');
  });
});
