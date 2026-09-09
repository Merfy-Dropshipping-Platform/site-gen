import {
  overlayRequirements,
  proposeRequirements,
} from '../conformance/requirements';
import type {
  CapabilityRecord,
  RequirementRecord,
  StructuralIssue,
  ScenarioDefinition,
} from '../conformance/types';
import { makeCapabilityId } from '../conformance/ids';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function editableRow(
  id: string,
  overrides: Partial<CapabilityRecord> = {},
): CapabilityRecord {
  return {
    id,
    theme: 'bloom',
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
    modes: ['hot-preview', 'initial-preview', 'live'],
    viewports: ['desktop', 'mobile'],
    caseResults: [],
    sources: [{ kind: 'code', ref: 'runtime' }],
    status: 'UNKNOWN',
    failureIds: [],
    ...overrides,
  };
}

function fieldContract(
  overrides: Partial<
    Extract<RequirementRecord['contract'], { kind: 'field' }>
  > = {},
): Extract<RequirementRecord['contract'], { kind: 'field' }> {
  return {
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
    modes: ['hot-preview', 'initial-preview', 'live'],
    viewports: ['desktop', 'mobile'],
    ...overrides,
  };
}

const HEADING_ID = makeCapabilityId('bloom', 'block', 'Catalog', 'heading');

function headingRequirement(
  overrides: Partial<RequirementRecord> = {},
): RequirementRecord {
  return {
    id: HEADING_ID,
    sources: [{ kind: 'user', ref: 'все-открыто' }],
    required: true,
    label: 'Заголовок',
    contract: fieldContract(),
    ...overrides,
  };
}

function findingIds(findings: StructuralIssue[]): string[] {
  return findings.map((f) => f.id).sort();
}

// ---------------------------------------------------------------------------
// overlayRequirements
// ---------------------------------------------------------------------------

describe('overlayRequirements — matching and source merge', () => {
  it('adds every sorted user/figma/project-doc source to a matched row', () => {
    const rows = [editableRow(HEADING_ID)];
    const req = headingRequirement({
      sources: [
        { kind: 'figma', ref: 'file/node-2' },
        { kind: 'user', ref: 'все-открыто' },
      ],
    });
    const { rows: out } = overlayRequirements(rows, [req]);
    const merged = out.find((r) => r.id === HEADING_ID)!;
    // Original code source retained + requirement sources appended, sorted.
    expect(merged.sources).toEqual([
      { kind: 'code', ref: 'runtime' },
      { kind: 'figma', ref: 'file/node-2' },
      { kind: 'user', ref: 'все-открыто' },
    ]);
  });

  it('emits a stable requirement-missing GAP when code lacks a required capability', () => {
    const { findings } = overlayRequirements([], [headingRequirement()]);
    expect(findingIds(findings)).toContain(`${HEADING_ID}.requirement-missing`);
    const f = findings.find((x) => x.id === `${HEADING_ID}.requirement-missing`)!;
    expect(f.status).toBe('GAP');
  });

  it('does not emit requirement-missing when the capability exists', () => {
    const { findings } = overlayRequirements([editableRow(HEADING_ID)], [
      headingRequirement(),
    ]);
    expect(findingIds(findings)).not.toContain(`${HEADING_ID}.requirement-missing`);
  });
});

