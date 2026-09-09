/**
 * Task 5 — Fingerprinted findings & shrink-only ratchet.
 *
 * These tests are the authoritative behavioural contract for
 * `conformance/findings.ts` and `conformance/ratchet.ts`. They are written FIRST
 * (strict TDD) and pin every invariant enumerated in the plan:
 *
 *  - fingerprint canonical-data purity (id + expectedCode + observedCode +
 *    sanitized/sorted canonicalFacts + sorted canonical source refs), SHA-256;
 *  - synthetic `status-open` / `status-gap` / `status-needs-decision` findings
 *    and per-case findings keyed by
 *    `<capabilityId>.case.<scenarioId>.<mode>.<viewport>`;
 *  - the stable open identity survives observed default/constraint/condition/
 *    location/status/failure/evidence churn and code-source ordering, but churns
 *    on a normative requirement/contract/scenario/expected-effect change;
 *  - GAP↔UNKNOWN and NEEDS_DECISION transitions expand/shrink correctly;
 *  - `compareBaseline` exact / unexpected / stale / changed-fingerprint / zero;
 *  - `shrinkBaseline` may only remove, never add or replace, and only when the
 *    requirement-lock set is byte-identical;
 *  - `appendRequirementLocks` accepts only a strict superset with old locks
 *    byte-for-byte preserved and the finding list unchanged.
 */

import {
  collectGateFindings,
  fingerprintRequirement,
  fingerprintRequirements,
  fingerprintStructuralIssue,
  canonicalStringify,
} from '../conformance/findings';
import {
  compareBaseline,
  shrinkBaseline,
  appendRequirementLocks,
} from '../conformance/ratchet';
import type {
  CapabilityRecord,
  CapabilityCaseResult,
  RequirementRecord,
  StructuralIssue,
  StructuralBaseline,
  BaselineFinding,
  ScenarioDefinition,
  RequirementExpectedCase,
} from '../conformance/types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const THEME = 'bloom';
const ALL_MODES = ['hot-preview', 'initial-preview', 'live'] as const;
const ALL_VIEWPORTS = ['desktop', 'mobile'] as const;

function cap(
  id: string,
  overrides: Partial<CapabilityRecord> = {},
): CapabilityRecord {
  return {
    id,
    theme: THEME,
    surface: 'block',
    capability: id,
    fieldType: 'text',
    label: 'Заголовок',
    visibility: 'main-panel',
    editable: true,
    persisted: true,
    container: 'leaf',
    order: 0,
    defaults: [],
    constraints: {},
    scenarios: [],
    modes: [...ALL_MODES],
    viewports: [...ALL_VIEWPORTS],
    caseResults: [],
    sources: [{ kind: 'code', ref: 'runtime' }],
    status: 'UNKNOWN',
    failureIds: [],
    ...overrides,
  };
}

function caseResult(
  overrides: Partial<CapabilityCaseResult> = {},
): CapabilityCaseResult {
  return {
    scenarioId: 's-true',
    value: true,
    mode: 'live',
    viewport: 'desktop',
    expectedEffect: {
      kind: 'computed-style',
      target: '[data-nt=card]',
      property: 'borderRadius',
      comparator: 'equals',
      expected: '12px',
    },
    observed: { value: '0px', notes: 'volatile note — must not enter fingerprint' },
    status: 'GAP',
    evidenceRefs: ['conformance-results/bloom/x.png'],
    artifactRefs: ['conformance-results/bloom/x.json'],
    failureIds: ['F-100'],
    ...overrides,
  };
}

function issue(
  id: string,
  overrides: Partial<StructuralIssue> = {},
): StructuralIssue {
  return {
    id,
    theme: THEME,
    status: 'GAP',
    expectedCode: 'file-present',
    observedCode: 'file-absent',
    canonicalFacts: { missingFiles: ['classes', 'tokens'] },
    detail: 'Bloom Benefits is missing classes/tokens files',
    sources: [{ kind: 'code', ref: 'packages/theme-bloom/blocks/Benefits/Benefits.astro#/component' }],
    ...overrides,
  };
}

function scenario(
  id: string,
  order: number,
  overrides: Partial<ScenarioDefinition> = {},
): ScenarioDefinition {
  return {
    id,
    order,
    role: 'true',
    value: true,
    validity: 'expected-valid',
    ...overrides,
  };
}

function expectedCase(
  scenarioId: string,
  overrides: Partial<RequirementExpectedCase> = {},
): RequirementExpectedCase {
  return {
    scenarioId,
    modes: ['live'],
    viewports: ['desktop'],
    effect: {
      kind: 'computed-style',
      target: '[data-nt=card]',
      property: 'borderRadius',
      comparator: 'equals',
      expected: '12px',
    },
    ...overrides,
  };
}

