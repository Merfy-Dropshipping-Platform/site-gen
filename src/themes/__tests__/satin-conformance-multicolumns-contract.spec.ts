/**
 * Task 3 — Satin MultiColumns stored-shape classification (REMEDIATED contract).
 *
 * The table finding `satin.section.MultiColumns.columns[].stored-shape` is
 * OBSERVED against the REAL compiled Satin MultiColumns block, never asserted
 * from source text. The stored-shape defect is now REMEDIATED on two dimensions
 * and this suite verifies the CURRENT (fixed) behavior:
 *   1. field↔schema AGREE — `containerEnabled` is a sidebar field AND a schema
 *      key, so `safeParse` no longer STRIPS the toggle (the drift that made the
 *      raw source fail strict typechecking is gone);
 *   2. the renderer resolves the alias ambiguity canonical-first — with a column
 *      carrying BOTH a canonical leaf (`title`/`description`/`image`) and its
 *      legacy alias (`heading`/`text`/`imageUrl`), the compiled SECTION renders
 *      the canonical value and drops the legacy one (the renderer never guesses).
 *   3. `safeParse` still STRIPS a leaf OUTSIDE the schema (leaf loss is a stable,
 *      unrelated invariant — the aliased leaves are intentionally kept as
 *      migration fallbacks, so their coexistence is NOT the defect).
 *
 * The compiled block puckConfig `.mjs` (schema) and the compiled section `.mjs`
 * (renderer) are imported in CHILD processes. No behavior/browser PASS is
 * awarded: these are structural facts.
 *
 * Requires the four-step build (build → build:blocks → build:theme-sections
 * satin → run-theme-build satin).
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const PROBE = resolve(__dirname, 'render-satin-multicolumns.mjs');
const SECTION_PROBE = resolve(__dirname, 'render-satin-multicolumns-section.mjs');
const SITES_ROOT = resolve(__dirname, '..', '..', '..');

interface Observed {
  fieldKeys: string[];
  parseSuccess: boolean;
  colKeys: string[];
  colHasBothHeadingTitle: boolean;
  colHasBothImageUrlImage: boolean;
  colHasBothTextDescription: boolean;
  outOfSchemaLeafStripped: boolean;
  headingValue: unknown;
  titleValue: unknown;
  topContainerEnabledStripped: boolean;
  nestedParseSuccess: boolean;
  nestedLinkKeys: string[];
  nestedLinkBogusLeafStripped: boolean;
  headingUnionAcceptsObject: boolean;
  invalidEnumRejected: boolean;
}

interface RenderObserved {
  hasCanonTitle: boolean;
  hasLegacyHeading: boolean;
  hasCanonDesc: boolean;
  hasLegacyText: boolean;
  hasCanonImage: boolean;
  hasLegacyImage: boolean;
}

/** Read a puckConfig source file as TEXT and map top-level field → type. This
 *  mirrors the shallow `src/__tests__/satin-sidebar-canon.spec.ts` guard so we
 *  can PROVE it cannot see nested/options/default/schema drift. */
function shallowFieldTypes(rel: string): Record<string, string> {
  const s = require('node:fs').readFileSync(resolve(SITES_ROOT, rel), 'utf8') as string;
  const fi = s.indexOf('fields: {');
  if (fi < 0) return {};
  let i = fi + 'fields: {'.length;
  let depth = 1;
  let body = '';
  while (i < s.length && depth > 0) {
    const ch = s[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth > 0) body += ch;
    i++;
  }
  const map: Record<string, string> = {};
  let d = 0;
  let cur = '';
  const flush = (txt: string) => {
    const km = txt.match(/^[\s\n]*\[?'?([a-zA-Z_]\w*)'?/);
    const tm = txt.match(/type:\s*'([^']+)'/);
    if (km && tm) map[km[1]] = tm[1];
  };
  for (const ch of body) {
    if (ch === '{' || ch === '[' || ch === '(') d++;
    else if (ch === '}' || ch === ']' || ch === ')') d--;
    if (ch === ',' && d === 0) {
      flush(cur);
      cur = '';
    } else cur += ch;
  }
  flush(cur);
  return map;
}

/** A column carrying BOTH aliases for each concept + one out-of-schema leaf. */
const VALID_INPUT = {
  heading: 'H',
  columns: [
    {
      id: 'a',
      heading: 'colH',
      title: 'colTitle',
      text: 't',
      description: 'd',
      imageUrl: '/u.png',
      image: '/i.png',
      outOfSchemaLeaf: 'x',
    },
  ],
  displayColumns: 3,
  padding: { top: 80, bottom: 80 },
};

function probe(): Observed {
  const stdout = execFileSync('node', [PROBE, JSON.stringify(VALID_INPUT)], {
    encoding: 'utf-8',
    cwd: SITES_ROOT,
  });
  return JSON.parse(stdout) as Observed;
}

/** A column carrying BOTH a canonical leaf and its legacy alias, rendered by the
 *  compiled SECTION to prove the renderer resolves the ambiguity canonical-first. */
const CONFLICTING_RENDER_INPUT = {
  heading: 'H',
  columns: [
    {
      id: 'a',
      heading: 'LEGACY_HEADING',
      title: 'CANON_TITLE',
      imageUrl: '/legacy.png',
      image: '/canonical.png',
      text: 'LEGACY_TEXT',
      description: 'CANON_DESC',
    },
  ],
  displayColumns: 1,
  containerEnabled: 'true',
  padding: { top: 0, bottom: 0 },
};