describe('overlayRequirements — same ID hidden/disabled/renamed can never pass', () => {
  it('editable field turned hidden yields requirement GAP + status-gap, never PASS', () => {
    const row = editableRow(HEADING_ID, {
      visibility: 'hidden',
      editable: false,
    });
    const { findings } = overlayRequirements([row], [headingRequirement()]);
    const ids = findingIds(findings);
    expect(ids).toContain(`${HEADING_ID}.requirement-contract-mismatch`);
    expect(ids).toContain(`${HEADING_ID}.status-gap`);
    // The status-gap finding is a real GAP: retaining an ID while hiding it can
    // never resolve to PASS (StructuralIssue.status structurally excludes PASS).
    const statusGap = findings.find((f) => f.id === `${HEADING_ID}.status-gap`)!;
    expect(statusGap.status).toBe('GAP');
  });

  it('changed container/persistence yields a contract-mismatch GAP', () => {
    const row = editableRow(HEADING_ID, { container: 'object', persisted: false });
    const { findings } = overlayRequirements([row], [headingRequirement()]);
    expect(findingIds(findings)).toContain(
      `${HEADING_ID}.requirement-contract-mismatch`,
    );
  });

  it('renamed sidebar field (label drift) yields a separate requirement-label-mismatch GAP', () => {
    const row = editableRow(HEADING_ID, { label: 'Совсем другое' });
    const { findings } = overlayRequirements([row], [headingRequirement()]);
    const ids = findingIds(findings);
    expect(ids).toContain(`${HEADING_ID}.requirement-label-mismatch`);
    // whitespace-only difference must NOT be a drift
    const row2 = editableRow(HEADING_ID, { label: '  Заголовок  ' });
    const { findings: f2 } = overlayRequirements([row2], [headingRequirement()]);
    expect(findingIds(f2)).not.toContain(`${HEADING_ID}.requirement-label-mismatch`);
  });
});

describe('overlayRequirements — scenario findings', () => {
  const scnA: ScenarioDefinition = {
    id: 's-a',
    order: 0,
    role: 'a',
    value: 'ALPHA',
    validity: 'expected-valid',
  };

  it('emits requirement-scenario-missing when a reviewed scenario is absent in code', () => {
    const row = editableRow(HEADING_ID, { scenarios: [] });
    const req = headingRequirement({ scenarios: [scnA] });
    const { findings } = overlayRequirements([row], [req]);
    expect(findingIds(findings)).toContain(
      `${HEADING_ID}.requirement-scenario-missing`,
    );
  });

  it('emits requirement-scenario-mismatch when scenario value/order differs', () => {
    const row = editableRow(HEADING_ID, {
      scenarios: [{ ...scnA, value: 'DIFFERENT' }],
    });
    const req = headingRequirement({ scenarios: [scnA] });
    const { findings } = overlayRequirements([row], [req]);
    expect(findingIds(findings)).toContain(
      `${HEADING_ID}.requirement-scenario-mismatch`,
    );
  });

  it('no scenario finding when code exposes the reviewed scenario exactly', () => {
    const row = editableRow(HEADING_ID, { scenarios: [scnA] });
    const req = headingRequirement({ scenarios: [scnA] });
    const { findings } = overlayRequirements([row], [req]);
    const ids = findingIds(findings);
    expect(ids).not.toContain(`${HEADING_ID}.requirement-scenario-missing`);
    expect(ids).not.toContain(`${HEADING_ID}.requirement-scenario-mismatch`);
  });
});

describe('overlayRequirements — determinism', () => {
  it('findings are sorted and stable across runs', () => {
    const rows = [editableRow(HEADING_ID, { visibility: 'hidden', editable: false })];
    const reqs = [headingRequirement()];
    const a = overlayRequirements(rows, reqs).findings.map((f) => f.id);
    const b = overlayRequirements(rows, reqs).findings.map((f) => f.id);
    expect(a).toEqual(b);
    expect(a).toEqual([...a].sort());
  });
});

// ---------------------------------------------------------------------------
// proposeRequirements
// ---------------------------------------------------------------------------