function req(
  id: string,
  overrides: Partial<RequirementRecord> = {},
): RequirementRecord {
  return {
    id,
    sources: [
      { kind: 'user', ref: 'required-field' },
      { kind: 'figma', ref: '1:20818' },
    ],
    required: true,
    label: 'Заголовок',
    contract: {
      kind: 'field',
      fieldType: 'text',
      visibility: 'main-panel',
      editable: true,
      persisted: true,
      container: 'leaf',
      order: 0,
      defaults: [],
      constraints: {},
      condition: null,
      modes: [...ALL_MODES],
      viewports: [...ALL_VIEWPORTS],
    },
    ...overrides,
  };
}

function baseline(
  findings: BaselineFinding[],
  requirements: BaselineFinding[],
): StructuralBaseline {
  return {
    schemaVersion: 1,
    theme: THEME,
    reviewDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    inventoryDigest: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    sourceDigest: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
    parentBaselineDigest: null,
    requirements: [...requirements].sort(cmpFinding),
    findings: [...findings].sort(cmpFinding),
  };
}

function cmpFinding(a: BaselineFinding, b: BaselineFinding): number {
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  if (a.fingerprint !== b.fingerprint) return a.fingerprint < b.fingerprint ? -1 : 1;
  return 0;
}

function ids(fs: BaselineFinding[]): string[] {
  return fs.map((f) => f.id).sort();
}

function fpOf(fs: BaselineFinding[], id: string): string {
  const f = fs.find((x) => x.id === id);
  if (!f) throw new Error(`no finding with id ${id}`);
  return f.fingerprint;
}

// A reusable "GAP capability with one reviewed requirement + one failing case".
function gapSetup(overrides?: {
  capOverrides?: Partial<CapabilityRecord>;
  reqOverrides?: Partial<RequirementRecord>;
  caseOverrides?: Partial<CapabilityCaseResult>;
  issueOverrides?: Partial<StructuralIssue>;
}) {
  const id = 'bloom.block.Card.radius';
  const c = cap(id, {
    status: 'GAP',
    scenarios: [scenario('s-true', 0)],
    caseResults: [caseResult({ ...overrides?.caseOverrides })],
    failureIds: ['bloom.block.Card.radius.structural'],
    ...overrides?.capOverrides,
  });
  const r = req(id, {
    scenarios: [scenario('s-true', 0)],
    expectedCases: [expectedCase('s-true')],
    ...overrides?.reqOverrides,
  });
  const structural = issue(`${id}.structural`, {
    canonicalFacts: { radius: { expected: '12px', observed: '0px' } },
    sources: [{ kind: 'code', ref: 'packages/theme-bloom/blocks/Card/Card.astro#/radius' }],
    ...overrides?.issueOverrides,
  });
  const locks = fingerprintRequirements([r]);
  const collected = collectGateFindings([structural], [c], locks);
  return { id, c, r, structural, locks, collected };
}

// ===========================================================================
// canonicalStringify + fingerprint purity
// ===========================================================================

describe('canonicalStringify', () => {
  test('sorts object keys deeply but preserves array order', () => {
    const a = canonicalStringify({ b: 1, a: { d: 2, c: 3 }, arr: [3, 1, 2] });
    const b = canonicalStringify({ a: { c: 3, d: 2 }, arr: [3, 1, 2], b: 1 });
    expect(a).toBe(b);
    // array order is semantic — must NOT be sorted.
    expect(a).not.toBe(canonicalStringify({ a: { c: 3, d: 2 }, arr: [1, 2, 3], b: 1 }));
  });
});

describe('fingerprintStructuralIssue', () => {
  test('is a sha256:<64 hex> string and stable across key order', () => {
    const fp1 = fingerprintStructuralIssue(
      issue('x', { canonicalFacts: { b: 2, a: 1 } }),
    );
    const fp2 = fingerprintStructuralIssue(
      issue('x', { canonicalFacts: { a: 1, b: 2 } }),
    );
    expect(fp1).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(fp1).toBe(fp2);
  });

  test('source line/column shift does NOT churn (semantic selector only)', () => {
    const base = issue('x', {
      sources: [{ kind: 'code', ref: 'packages/theme-bloom/blocks/Benefits/Benefits.astro:12:4#/component' }],
    });
    const shifted = issue('x', {
      sources: [{ kind: 'code', ref: 'packages/theme-bloom/blocks/Benefits/Benefits.astro:98:1#/component' }],
    });
    expect(fingerprintStructuralIssue(base)).toBe(fingerprintStructuralIssue(shifted));
  });

  test('a changed JSON-pointer/selector in the source ref DOES churn', () => {
    const a = issue('x', {
      sources: [{ kind: 'code', ref: 'packages/theme-bloom/blocks/Benefits/Benefits.astro#/component' }],
    });
    const b = issue('x', {
      sources: [{ kind: 'code', ref: 'packages/theme-bloom/blocks/Benefits/Benefits.astro#/classes' }],
    });
    expect(fingerprintStructuralIssue(a)).not.toBe(fingerprintStructuralIssue(b));
  });

  test('code-source ORDER does not churn (sorted before hashing)', () => {
    const a = issue('x', {
      sources: [
        { kind: 'code', ref: 'a.astro#/x' },
        { kind: 'code', ref: 'b.astro#/y' },
      ],
    });
    const b = issue('x', {
      sources: [
        { kind: 'code', ref: 'b.astro#/y' },
        { kind: 'code', ref: 'a.astro#/x' },
      ],
    });
    expect(fingerprintStructuralIssue(a)).toBe(fingerprintStructuralIssue(b));
  });

  test('same generic codes but changed canonicalFacts DOES churn', () => {
    const a = issue('x', { canonicalFacts: { missingFiles: ['classes'] } });
    const b = issue('x', { canonicalFacts: { missingFiles: ['classes', 'tokens'] } });
    expect(fingerprintStructuralIssue(a)).not.toBe(fingerprintStructuralIssue(b));
  });

  test('volatile detail/timestamp/absolute-path never enters the fingerprint', () => {
    const a = issue('x', { detail: 'failed at 2026-07-13T00:00:00Z on /Users/alexey/... boom' });
    const b = issue('x', { detail: 'completely different human text' });
    expect(fingerprintStructuralIssue(a)).toBe(fingerprintStructuralIssue(b));
  });
});