function renderProbe(): RenderObserved {
  const stdout = execFileSync(
    'node',
    [SECTION_PROBE, JSON.stringify(CONFLICTING_RENDER_INPUT)],
    { encoding: 'utf-8', cwd: SITES_ROOT },
  );
  return JSON.parse(stdout) as RenderObserved;
}

describe('Satin MultiColumns compiled contract (real artifact)', () => {
  let obs: Observed;
  let render: RenderObserved;
  beforeAll(() => {
    obs = probe();
    render = renderProbe();
  }, 60_000);

  it('parses the aliased fixture and exposes fields + schema', () => {
    expect(obs.parseSuccess).toBe(true);
    expect(obs.fieldKeys.length).toBeGreaterThan(0);
  });

  // --- stored-shape RESOLVED: fields ↔ schema AGREE ------------------------
  it('keeps the containerEnabled toggle in BOTH the fields AND the schema (drift resolved)', () => {
    // `containerEnabled` is a sidebar field …
    expect(obs.fieldKeys).toContain('containerEnabled');
    // … AND a top-level schema key — safeParse no longer STRIPS the toggle.
    expect(obs.topContainerEnabledStripped).toBe(false);
  });

  // --- stored-shape RESOLVED: renderer reads canonical-first ---------------
  it('renders canonical-first when a column carries both a canonical leaf and its legacy alias', () => {
    // A column carrying BOTH values renders ONLY the canonical one — the renderer
    // resolves the ambiguity deterministically (it never guesses the legacy alias).
    expect(render.hasCanonTitle).toBe(true);
    expect(render.hasLegacyHeading).toBe(false);
    expect(render.hasCanonDesc).toBe(true);
    expect(render.hasLegacyText).toBe(false);
    expect(render.hasCanonImage).toBe(true);
    expect(render.hasLegacyImage).toBe(false);
  });

  // --- migration fallback (NOT a defect): schema keeps legacy aliases ------
  it('keeps legacy aliases in the schema as migration fallbacks (kept intentionally)', () => {
    // The per-column schema still accepts both the canonical leaf and its legacy
    // alias so old revisions parse; this is a deliberate fallback, and the
    // renderer resolves it canonical-first — it is NOT the stored-shape defect.
    expect(obs.colHasBothHeadingTitle).toBe(true);
    expect(obs.colHasBothImageUrlImage).toBe(true);
    expect(obs.colHasBothTextDescription).toBe(true);
  });

  // --- leaf loss: a leaf outside the schema is stripped --------------------
  it('STRIPS an out-of-schema column leaf on safeParse (stable leaf-loss issue)', () => {
    expect(obs.outOfSchemaLeafStripped).toBe(true);
    // The known aliased leaves are NOT lost (only the out-of-schema one is).
    expect(obs.headingValue).toBe('colH');
    expect(obs.titleValue).toBe('colTitle');
    expect(obs.colKeys).not.toContain('outOfSchemaLeaf');
  });

  it('does not award a behavior/browser PASS from a schema parse', () => {
    // Structural observation only — no executed effect/browser verdict.
    expect(obs.parseSuccess).toBe(true);
  });
});

describe('recursive field drift the shallow sidebar guard cannot see', () => {
  let obs: Observed;
  beforeAll(() => {
    obs = probe();
  }, 60_000);

  it('the shallow top-level guard reports only field TYPES, not nested/options/schema', () => {
    // The shallow guard (satin-sidebar-canon.spec.ts) maps only top-level
    // `field -> type`. It cannot observe the per-column schema, the nested `link`
    // object, the heading union branch or enum option enforcement.
    const shallow = shallowFieldTypes(
      'packages/theme-satin/blocks/MultiColumns/MultiColumns.puckConfig.ts',
    );
    // It sees flat field types (e.g. displayColumns is a slider) …
    expect(shallow.displayColumns).toBe('slider');
    // … but has NO notion of per-column leaves — `columns` is an array field
    // whose ITEM schema (heading/title/link/imageSize) is invisible to it.
    expect(Object.keys(shallow)).not.toContain('title');
    expect(Object.keys(shallow)).not.toContain('link.href');
  });

  it('the deep contract DOES enforce nested/options/schema (real drift is visible)', () => {
    // A nested `link` object survives with only its schema keys …
    expect(obs.nestedParseSuccess).toBe(true);
    expect(obs.nestedLinkKeys.sort()).toEqual(['href', 'text']);
    // … an out-of-schema nested leaf is STRIPPED (leaf loss at depth) …
    expect(obs.nestedLinkBogusLeafStripped).toBe(true);
    // … the heading UNION accepts an object branch (default drift the shallow
    //   guard cannot detect) …
    expect(obs.headingUnionAcceptsObject).toBe(true);
    // … and an INVALID enum option is rejected (options enforced at depth).
    expect(obs.invalidEnumRejected).toBe(true);
  });

  it('does NOT reduce Satin differences to theme-base equality', () => {
    // The deep contract records the ACTUAL Satin per-column aliasing (heading vs
    // title, imageUrl vs image). It never asserts Satin == theme-base to hide it.
    expect(obs.colHasBothHeadingTitle).toBe(true);
    expect(obs.colHasBothImageUrlImage).toBe(true);
  });
});
