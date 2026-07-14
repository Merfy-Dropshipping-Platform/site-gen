/**
 * Fingerprinted gate findings.
 *
 * This module turns the structural issues + capability rows + locked requirement
 * fingerprints into the canonical `BaselineFinding[]` that the shrink-only
 * ratchet accepts. A finding's identity is its granular `id`; its `fingerprint`
 * additionally locks the *meaning* under that id so that a changed meaning under
 * the same id is a churn, while an unrelated code-location shift is not.
 *
 * Two finding families are synthesized here and are OWNED here (any incoming
 * structural issue in the `status-open` / `status-gap` / `status-needs-decision`
 * namespace is superseded):
 *
 *   1. `<capabilityId>.status-open`          — one per open (non-PASS) capability
 *   2. `<capabilityId>.status-gap`           — GAP severity
 *      `<capabilityId>.status-needs-decision`— NEEDS_DECISION severity
 *   3. `<capabilityId>.case.<scenario>.<mode>.<viewport>.status-open|status-gap`
 *
 * A "capability is open" when it is a non-PASS row OR a reviewed requirement that
 * no PASS row satisfies (a *missing* capability is therefore open, keyed by the
 * requirement so a structural GAP can improve to behaviour UNKNOWN without
 * replacing the accepted `status-open`).
 *
 * FINGERPRINT PURITY. The fingerprint hashes ONLY canonical data:
 *
 *   id + expectedCode + observedCode + sanitized/sorted canonicalFacts
 *      + sorted canonical source refs
 *
 * Absolute paths, timestamps, secrets and volatile exception messages are
 * forbidden inside it. A canonical source ref is a repo-relative path plus a
 * semantic selector / JSON pointer (or a Figma file+node ID); line/column
 * numbers are stripped so an unrelated line shift cannot replace a locked
 * fingerprint. Synthetic `status-open` findings never carry observed
 * implementation locations, raw code defaults/constraints/conditions or code
 * source refs — those drift while a structural GAP is repaired.
 *
 * This module imports nothing from the site-gen runtime.
 */

import { createHash } from 'node:crypto';

import type {
  CapabilityRecord,
  CapabilityCaseResult,
  CapabilityStatus,
  ConformanceTier,
  RequirementRecord,
  RequirementSource,
  StructuralIssue,
  BaselineFinding,
  RequirementExpectedCase,
  TieredCapabilityRecord,
  TieredGateFinding,
  TieredStructuralIssue,
} from './types';

// ---------------------------------------------------------------------------
// Canonicalization
// ---------------------------------------------------------------------------

/**
 * Deterministic JSON: object keys are sorted deeply, ARRAY ORDER IS PRESERVED
 * (arrays are semantically ordered in this model — scenarios, sources are
 * pre-sorted by the caller where order is irrelevant). `undefined` fields are
 * dropped; primitives serialize as JSON.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src).sort()) {
    if (src[key] === undefined) continue;
    out[key] = canonicalize(src[key]);
  }
  return out;
}

function sha256(canonical: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

// --- source-ref canonicalization ------------------------------------------

/**
 * A canonical source ref is a repo-relative path + semantic selector/JSON
 * pointer (or Figma file+node ID). Strip `:line:col` positional coordinates
 * (`path:12:4#/pointer` → `path#/pointer`) so an unrelated line shift cannot
 * churn a locked fingerprint. The JSON pointer / selector after `#` and Figma
 * `file:node` refs are kept verbatim (they ARE semantic).
 */
function canonicalizeSourceRef(ref: string): string {
  const hashIdx = ref.indexOf('#');
  const path = hashIdx === -1 ? ref : ref.slice(0, hashIdx);
  const selector = hashIdx === -1 ? '' : ref.slice(hashIdx);
  // remove trailing :line or :line:col from the path segment only.
  const strippedPath = path.replace(/:\d+(?::\d+)?$/, '');
  return `${strippedPath}${selector}`;
}

function canonicalSourceRefs(
  sources: ReadonlyArray<{ kind: string; ref: string }>,
): string[] {
  return sources
    .map((s) => `${s.kind} ${canonicalizeSourceRef(s.ref)}`)
    .sort();
}

// ---------------------------------------------------------------------------
// id parsing — surface/capability are row-independent
// ---------------------------------------------------------------------------

function parseIdentity(id: string): { surface: string; capability: string } {
  // id = theme.surface.<capability...>
  const parts = id.split('.');
  const surface = parts[1] ?? '';
  const capability = parts.slice(2).join('.');
  return { surface, capability };
}

// ---------------------------------------------------------------------------
// Structural issue fingerprint
// ---------------------------------------------------------------------------