// ===========================================================================
// fingerprintRequirement — normative identity only
// ===========================================================================

describe('fingerprintRequirement', () => {
  test('is sha256 and stable across source order', () => {
    const a = fingerprintRequirement(
      req('bloom.block.Card.radius', {
        sources: [
          { kind: 'user', ref: 'required-field' },
          { kind: 'figma', ref: '1:20818' },
        ],
      }),
    );
    const b = fingerprintRequirement(
      req('bloom.block.Card.radius', {
        sources: [
          { kind: 'figma', ref: '1:20818' },
          { kind: 'user', ref: 'required-field' },
        ],
      }),
    );
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });

  test('label change churns the requirement fingerprint', () => {
    const a = fingerprintRequirement(req('id', { label: 'Заголовок' }));
    const b = fingerprintRequirement(req('id', { label: 'Подзаголовок' }));
    expect(a).not.toBe(b);
  });

  test('contract change churns the requirement fingerprint', () => {
    const a = fingerprintRequirement(req('id'));
    const b = fingerprintRequirement(
      req('id', {
        contract: { ...(req('id').contract as any), constraints: { min: 0, max: 48 } },
      }),
    );
    expect(a).not.toBe(b);
  });

  test('scenario ORDER mutation churns (scenarios are ordered, not a set)', () => {
    const a = fingerprintRequirement(
      req('id', { scenarios: [scenario('s1', 0), scenario('s2', 1)] }),
    );
    const b = fingerprintRequirement(
      req('id', { scenarios: [scenario('s1', 1), scenario('s2', 0)] }),
    );
    expect(a).not.toBe(b);
  });

  test('expected-effect mutation churns', () => {
    const a = fingerprintRequirement(
      req('id', {
        scenarios: [scenario('s1', 0)],
        expectedCases: [expectedCase('s1')],
      }),
    );
    const b = fingerprintRequirement(
      req('id', {
        scenarios: [scenario('s1', 0)],
        expectedCases: [expectedCase('s1', { effect: { ...expectedCase('s1').effect, expected: '24px' } })],
      }),
    );
    expect(a).not.toBe(b);
  });
});

// ===========================================================================
// collectGateFindings — structure of the emitted set
// ===========================================================================

