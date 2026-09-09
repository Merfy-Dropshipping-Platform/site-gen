/**
 * Task 3 — Satin Slideshow mapped-renderer classification (REMEDIATED behavior).
 *
 * The two Slideshow table findings are OBSERVED from the REAL render, not
 * asserted from source text. Both are now REMEDIATED in source and the suite
 * verifies the CURRENT (fixed) behavior:
 *   1. `slides[].alias-precedence` — the compiled mapped renderer reads the
 *      CANONICAL nested values (`image`, `button.link.href`) BEFORE the legacy
 *      aliases (`imageUrl`, `ctaUrl`): conflicting props render `/canonical.png`
 *      + `/canonical-cta`, NOT the legacy values.
 *   2. `slides[].position.renderer-domain` — the renderer distinguishes all NINE
 *      canonical positions as DISTINCT 2D layouts. The canvas is a flex-ROW, so
 *      a position is a `justify|items` PAIR (vertical × horizontal), and the
 *      nine positions produce nine distinct pairs (the sidebar's 9-cell grid).
 *
 * This suite renders the ACTUAL compiled module Satin's section map selects
 * through the real Astro Container (child process) for canonical-only,
 * legacy-only, conflicting and explicitly-empty canonical values plus every
 * current position option. It observes CURRENT source behavior; no browser /
 * effect PASS is awarded (the observations are recorded as structural facts,
 * not a behavior verdict).
 *
 * Requires the four-step build (build → build:blocks → build:theme-sections
 * satin → run-theme-build satin).
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const RENDERER = resolve(__dirname, 'render-satin-slideshow.mjs');
const SITES_ROOT = resolve(__dirname, '..', '..', '..');

// The nine canonical sidebar positions + the two legacy ones the renderer knows.
const CANONICAL_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;
const LEGACY_POSITIONS = ['left', 'right'] as const;

const FIXTURES = {
  // canonical-only: nested image + nested button.link.href, canonical position.
  canonicalOnly: {
    slides: [
      {
        image: '/canonical.png',
        heading: { text: 'H' },
        ctaText: 'Go',
        button: { link: { href: '/canonical-cta' } },
        position: 'top-left',
      },
    ],
  },
  // legacy-only: legacy imageUrl + legacy ctaUrl, legacy position.
  legacyOnly: {
    slides: [
      { imageUrl: '/legacy.png', heading: 'L', ctaText: 'Go', ctaUrl: '/legacy-cta', position: 'left' },
    ],
  },
  // conflicting: BOTH legacy and canonical present for image and CTA.
  conflicting: {
    slides: [
      {
        imageUrl: '/legacy.png',
        image: '/canonical.png',
        heading: 'C',
        ctaText: 'Go',
        ctaUrl: '/legacy-cta',
        button: { link: { href: '/canonical-cta' } },
        position: 'right',
      },
    ],
  },
  // explicitly empty canonical values.
  empty: { slides: [] },
  // every canonical position, one slide each.
  ...Object.fromEntries(
    [...CANONICAL_POSITIONS, ...LEGACY_POSITIONS].map((pos) => [
      `pos_${pos}`,
      { slides: [{ image: '/c.png', heading: 'H', ctaText: 'Go', ctaUrl: '/x', position: pos }] },
    ]),
  ),
} as Record<string, unknown>;

const ORDER = Object.keys(FIXTURES);

function renderAll(): Record<string, string> {
  const propsList = ORDER.map((k) => FIXTURES[k]);
  const stdout = execFileSync('node', [RENDERER, JSON.stringify(propsList)], {
    encoding: 'utf-8',
    cwd: SITES_ROOT,
  });
  const htmls = JSON.parse(stdout) as string[];
  const out: Record<string, string> = {};
  ORDER.forEach((k, i) => (out[k] = htmls[i]));
  return out;
}

const uniqueImages = (html: string): string[] =>
  [...new Set(html.match(/\/(canonical|legacy|c)\.png/g) ?? [])];
const uniqueHrefs = (html: string): string[] =>
  [...new Set(html.match(/href="([^"]*)"/g) ?? [])].map((h) =>
    h.replace(/^href="/, '').replace(/"$/, ''),
  );

/**
 * The DISTINCT 2D position signatures (`justify|items`) the slide-row element
 * emits. The Slideshow canvas is a flex-ROW: the VERTICAL axis is `justify-*`
 * and the HORIZONTAL axis is `items-*`. We read only the slide row (marked by
 * its `satin-pad`/`px-4` padding) that carries BOTH classes, so unrelated
 * `items-center` decorations (CTA, pagination) never pollute the axis.
 */