export function fingerprintStructuralIssue(issue: StructuralIssue): `sha256:${string}` {
  const canonical = canonicalStringify({
    id: issue.id,
    expectedCode: issue.expectedCode,
    observedCode: issue.observedCode,
    canonicalFacts: issue.canonicalFacts,
    sources: canonicalSourceRefs(issue.sources),
  });
  return sha256(canonical);
}

// ---------------------------------------------------------------------------
// Requirement fingerprint (locked normative identity)
// ---------------------------------------------------------------------------

export interface RequirementFingerprint {
  id: string;
  fingerprint: `sha256:${string}`;
  /** retained so status-open findings can reuse the normative identity */
  requirement: RequirementRecord;
}

/** user / figma / project-doc refs, sorted; these are the ONLY refs allowed in
 *  the stable open identity. */
function normativeSourceRefs(sources: RequirementSource[]): string[] {
  return sources.map((s) => `${s.kind} ${s.ref}`).sort();
}

function canonicalExpectedCase(ec: RequirementExpectedCase): unknown {
  return {
    scenarioId: ec.scenarioId,
    modes: [...ec.modes].sort(),
    viewports: [...ec.viewports].sort(),
    effect: ec.effect,
  };
}

export function fingerprintRequirement(req: RequirementRecord): `sha256:${string}` {
  // Scenarios are ORDERED: canonicalize by (order, id), NEVER as an unordered
  // set, so a scenario-order mutation churns.
  const scenarios = (req.scenarios ?? [])
    .slice()
    .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id < b.id ? -1 : 1))
    .map((s) => ({ id: s.id, order: s.order, role: s.role, value: s.value, assignments: s.assignments ?? null, validity: s.validity }));
  const expectedCases = (req.expectedCases ?? [])
    .slice()
    .sort((a, b) => (a.scenarioId < b.scenarioId ? -1 : a.scenarioId > b.scenarioId ? 1 : 0))
    .map(canonicalExpectedCase);

  const canonical = canonicalStringify({
    id: req.id,
    required: req.required,
    label: normalizeLabel(req.label),
    sources: normativeSourceRefs(req.sources),
    contract: req.contract,
    scenarios,
    expectedCases,
  });
  return sha256(canonical);
}