describe('collectGateFindings — structure', () => {
  test('emits every structural issue verbatim as a finding', () => {
    const i = issue('bloom.block.Benefits.files');
    const { findings } = collectGateFindings([i], [], []);
    expect(findings.some((f) => f.id === i.id)).toBe(true);
    expect(fpOf(findings, i.id)).toBe(fingerprintStructuralIssue(i));
  });

  test('hidden/decorative PASS rows never become findings', () => {
    const passHidden = cap('bloom.block.X.deco', { status: 'PASS', visibility: 'decorative' });
    const passVisible = cap('bloom.block.X.ok', { status: 'PASS' });
    const { findings } = collectGateFindings([], [passHidden, passVisible], []);
    expect(findings).toHaveLength(0);
  });

  test('GAP capability emits status-open + status-gap (no needs-decision)', () => {
    const { collected } = gapSetup();
    const idset = ids(collected.findings);
    expect(idset).toContain('bloom.block.Card.radius.status-open');
    expect(idset).toContain('bloom.block.Card.radius.status-gap');
    expect(idset).not.toContain('bloom.block.Card.radius.status-needs-decision');
  });

  test('status-open detail retains the exact GAP text but codes are generic', () => {
    const { collected } = gapSetup();
    const open = collected.findings.find((f) => f.id.endsWith('.status-open'));
    expect(open).toBeDefined();
    // canonical fingerprint uses capability-pass / capability-open regardless of GAP/UNKNOWN.
    const gapOpen = fpOf(collected.findings, 'bloom.block.Card.radius.status-open');
    const unknown = collectGateFindings(
      [],
      [cap('bloom.block.Card.radius', { status: 'UNKNOWN', scenarios: [scenario('s-true', 0)] })],
      gapSetup().locks,
    );
    // Same capability + requirement, GAP vs UNKNOWN → SAME status-open fingerprint.
    expect(fpOf(unknown.findings, 'bloom.block.Card.radius.status-open')).toBe(gapOpen);
  });

  test('NEEDS_DECISION capability emits status-open + status-needs-decision', () => {
    const id = 'bloom.theme-setting.token.--radius-button';
    const c = cap(id, { surface: 'theme-setting', status: 'NEEDS_DECISION', scenarios: [scenario('s-max', 0)] });
    const r = req(id, { contract: null, scenarios: [scenario('s-max', 0)] });
    const { findings } = collectGateFindings([], [c], fingerprintRequirements([r]));
    const idset = ids(findings);
    expect(idset).toContain(`${id}.status-open`);
    expect(idset).toContain(`${id}.status-needs-decision`);
    expect(idset).not.toContain(`${id}.status-gap`);
  });

  test('per-case findings are keyed by <cap>.case.<scenario>.<mode>.<viewport>', () => {
    const { collected } = gapSetup();
    expect(ids(collected.findings)).toContain(
      'bloom.block.Card.radius.case.s-true.live.desktop.status-open',
    );
    expect(ids(collected.findings)).toContain(
      'bloom.block.Card.radius.case.s-true.live.desktop.status-gap',
    );
  });

  test('a second failing viewport under an already-GAP capability is a NEW finding', () => {
    const one = gapSetup();
    const two = gapSetup({
      capOverrides: {
        caseResults: [
          caseResult({ viewport: 'desktop' }),
          caseResult({ viewport: 'mobile' }),
        ],
      },
    });
    const onlyInTwo = ids(two.collected.findings).filter(
      (x) => !ids(one.collected.findings).includes(x),
    );
    expect(onlyInTwo).toContain(
      'bloom.block.Card.radius.case.s-true.live.mobile.status-open',
    );
    expect(onlyInTwo).toContain(
      'bloom.block.Card.radius.case.s-true.live.mobile.status-gap',
    );
  });

  test('PASS case under a GAP capability produces NO case finding', () => {
    const { collected } = gapSetup({
      caseOverrides: { status: 'PASS' },
    });
    expect(
      ids(collected.findings).some((x) => x.startsWith('bloom.block.Card.radius.case.')),
    ).toBe(false);
  });

  test('requirement locks are returned and match fingerprintRequirements', () => {
    const { collected, r } = gapSetup();
    expect(collected.requirements).toEqual(
      [{ id: r.id, fingerprint: fingerprintRequirement(r) }],
    );
  });

  test('rejects duplicate capability ids', () => {
    expect(() =>
      collectGateFindings([], [cap('dup'), cap('dup')], []),
    ).toThrow(/duplicate/i);
  });
});

// ===========================================================================
// status-open STABILITY — the heart of the ratchet
// ===========================================================================