const position2d = (html: string): string[] => {
  const combos = new Set<string>();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    const cls = m[1];
    if (!/\b(satin-pad|px-4)\b/.test(cls)) continue;
    const j = cls.match(/\bjustify-(start|end|center)\b/);
    const i = cls.match(/\bitems-(start|end|center)\b/);
    if (j && i) combos.add(`${j[1]}|${i[1]}`);
  }
  return [...combos];
};

describe('Satin mapped Slideshow renderer (real compiled module)', () => {
  let R: Record<string, string>;
  beforeAll(() => {
    R = renderAll();
  }, 60_000);

  it('renders a non-empty document for every fixture', () => {
    for (const k of ORDER) expect(R[k].length).toBeGreaterThan(0);
  });

  // --- alias precedence REMEDIATED (observed canonical-first) --------------
  it('reads canonical nested image BEFORE the legacy alias (alias-precedence resolved)', () => {
    // canonical-only renders the canonical image; legacy-only the legacy image.
    expect(uniqueImages(R.canonicalOnly)).toContain('/canonical.png');
    expect(uniqueImages(R.legacyOnly)).toContain('/legacy.png');
    // conflicting: BOTH present → the CANONICAL image wins (the remediation).
    expect(uniqueImages(R.conflicting)).toContain('/canonical.png');
    expect(uniqueImages(R.conflicting)).not.toContain('/legacy.png');
  });

  it('reads canonical nested button.link BEFORE the legacy CTA alias (alias-precedence resolved)', () => {
    // conflicting: canonical button.link.href wins over legacy ctaUrl.
    expect(uniqueHrefs(R.conflicting)).toContain('/canonical-cta');
    expect(uniqueHrefs(R.conflicting)).not.toContain('/legacy-cta');
  });

  it('falls back to /catalog when a slide has no CTA target', () => {
    // empty renders the placeholder slide whose CTA href defaults to /catalog.
    expect(uniqueHrefs(R.empty)).toContain('/catalog');
  });

  // --- position domain REMEDIATED (observed 2D layouts) -------------------
  it('emits one DISTINCT 2D layout per canonical position (position renderer-domain resolved)', () => {
    for (const pos of CANONICAL_POSITIONS) {
      // Each canonical position resolves to exactly one `justify|items` pair.
      expect(position2d(R[`pos_${pos}`]).length).toBe(1);
    }
    // Across the nine canonical positions the renderer produces NINE distinct 2D
    // layouts — it now covers the sidebar's full 9-cell grid (no collapse).
    const all2d = new Set(
      CANONICAL_POSITIONS.flatMap((pos) => position2d(R[`pos_${pos}`])),
    );
    expect(all2d.size).toBe(CANONICAL_POSITIONS.length);
  });

  it('spans both layout axes (vertical justify × horizontal items)', () => {
    const all2d = CANONICAL_POSITIONS.flatMap((pos) =>
      position2d(R[`pos_${pos}`]),
    );
    const justifies = new Set(all2d.map((c) => c.split('|')[0]));
    const items = new Set(all2d.map((c) => c.split('|')[1]));
    // Both axes exercise all three values → a full 3×3 domain, not a 1D collapse.
    expect(justifies).toEqual(new Set(['start', 'center', 'end']));
    expect(items).toEqual(new Set(['start', 'center', 'end']));
  });

  it('does not award a browser/effect PASS from a static render', () => {
    // This suite records STRUCTURAL observations only; it never asserts an
    // executed behavior/browser verdict. The render is a source-shape probe.
    expect(typeof R.canonicalOnly).toBe('string');
  });
});
