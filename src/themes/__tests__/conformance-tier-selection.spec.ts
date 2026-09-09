/**
 * Task 3 — tier routing (structural vs future behavior tiers).
 *
 * A tiered theme (Satin) must keep AUTHORING/EFFECT/BROWSER UNKNOWN visible in
 * the inventory/report WITHOUT letting it enter the structural baseline. These
 * tests lock that invariant:
 *   - `collectTierGateFindings('structural', …)` only ever emits structural
 *     findings; a future-tier UNKNOWN never baselines as structural debt;
 *   - a behavior tier's UNKNOWN produces its own findings, tagged with that tier;
 *   - the overall release status aggregates ALL required tiers and stays non-PASS
 *     while any behavior tier is UNKNOWN (structural PASS ≠ behavior PASS);
 *   - a required tier with no reported status is a HARNESS failure, never a
 *     silent PASS.
 */

import {
  collectTierGateFindings,
  aggregateReleaseStatus,
  type ConformanceTier,
  type TieredCapabilityRecord,
  type TieredCapabilityCaseResult,
  type TieredStructuralIssue,
  type CapabilityStatus,
} from '../../../packages/theme-contract/conformance';

const THEME = 'satin';

function fixtureCase(
  over: Partial<TieredCapabilityCaseResult> & { tier: ConformanceTier; status: CapabilityStatus },
): TieredCapabilityCaseResult {
  return {
    scenarioId: 's-0',
    value: true,
    mode: 'live',
    viewport: 'desktop',
    expectedEffect: {
      kind: 'dom-attribute',
      target: '[data-probe]',
      property: 'data-on',
      comparator: 'equals',
      expected: 'true',
    },
    evidenceRefs: [],
    artifactRefs: [],
    failureIds: [],
    ...over,
  };
}

function fixtureCapability(
  over: Partial<TieredCapabilityRecord> & {
    requiredTiers: readonly ConformanceTier[];
    tierStatuses: Partial<Record<ConformanceTier, CapabilityStatus>>;
  },
): TieredCapabilityRecord {
  return {
    id: `${THEME}.flow.probe.example`,
    theme: THEME,
    surface: 'flow',
    capability: 'probe.example',
    scenarios: [],
    modes: ['live'],
    viewports: ['desktop'],
    sources: [{ kind: 'code', ref: 'themes/satin/src/probe.ts#/x' }],
    status: 'UNKNOWN',
    failureIds: [],
    ...over,
  };
}

describe('collectTierGateFindings — structural gate rejects future UNKNOWN', () => {
  // The exact regression the plan mandates BEFORE the selector exists.
  it('does not baseline future UNKNOWN as structural debt', () => {
    const row = fixtureCapability({
      requiredTiers: ['structural', 'effect'],
      tierStatuses: { structural: 'PASS', effect: 'UNKNOWN' },
      caseResults: [fixtureCase({ tier: 'effect', status: 'UNKNOWN' })],
    });
    expect(collectTierGateFindings('structural', [], [row], new Map())).toEqual([]);
    expect(
      collectTierGateFindings('effect', [], [row], new Map()).map((x) => x.tier),
    ).toEqual(['effect', 'effect']);
    expect(aggregateReleaseStatus([row])).toBe('UNKNOWN');
  });

  it('emits every structural finding tagged with the structural tier', () => {
    const issue: TieredStructuralIssue = {
      id: `${THEME}.flow.probe.example.gap`,
      theme: THEME,
      tier: 'structural',
      status: 'GAP',
      expectedCode: 'ok',
      observedCode: 'gap',
      canonicalFacts: { x: 1 },
      detail: 'structural gap',
      sources: [{ kind: 'code', ref: 'themes/satin/src/probe.ts#/x' }],
    };
    const row = fixtureCapability({
      requiredTiers: ['structural'],
      tierStatuses: { structural: 'GAP' },
      status: 'GAP',
    });
    const out = collectTierGateFindings('structural', [issue], [row], new Map());
    expect(out.every((f) => f.tier === 'structural')).toBe(true);
    // the raw structural issue is present verbatim (its granular id).
    expect(out.map((f) => f.id)).toContain(issue.id);
    // and the synthesized status-open/status-gap for the GAP capability.
    expect(out.map((f) => f.id)).toContain(`${row.id}.status-open`);
    expect(out.map((f) => f.id)).toContain(`${row.id}.status-gap`);
  });

  it('excludes a capability from a tier it does not require', () => {
    const row = fixtureCapability({
      requiredTiers: ['structural'],
      tierStatuses: { structural: 'PASS' },
      status: 'PASS',
    });
    // The capability does not require the effect tier → it contributes nothing.
    expect(collectTierGateFindings('effect', [], [row], new Map())).toEqual([]);
  });

  it('never lets a structural issue leak into a behavior tier', () => {
    const issue: TieredStructuralIssue = {
      id: `${THEME}.flow.probe.example.gap`,
      theme: THEME,
      tier: 'structural',
      status: 'GAP',
      expectedCode: 'ok',
      observedCode: 'gap',
      canonicalFacts: {},
      detail: 'structural gap',
      sources: [],
    };
    const row = fixtureCapability({
      requiredTiers: ['structural', 'effect'],
      tierStatuses: { structural: 'GAP', effect: 'UNKNOWN' },
      caseResults: [fixtureCase({ tier: 'effect', status: 'UNKNOWN' })],
    });
    const effect = collectTierGateFindings('effect', [issue], [row], new Map());
    // The structural issue's granular id is NOT among the effect findings.
    expect(effect.map((f) => f.id)).not.toContain(issue.id);
    expect(effect.every((f) => f.tier === 'effect')).toBe(true);
  });

  it('is a harness failure when a required tier has no reported status', () => {
    const row = fixtureCapability({
      requiredTiers: ['structural', 'authoring'],
      // authoring status is MISSING → must throw, never silently pass.
      tierStatuses: { structural: 'PASS' },
    });
    expect(() =>
      collectTierGateFindings('authoring', [], [row], new Map()),
    ).toThrow(/requires tier "authoring"/);
    expect(() => aggregateReleaseStatus([row])).toThrow(/requires tier "authoring"/);
  });
});

describe('aggregateReleaseStatus — release summary stays non-PASS', () => {
  it('is GAP when any required tier is GAP', () => {
    const row = fixtureCapability({
      requiredTiers: ['structural', 'effect'],
      tierStatuses: { structural: 'GAP', effect: 'UNKNOWN' },
    });
    expect(aggregateReleaseStatus([row])).toBe('GAP');
  });

  it('is UNKNOWN when structural is PASS but a behavior tier is UNKNOWN', () => {
    const row = fixtureCapability({
      requiredTiers: ['structural', 'browser'],
      tierStatuses: { structural: 'PASS', browser: 'UNKNOWN' },
    });
    expect(aggregateReleaseStatus([row])).toBe('UNKNOWN');
  });

  it('is NEEDS_DECISION over UNKNOWN but under GAP', () => {
    const a = fixtureCapability({
      requiredTiers: ['structural'],
      tierStatuses: { structural: 'NEEDS_DECISION' },
    });
    const b = fixtureCapability({
      id: `${THEME}.flow.probe.other`,
      requiredTiers: ['structural'],
      tierStatuses: { structural: 'UNKNOWN' },
    });
    expect(aggregateReleaseStatus([a, b])).toBe('NEEDS_DECISION');
  });
});