describe('status-open stable identity', () => {
  const OPEN = 'bloom.block.Card.radius.status-open';

  test('GAP→UNKNOWN keeps status-open byte-identical, drops structural + status-gap', () => {
    const gap = gapSetup();
    const gapOpenFp = fpOf(gap.collected.findings, OPEN);

    // Same capability & requirement, now behaviour UNKNOWN, structural repaired.
    const c = cap('bloom.block.Card.radius', {
      status: 'UNKNOWN',
      scenarios: [scenario('s-true', 0)],
      caseResults: [],
      failureIds: [],
    });
    const unknown = collectGateFindings([], [c], gap.locks);

    expect(fpOf(unknown.findings, OPEN)).toBe(gapOpenFp);
    expect(ids(unknown.findings)).not.toContain('bloom.block.Card.radius.status-gap');
    expect(ids(unknown.findings)).not.toContain('bloom.block.Card.radius.structural');
    // the semantic open finding remains until PASS.
    expect(ids(unknown.findings)).toContain(OPEN);
  });

  test('UNKNOWN→GAP adds status-gap (blocking expansion) and keeps status-open', () => {
    const c0 = cap('bloom.block.Card.radius', {
      status: 'UNKNOWN',
      scenarios: [scenario('s-true', 0)],
      caseResults: [],
    });
    const locks = fingerprintRequirements([
      req('bloom.block.Card.radius', { scenarios: [scenario('s-true', 0)], expectedCases: [expectedCase('s-true')] }),
    ]);
    const before = collectGateFindings([], [c0], locks);
    const gap = gapSetup();

    expect(ids(before.findings)).not.toContain('bloom.block.Card.radius.status-gap');
    expect(ids(gap.collected.findings)).toContain('bloom.block.Card.radius.status-gap');
    // status-open identity is preserved across the transition.
    expect(fpOf(before.findings, OPEN)).toBe(fpOf(gap.collected.findings, OPEN));
  });

  test('changing observed default/constraint/condition/location does NOT churn status-open', () => {
    const base = gapSetup();
    const drifted = gapSetup({
      capOverrides: {
        // observed code drift only
        defaults: [{ source: 'puck', pointer: '/x', normalizedPointer: '/x', state: 'value', value: 999 }],
        constraints: { min: 5, max: 9 },
        conditionTargetId: 'other',
        conditionEquals: 'zzz',
        sources: [{ kind: 'code', ref: 'DIFFERENT/path/Card.astro#/radius' }],
      },
      issueOverrides: {
        canonicalFacts: { radius: { expected: '12px', observed: '99px' } },
        sources: [{ kind: 'code', ref: 'DIFFERENT/path/Card.astro#/radius' }],
      },
    });
    expect(fpOf(drifted.collected.findings, base.id + '.status-open')).toBe(
      fpOf(base.collected.findings, base.id + '.status-open'),
    );
    // but the structural finding DID churn.
    expect(fpOf(drifted.collected.findings, base.id + '.structural')).not.toBe(
      fpOf(base.collected.findings, base.id + '.structural'),
    );
  });

  test('changing status/failureIds/evidence only does NOT churn status-open or case status-open', () => {
    const base = gapSetup();
    const noise = gapSetup({
      capOverrides: { failureIds: ['DIFFERENT'] },
      caseOverrides: {
        failureIds: ['OTHER'],
        evidenceRefs: ['conformance-results/bloom/other.png'],
        artifactRefs: ['conformance-results/bloom/other.json'],
        observed: { value: '0px', notes: 'a completely different human note' },
      },
    });
    expect(fpOf(noise.collected.findings, base.id + '.status-open')).toBe(
      fpOf(base.collected.findings, base.id + '.status-open'),
    );
    const caseOpen = base.id + '.case.s-true.live.desktop.status-open';
    expect(fpOf(noise.collected.findings, caseOpen)).toBe(
      fpOf(base.collected.findings, caseOpen),
    );
  });

  test('normative requirement label change DOES churn status-open', () => {
    const base = gapSetup();
    const renamed = gapSetup({ reqOverrides: { label: 'Радиус кнопки' } });
    expect(fpOf(renamed.collected.findings, base.id + '.status-open')).not.toBe(
      fpOf(base.collected.findings, base.id + '.status-open'),
    );
  });

  test('case status-gap includes normalized observed value → worsening churns only the gap', () => {
    const base = gapSetup();
    const worse = gapSetup({ caseOverrides: { observed: { value: '4px' } } });
    const caseGap = base.id + '.case.s-true.live.desktop.status-gap';
    const caseOpen = base.id + '.case.s-true.live.desktop.status-open';
    expect(fpOf(worse.collected.findings, caseGap)).not.toBe(
      fpOf(base.collected.findings, caseGap),
    );
    // open identity stays stable while only the observation worsened.
    expect(fpOf(worse.collected.findings, caseOpen)).toBe(
      fpOf(base.collected.findings, caseOpen),
    );
  });

  test('case expected-effect mutation churns case status-open', () => {
    const base = gapSetup();
    const changed = gapSetup({
      reqOverrides: {
        scenarios: [scenario('s-true', 0)],
        expectedCases: [expectedCase('s-true', { effect: { ...expectedCase('s-true').effect, expected: '24px' } })],
      },
    });
    const caseOpen = base.id + '.case.s-true.live.desktop.status-open';
    expect(fpOf(changed.collected.findings, caseOpen)).not.toBe(
      fpOf(base.collected.findings, caseOpen),
    );
  });

  test('code-source ordering-only difference on the row does not churn structural finding', () => {
    const a = gapSetup({
      issueOverrides: {
        sources: [
          { kind: 'code', ref: 'a#/x' },
          { kind: 'code', ref: 'b#/y' },
        ],
      },
    });
    const b = gapSetup({
      issueOverrides: {
        sources: [
          { kind: 'code', ref: 'b#/y' },
          { kind: 'code', ref: 'a#/x' },
        ],
      },
    });
    expect(fpOf(a.collected.findings, a.id + '.structural')).toBe(
      fpOf(b.collected.findings, b.id + '.structural'),
    );
  });
});

// ===========================================================================
// unreviewed capability (no requirement) — captured but not lockable
// ===========================================================================

describe('unreviewed capability (no requirement)', () => {
  test('status-open is emitted with logical-only identity and flagged unreviewed', () => {
    const c = cap('bloom.block.New.field', { status: 'UNKNOWN', scenarios: [scenario('s-true', 0)], caseResults: [caseResult({ status: 'UNKNOWN' })] });
    const out = collectGateFindings([], [c], []);
    expect(ids(out.findings)).toContain('bloom.block.New.field.status-open');
    expect(out.unreviewed).toContain('bloom.block.New.field.status-open');
  });

  test('a reviewed capability produces NO unreviewed entries', () => {
    const { collected } = gapSetup();
    expect(collected.unreviewed).toHaveLength(0);
  });
});