export function fingerprintRequirements(
  requirements: RequirementRecord[],
): RequirementFingerprint[] {
  return requirements
    .map((requirement) => ({
      id: requirement.id,
      fingerprint: fingerprintRequirement(requirement),
      requirement,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function normalizeLabel(label: string | undefined): string {
  return (label ?? '').trim().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// collectGateFindings
// ---------------------------------------------------------------------------

const STATUS_NAMESPACE = ['.status-open', '.status-gap', '.status-needs-decision'];

function isSynthesizedStatusId(id: string): boolean {
  return STATUS_NAMESPACE.some((suffix) => id.endsWith(suffix));
}

export interface GateFindingsResult {
  findings: BaselineFinding[];
  /** the locked requirement fingerprints (id + fingerprint), sorted */
  requirements: BaselineFinding[];
  /** status-open ids that have NO reviewed requirement — capturable only once
   *  the capability is PASS or a requirement is reviewed. */
  unreviewed: string[];
}

/** normalized, comparator-specific observed machine value for a failing case */
function normalizedObservation(cr: CapabilityCaseResult): unknown {
  // only the machine value + comparator/property/target — never notes,
  // screenshots, timestamps or exception text.
  return {
    target: cr.expectedEffect.target,
    property: cr.expectedEffect.property ?? null,
    comparator: cr.expectedEffect.comparator,
    observed: cr.observed ? cr.observed.value : null,
  };
}

export function collectGateFindings(
  structuralIssues: StructuralIssue[],
  capabilities: CapabilityRecord[],
  requirementFingerprints: RequirementFingerprint[],
): GateFindingsResult {
  // reject duplicate capability IDs (defensive; the pipeline already checks).
  const seen = new Set<string>();
  for (const c of capabilities) {
    if (seen.has(c.id)) {
      throw new Error(`collectGateFindings: duplicate capability id "${c.id}"`);
    }
    seen.add(c.id);
  }

  const rowById = new Map(capabilities.map((c) => [c.id, c]));
  const reqById = new Map(requirementFingerprints.map((r) => [r.id, r]));

  const findings: BaselineFinding[] = [];
  const unreviewed: string[] = [];

  // 1) every structural issue verbatim, EXCEPT the status-* namespace we own.
  for (const issue of structuralIssues) {
    if (isSynthesizedStatusId(issue.id)) continue;
    findings.push({ id: issue.id, fingerprint: fingerprintStructuralIssue(issue) });
  }

  // 2) the set of "open" capability ids = non-PASS rows ∪ requirements with no
  //    PASS row.
  const openIds = new Set<string>();
  for (const c of capabilities) {
    if (c.status !== 'PASS') openIds.add(c.id);
  }
  for (const rf of requirementFingerprints) {
    const row = rowById.get(rf.id);
    if (!row || row.status !== 'PASS') openIds.add(rf.id);
  }

  for (const id of openIds) {
    const row = rowById.get(id);
    const rf = reqById.get(id);
    const { surface, capability } = parseIdentity(id);

    // status-open — stable logical/requirement identity ONLY.
    const openFacts: Record<string, unknown> = { surface, capability };
    if (rf) {
      openFacts.requirementFingerprint = rf.fingerprint;
      openFacts.requirementSources = normativeSourceRefs(rf.requirement.sources);
    } else {
      // no requirement: logical-only identity; must be reviewed before capture.
      unreviewed.push(`${id}.status-open`);
    }
    findings.push({
      id: `${id}.status-open`,
      fingerprint: sha256(
        canonicalStringify({
          id: `${id}.status-open`,
          expectedCode: 'capability-pass',
          observedCode: 'capability-open',
          canonicalFacts: openFacts,
          sources: rf ? normativeSourceRefs(rf.requirement.sources) : [],
        }),
      ),
    });

    // severity findings.
    const isGap = row ? row.status === 'GAP' : true; // missing ⇒ GAP severity
    const isNeedsDecision = row ? row.status === 'NEEDS_DECISION' : false;

    if (isGap) {
      const gapObserved = row
        ? (row.caseResults ?? [])
            .filter((cr) => cr.status === 'GAP')
            .map(normalizedObservation)
        : 'capability-absent';
      findings.push({
        id: `${id}.status-gap`,
        fingerprint: sha256(
          canonicalStringify({
            id: `${id}.status-gap`,
            expectedCode: 'capability-pass-or-unknown',
            observedCode: 'capability-gap',
            canonicalFacts: { surface, capability, observed: gapObserved },
            sources: [],
          }),
        ),
      });
    } else if (isNeedsDecision) {
      findings.push({
        id: `${id}.status-needs-decision`,
        fingerprint: sha256(
          canonicalStringify({
            id: `${id}.status-needs-decision`,
            expectedCode: 'capability-pass-or-unknown',
            observedCode: 'capability-needs-decision',
            canonicalFacts: { surface, capability },
            sources: [],
          }),
        ),
      });
    }

    // 3) per-case findings for every non-PASS case.
    if (row) {
      for (const cr of row.caseResults ?? []) {
        if (cr.status === 'PASS') continue;
        const caseBase = `${id}.case.${cr.scenarioId}.${cr.mode}.${cr.viewport}`;
        // normative expected effect from the requirement (if present), else the
        // observed case's declared expected effect.
        const reqCase = rf?.requirement.expectedCases?.find(
          (ec) => ec.scenarioId === cr.scenarioId,
        );
        const expectedEffect = reqCase ? reqCase.effect : cr.expectedEffect;

        const caseOpenFacts: Record<string, unknown> = {
          surface,
          capability,
          scenarioId: cr.scenarioId,
          mode: cr.mode,
          viewport: cr.viewport,
          expectedEffect,
        };
        if (rf) {
          caseOpenFacts.requirementFingerprint = rf.fingerprint;
          caseOpenFacts.requirementSources = normativeSourceRefs(rf.requirement.sources);
        } else {
          unreviewed.push(`${caseBase}.status-open`);
        }
        findings.push({
          id: `${caseBase}.status-open`,
          fingerprint: sha256(
            canonicalStringify({
              id: `${caseBase}.status-open`,
              expectedCode: 'capability-pass',
              observedCode: 'capability-open',
              canonicalFacts: caseOpenFacts,
              sources: rf ? normativeSourceRefs(rf.requirement.sources) : [],
            }),
          ),
        });

        if (cr.status === 'GAP') {
          findings.push({
            id: `${caseBase}.status-gap`,
            fingerprint: sha256(
              canonicalStringify({
                id: `${caseBase}.status-gap`,
                expectedCode: 'capability-pass-or-unknown',
                observedCode: 'capability-gap',
                canonicalFacts: {
                  surface,
                  capability,
                  scenarioId: cr.scenarioId,
                  mode: cr.mode,
                  viewport: cr.viewport,
                  observed: normalizedObservation(cr),
                },
                sources: [],
              }),
            ),
          });
        } else if (cr.status === 'NEEDS_DECISION') {
          findings.push({
            id: `${caseBase}.status-needs-decision`,
            fingerprint: sha256(
              canonicalStringify({
                id: `${caseBase}.status-needs-decision`,
                expectedCode: 'capability-pass-or-unknown',
                observedCode: 'capability-needs-decision',
                canonicalFacts: {
                  surface,
                  capability,
                  scenarioId: cr.scenarioId,
                  mode: cr.mode,
                  viewport: cr.viewport,
                },
                sources: [],
              }),
            ),
          });
        }
      }
    }
  }

  // dedupe by (id) — synthesized findings win over any collided structural id.
  const byId = new Map<string, BaselineFinding>();
  for (const f of findings) byId.set(f.id, f);
  const sortedFindings = [...byId.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  const requirements: BaselineFinding[] = requirementFingerprints
    .map((r) => ({ id: r.id, fingerprint: r.fingerprint }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    findings: sortedFindings,
    requirements,
    unreviewed: [...new Set(unreviewed)].sort(),
  };
}

// ---------------------------------------------------------------------------
// Tier routing (Task 3)
//
// `collectTierGateFindings(tier, ...)` projects a set of tiered inputs onto ONE
// tier and reuses the exact `collectGateFindings` synthesis, so a structural
// gate can never accept a future authoring/effect/browser UNKNOWN. It:
//   - keeps only structural issues when the requested tier is `structural`
//     (structural issues are structural by construction; they never leak into a
//     behavior tier);
//   - projects each tiered capability onto a legacy capability whose `status`
//     is that tier's `tierStatuses[tier]` and whose `caseResults` are only the
//     cases tagged with that tier;
//   - drops a capability entirely from a tier it does not require.
// Every synthesized finding is re-tagged with the requested tier.
// ---------------------------------------------------------------------------

/** A capability MUST report every required tier; a gap here is a harness bug. */
function tierStatusOrThrow(
  cap: TieredCapabilityRecord,
  tier: ConformanceTier,
): CapabilityStatus {
  const status = cap.tierStatuses[tier];
  if (status === undefined) {
    throw new Error(
      `collectTierGateFindings: capability "${cap.id}" requires tier "${tier}" but has no tierStatuses["${tier}"]`,
    );
  }
  return status;
}

/** Project a tiered capability onto the legacy shape for exactly one tier. */
function projectCapabilityToTier(
  cap: TieredCapabilityRecord,
  tier: ConformanceTier,
): CapabilityRecord {
  const status = tierStatusOrThrow(cap, tier);
  const caseResults: CapabilityCaseResult[] = (cap.caseResults ?? [])
    .filter((cr) => cr.tier === tier)
    .map(({ tier: _tier, ...rest }) => rest);
  const { requiredTiers: _r, tierStatuses: _s, ...base } = cap;
  return { ...base, status, caseResults };
}

export function collectTierGateFindings(
  tier: ConformanceTier,
  issues: readonly TieredStructuralIssue[],
  capabilities: readonly TieredCapabilityRecord[],
  requirementFingerprints: ReadonlyMap<string, string>,
): TieredGateFinding[] {
  // Structural issues only enter the structural tier. Behavior tiers carry no
  // structural issue set (their debt is expressed through tiered capabilities).
  const scopedIssues: StructuralIssue[] =
    tier === 'structural'
      ? issues.filter((i) => i.tier === 'structural')
      : [];

  // Only capabilities that REQUIRE this tier participate in it.
  const scopedCaps = capabilities
    .filter((c) => c.requiredTiers.includes(tier))
    .map((c) => projectCapabilityToTier(c, tier));

  // Rebuild the RequirementFingerprint[] shape collectGateFindings expects from
  // the id→fingerprint map. The map form carries no normative sources, so the
  // synthesized open identity stays logical-only (which is correct: the release
  // requirement fingerprints are the normative lock, supplied separately when a
  // full run assembles them).
  const rfList: RequirementFingerprint[] = [...requirementFingerprints].map(
    ([id, fingerprint]) => ({
      id,
      fingerprint: fingerprint as `sha256:${string}`,
      requirement: {
        id,
        sources: [],
        required: true,
        label: '',
        contract: null,
      },
    }),
  );

  const { findings } = collectGateFindings(scopedIssues, scopedCaps, rfList);
  return findings.map((f) => ({ ...f, tier }));
}

/**
 * Aggregate the overall release status across every required tier of every
 * capability. Priority mirrors `aggregateCapabilityStatus`: GAP > NEEDS_DECISION
 * > UNKNOWN > PASS. A release with any behavior tier still UNKNOWN is `UNKNOWN`
 * (never PASS): structural PASS is not behavior PASS. An empty set is `PASS`
 * only in the vacuous sense (no required tier is open); callers that require a
 * non-empty tier set enforce that separately.
 */
export function aggregateReleaseStatus(
  capabilities: readonly TieredCapabilityRecord[],
): CapabilityStatus {
  const priority: Record<CapabilityStatus, number> = {
    GAP: 3,
    NEEDS_DECISION: 2,
    UNKNOWN: 1,
    PASS: 0,
  };
  let winner: CapabilityStatus = 'PASS';
  for (const cap of capabilities) {
    for (const tier of cap.requiredTiers) {
      const status = tierStatusOrThrow(cap, tier);
      if (priority[status] > priority[winner]) winner = status;
    }
  }
  return winner;
}