describe('proposeRequirements — deterministic bootstrap', () => {
  it('proposes one row per editable capability and per non-PASS structural issue', () => {
    const rows = [
      editableRow(HEADING_ID),
      editableRow(makeCapabilityId('bloom', 'block', 'Catalog', 'columns')),
    ];
    const issues: StructuralIssue[] = [
      {
        id: 'bloom.block.Publications.normalization.cards',
        theme: 'bloom',
        status: 'GAP',
        expectedCode: 'trunc-clamp-4',
        observedCode: 'round-clamp-12',
        canonicalFacts: {},
        detail: 'divergent mapped renderer',
        sources: [{ kind: 'project-doc', ref: 'publications-design' }],
      },
    ];
    const proposed = proposeRequirements(rows, issues, { pages: [], flows: [] });
    const ids = proposed.map((r) => r.id);
    expect(ids).toContain(HEADING_ID);
    expect(ids).toContain('bloom.block.Publications.normalization.cards');
    // stable sorted order
    expect(ids).toEqual([...ids].sort());
  });

  it('merges duplicate capability IDs into one row with sorted de-duplicated sources', () => {
    const rows = [
      editableRow(HEADING_ID, { sources: [{ kind: 'code', ref: 'runtime' }] }),
    ];
    const issues: StructuralIssue[] = [
      {
        id: HEADING_ID,
        theme: 'bloom',
        status: 'GAP',
        expectedCode: 'x',
        observedCode: 'y',
        canonicalFacts: {},
        detail: 'same id also structural',
        sources: [{ kind: 'user', ref: 'все-открыто' }],
      },
    ];
    const proposed = proposeRequirements(rows, issues, { pages: [], flows: [] });
    const rowsForId = proposed.filter((r) => r.id === HEADING_ID);
    expect(rowsForId.length).toBe(1);
    // sources merged, sorted, de-duplicated
    const srcRefs = rowsForId[0].sources.map((s) => `${s.kind}:${s.ref}`);
    expect(srcRefs).toEqual([...new Set(srcRefs)].sort());
  });

  it('includes every user-required page/flow as a surface requirement', () => {
    const proposed = proposeRequirements([], [], {
      pages: [{ id: makeCapabilityId('bloom', 'page', 'cart'), label: 'Корзина' }],
      flows: [{ id: makeCapabilityId('bloom', 'flow', 'checkout'), label: 'Checkout' }],
    });
    const ids = proposed.map((r) => r.id);
    expect(ids).toContain(makeCapabilityId('bloom', 'page', 'cart'));
    expect(ids).toContain(makeCapabilityId('bloom', 'flow', 'checkout'));
  });
});

describe('proposeRequirements / review validation — invalid expected cases rejected', () => {
  it('rejects a reviewed requirement set with duplicate capability IDs', () => {
    const dup: RequirementRecord[] = [headingRequirement(), headingRequirement()];
    expect(() => overlayRequirements([editableRow(HEADING_ID)], dup)).toThrow();
  });

  it('rejects an expected case whose scenario is not declared by its requirement', () => {
    const req = headingRequirement({
      scenarios: [
        { id: 's-a', order: 0, role: 'a', value: 'A', validity: 'expected-valid' },
      ],
      expectedCases: [
        {
          scenarioId: 's-missing',
          modes: ['live'],
          viewports: ['desktop'],
          effect: {
            kind: 'dom-text',
            target: 'h2',
            comparator: 'equals',
            expected: 'A',
          },
        },
      ],
    });
    expect(() => overlayRequirements([editableRow(HEADING_ID)], [req])).toThrow();
  });

  it('rejects an expected case when the requirement contract is null', () => {
    const req = headingRequirement({
      contract: null,
      scenarios: [
        { id: 's-a', order: 0, role: 'a', value: 'A', validity: 'expected-valid' },
      ],
      expectedCases: [
        {
          scenarioId: 's-a',
          modes: ['live'],
          viewports: ['desktop'],
          effect: {
            kind: 'dom-text',
            target: 'h2',
            comparator: 'equals',
            expected: 'A',
          },
        },
      ],
    });
    expect(() => overlayRequirements([editableRow(HEADING_ID)], [req])).toThrow();
  });

  it('rejects an expected case whose mode/viewport is not declared by its non-null contract', () => {
    const req = headingRequirement({
      contract: fieldContract({ modes: ['live'], viewports: ['desktop'] }),
      scenarios: [
        { id: 's-a', order: 0, role: 'a', value: 'A', validity: 'expected-valid' },
      ],
      expectedCases: [
        {
          scenarioId: 's-a',
          modes: ['hot-preview'], // not declared by contract
          viewports: ['desktop'],
          effect: {
            kind: 'dom-text',
            target: 'h2',
            comparator: 'equals',
            expected: 'A',
          },
        },
      ],
    });
    expect(() => overlayRequirements([editableRow(HEADING_ID)], [req])).toThrow();
  });
});