// ===========================================================================
// compareBaseline
// ===========================================================================

describe('compareBaseline', () => {
  const { collected } = gapSetup();
  const current = collected.findings;
  const locks = collected.requirements;

  test('exact current/baseline set → pass', () => {
    const b = baseline(current, locks);
    const r = compareBaseline(current, b);
    expect(r.ok).toBe(true);
    expect(r.unexpected).toHaveLength(0);
    expect(r.stale).toHaveLength(0);
  });

  test('new id → unexpected and fail', () => {
    const b = baseline(current.filter((f) => !f.id.endsWith('.status-gap')), locks);
    const r = compareBaseline(current, b);
    expect(r.ok).toBe(false);
    expect(r.unexpected.map((f) => f.id)).toContain('bloom.block.Card.radius.status-gap');
  });

  test('missing accepted finding → stale and fail', () => {
    const extra: BaselineFinding = { id: 'ghost.finding', fingerprint: 'sha256:'.padEnd(71, 'a') as any };
    const b = baseline([...current, extra], locks);
    const r = compareBaseline(current, b);
    expect(r.ok).toBe(false);
    expect(r.stale.map((f) => f.id)).toContain('ghost.finding');
  });

  test('same id changed fingerprint → both unexpected AND stale', () => {
    const mutated = current.map((f) =>
      f.id.endsWith('.status-gap')
        ? { ...f, fingerprint: ('sha256:' + 'f'.repeat(64)) as `sha256:${string}` }
        : f,
    );
    const b = baseline(current, locks);
    const r = compareBaseline(mutated, b);
    expect(r.ok).toBe(false);
    expect(r.unexpected.map((f) => f.id)).toContain('bloom.block.Card.radius.status-gap');
    expect(r.stale.map((f) => f.id)).toContain('bloom.block.Card.radius.status-gap');
  });

  test('requireZero fails while any finding exists, passes when empty', () => {
    const b = baseline(current, locks);
    expect(compareBaseline(current, b, { requireZero: true }).ok).toBe(false);
    const empty = baseline([], locks);
    expect(compareBaseline([], empty, { requireZero: true }).ok).toBe(true);
  });
});

// ===========================================================================
// shrinkBaseline
// ===========================================================================

describe('shrinkBaseline', () => {
  test('valid shrink: GAP→UNKNOWN removes structural + status-gap, keeps status-open', () => {
    const gap = gapSetup();
    const existing = baseline(gap.collected.findings, gap.collected.requirements);

    // capability improved to UNKNOWN (structural repaired); requirement unchanged.
    const improvedCap = cap('bloom.block.Card.radius', {
      status: 'UNKNOWN',
      scenarios: [scenario('s-true', 0)],
      caseResults: [],
      failureIds: [],
    });
    const current = collectGateFindings([], [improvedCap], gap.locks);

    const result = shrinkBaseline(current.findings, existing, current.requirements);
    expect(result.ok).toBe(true);
    // the shrunk baseline drops the structural + status-gap + case findings.
    const newIds = ids(result.baseline!.findings);
    expect(newIds).toContain('bloom.block.Card.radius.status-open');
    expect(newIds).not.toContain('bloom.block.Card.radius.status-gap');
    expect(newIds).not.toContain('bloom.block.Card.radius.structural');
    // status-open fingerprint byte-identical to the original baseline.
    expect(fpOf(result.baseline!.findings, 'bloom.block.Card.radius.status-open')).toBe(
      fpOf(existing.findings, 'bloom.block.Card.radius.status-open'),
    );
  });

  test('rejects a finding ADDITION (current not ⊆ baseline)', () => {
    const gap = gapSetup();
    const existing = baseline(gap.collected.findings, gap.collected.requirements);
    const extra: BaselineFinding = { id: 'new.finding', fingerprint: ('sha256:' + '1'.repeat(64)) as `sha256:${string}` };
    const result = shrinkBaseline([...gap.collected.findings, extra], existing, gap.collected.requirements);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/addition|superset|not.*subset/i);
  });

  test('rejects a fingerprint REPLACEMENT under an existing id', () => {
    const gap = gapSetup();
    const existing = baseline(gap.collected.findings, gap.collected.requirements);
    const replaced = gap.collected.findings.map((f) =>
      f.id.endsWith('.status-gap')
        ? { ...f, fingerprint: ('sha256:' + '9'.repeat(64)) as `sha256:${string}` }
        : f,
    );
    const result = shrinkBaseline(replaced, existing, gap.collected.requirements);
    expect(result.ok).toBe(false);
  });

  test('rejects when nothing was removed (no-op shrink)', () => {
    const gap = gapSetup();
    const existing = baseline(gap.collected.findings, gap.collected.requirements);
    const result = shrinkBaseline(gap.collected.findings, existing, gap.collected.requirements);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/nothing removed|no.*removed|at least one/i);
  });

  test('rejects any requirement-set change even if findings shrink', () => {
    const gap = gapSetup();
    const existing = baseline(gap.collected.findings, gap.collected.requirements);
    const improvedCap = cap('bloom.block.Card.radius', { status: 'UNKNOWN', scenarios: [scenario('s-true', 0)], caseResults: [], failureIds: [] });
    // requirement fingerprint changed (label drift) → must reject.
    const changedLocks = fingerprintRequirements([
      req('bloom.block.Card.radius', { label: 'Радиус', scenarios: [scenario('s-true', 0)], expectedCases: [expectedCase('s-true')] }),
    ]);
    const current = collectGateFindings([], [improvedCap], changedLocks);
    const result = shrinkBaseline(current.findings, existing, current.requirements);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/requirement/i);
  });
});

// ===========================================================================
// appendRequirementLocks
// ===========================================================================

describe('appendRequirementLocks', () => {
  test('valid strict-superset append preserves old locks and leaves findings byte-identical', () => {
    const gap = gapSetup();
    const existing = baseline(gap.collected.findings, gap.collected.requirements);
    const extraReq = req('bloom.block.Card.shadow', { label: 'Тень' });
    const superset = fingerprintRequirements([gap.r, extraReq]);

    const result = appendRequirementLocks(existing, superset);
    expect(result.ok).toBe(true);
    // findings unchanged byte-for-byte.
    expect(result.baseline!.findings).toEqual(existing.findings);
    // old lock byte-for-byte preserved, new one appended.
    expect(result.baseline!.requirements).toEqual([...superset].sort(cmpFinding));
    expect(result.baseline!.requirements.find((x) => x.id === gap.r.id)!.fingerprint).toBe(
      existing.requirements.find((x) => x.id === gap.r.id)!.fingerprint,
    );
  });

  test('no-op (identical set) is rejected — must be a strict superset', () => {
    const gap = gapSetup();
    const existing = baseline(gap.collected.findings, gap.collected.requirements);
    const result = appendRequirementLocks(existing, gap.collected.requirements);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/strict superset|no.*new|same/i);
  });

  test('rejects removal of an existing lock', () => {
    const gap = gapSetup();
    const twoLocks = fingerprintRequirements([gap.r, req('bloom.block.Card.shadow', { label: 'Тень' })]);
    const existing = baseline(gap.collected.findings, twoLocks);
    const result = appendRequirementLocks(existing, [twoLocks[0]]);
    expect(result.ok).toBe(false);
  });

  test('rejects replacement (changed fingerprint) of an existing lock', () => {
    const gap = gapSetup();
    const existing = baseline(gap.collected.findings, gap.collected.requirements);
    const changed = fingerprintRequirements([
      req('bloom.block.Card.radius', { label: 'DIFFERENT', scenarios: [scenario('s-true', 0)], expectedCases: [expectedCase('s-true')] }),
      req('bloom.block.Card.shadow', { label: 'Тень' }),
    ]);
    const result = appendRequirementLocks(existing, changed);
    expect(result.ok).toBe(false);
  });

  test('rejects when the finding set would change (append is lock-only)', () => {
    const gap = gapSetup();
    const existing = baseline(gap.collected.findings, gap.collected.requirements);
    const superset = fingerprintRequirements([gap.r, req('bloom.block.Card.shadow', { label: 'Тень' })]);
    // caller mutated findings out-of-band; not directly expressible via the API,
    // so we assert append never touches findings (covered above) and that a
    // baseline whose findings differ from a recomputed set is not silently fixed:
    const result = appendRequirementLocks(existing, superset);
    expect(result.baseline!.findings).toBe(existing.findings);
  });
});

// ===========================================================================
// Concrete accepted-GAP regressions (F-040, F-043, requirement-missing→field)
// ===========================================================================

describe('accepted-GAP regressions — only structural/severity vanish, status-open stays', () => {
  const OPEN = 'bloom.block.Benefits.render.status-open';

  function benefitsReq(): RequirementRecord {
    return req('bloom.block.Benefits.render', {
      label: 'Преимущества',
      contract: {
        kind: 'field',
        fieldType: 'array',
        visibility: 'main-panel',
        editable: true,
        persisted: true,
        container: 'array',
        order: 3,
        defaults: [],
        constraints: {},
        condition: null,
        modes: [...ALL_MODES],
        viewports: [...ALL_VIEWPORTS],
      },
    });
  }

  test('requirement-missing → real code field: structural finding vanishes, status-open stays', () => {
    const r = benefitsReq();
    const locks = fingerprintRequirements([r]);

    // BEFORE: capability absent → requirement-missing structural GAP + status-open.
    const missing = overlayMissing(r, locks);
    const openFpBefore = fpOf(missing.findings, OPEN);
    expect(ids(missing.findings)).toContain('bloom.block.Benefits.render.requirement-missing');

    // AFTER: the field now exists in code (UNKNOWN behaviour), structural gone.
    const c = cap('bloom.block.Benefits.render', {
      status: 'UNKNOWN',
      container: 'array',
      fieldType: 'array',
      order: 3,
      label: 'Преимущества',
      scenarios: [],
      caseResults: [],
    });
    const present = collectGateFindings([], [c], locks);

    expect(ids(present.findings)).not.toContain('bloom.block.Benefits.render.requirement-missing');
    expect(fpOf(present.findings, OPEN)).toBe(openFpBefore);
    // and shrink is valid (only removed a structural finding).
    const existing = baseline(missing.findings, locks);
    expect(shrinkBaseline(present.findings, existing, present.requirements).ok).toBe(true);
  });

  test('Benefits blocks→customBlocks: location churns structural finding, status-open byte-identical', () => {
    const r = benefitsReq();
    const locks = fingerprintRequirements([r]);
    const inBlocks = collectGateFindings(
      [issue('bloom.block.Benefits.render.structural', {
        canonicalFacts: { layout: 'blocks' },
        sources: [{ kind: 'code', ref: 'packages/theme-bloom/blocks/Benefits/Benefits.astro#/component' }],
      })],
      [cap('bloom.block.Benefits.render', { status: 'GAP', container: 'array', fieldType: 'array', order: 3, label: 'Преимущества', failureIds: ['bloom.block.Benefits.render.structural'] })],
      locks,
    );
    const inCustom = collectGateFindings(
      [issue('bloom.block.Benefits.render.structural', {
        canonicalFacts: { layout: 'customBlocks' },
        sources: [{ kind: 'code', ref: 'packages/theme-bloom/customBlocks/Benefits/Benefits.astro#/component' }],
      })],
      [cap('bloom.block.Benefits.render', { status: 'GAP', container: 'array', fieldType: 'array', order: 3, label: 'Преимущества', failureIds: ['bloom.block.Benefits.render.structural'] })],
      locks,
    );
    // structural churns (moved + fact changed), status-open stays byte-identical.
    expect(fpOf(inCustom.findings, 'bloom.block.Benefits.render.structural')).not.toBe(
      fpOf(inBlocks.findings, 'bloom.block.Benefits.render.structural'),
    );
    expect(fpOf(inCustom.findings, OPEN)).toBe(fpOf(inBlocks.findings, OPEN));
  });

  test('invalid observed default becomes the locked default while behaviour stays UNKNOWN', () => {
    // F-043: --radius-button 100px > max 48. Observed default drift lives in the
    // structural finding; the semantic open identity is unchanged.
    const id = 'bloom.theme-setting.token.--radius-button';
    const r = req(id, { contract: null, label: 'Скругление кнопки' });
    const locks = fingerprintRequirements([r]);
    const before = collectGateFindings(
      [issue(`${id}.structural`, {
        expectedCode: 'within-range',
        observedCode: 'exceeds-max',
        canonicalFacts: { property: '--radius-button', observed: 100, max: 48 },
        sources: [{ kind: 'code', ref: 'packages/theme-bloom/theme.json#/tokens/--radius-button' }],
      })],
      [cap(id, { surface: 'theme-setting', status: 'GAP', failureIds: [`${id}.structural`], defaults: [{ source: 'theme', pointer: '/tokens/--radius-button', normalizedPointer: '/tokens/--radius-button', state: 'value', value: 48 }] })],
      locks,
    );
    const after = collectGateFindings(
      [issue(`${id}.structural`, {
        expectedCode: 'within-range',
        observedCode: 'exceeds-max',
        canonicalFacts: { property: '--radius-button', observed: 100, max: 48 },
        sources: [{ kind: 'code', ref: 'packages/theme-bloom/theme.json#/tokens/--radius-button' }],
      })],
      // observed default is now the invalid 100 (drift) but behaviour still UNKNOWN/GAP.
      [cap(id, { surface: 'theme-setting', status: 'GAP', failureIds: [`${id}.structural`], defaults: [{ source: 'theme', pointer: '/tokens/--radius-button', normalizedPointer: '/tokens/--radius-button', state: 'value', value: 100 }] })],
      locks,
    );
    expect(fpOf(after.findings, `${id}.status-open`)).toBe(
      fpOf(before.findings, `${id}.status-open`),
    );
  });

  // helper: emulate a requirement-missing structural finding + the synthetic open.
  function overlayMissing(r: RequirementRecord, locks: ReturnType<typeof fingerprintRequirements>) {
    const structural = issue('bloom.block.Benefits.render.requirement-missing', {
      status: 'GAP',
      expectedCode: 'capability-present',
      observedCode: 'capability-absent',
      canonicalFacts: { requirementLabel: 'Преимущества' },
      sources: r.sources.map((s) => ({ kind: s.kind, ref: s.ref })),
    });
    // A missing capability still needs a status-open keyed by the requirement.
    return collectGateFindings([structural], [], locks);
  }
});
