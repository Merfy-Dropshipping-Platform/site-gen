/**
 * Tier-aware semantic baseline machinery (Task 4).
 *
 * Bloom keeps its landed two-artifact `StructuralBaseline` (see `types.ts` /
 * `ratchet.ts`). Satin is TIERED: its tracked structural tier lives in a
 * `TierBaseline` plus a `ThemeBaselineManifest` that chains the exact digests of
 * every capture/shrink/append/revise. The manifest exists because the approved
 * Satin design must LATER add authoring/effect/browser tiers, and must never
 * rewrite normative locks merely because a source SHA changed.
 *
 * Everything in this module is PATH-AWARE canonical:
 *  - object keys are sorted deeply;
 *  - findings/requirements are ordered by `(id,fingerprint)`;
 *  - sources are ordered by `(kind,ref)`;
 *  - scenarios are ordered by `(order,id)`;
 *  - field OPTIONS, pages, sections, color schemes and every other normatively
 *    ordered array KEEP their original order.
 *
 * The nine manifest digests separate WHAT changed:
 *  - a normative shape/case change is a reviewed baseline transaction;
 *  - a source-only change moves NOTHING in the baseline/manifest — it only makes
 *    the generated inventory stale until a reviewed inventory refresh.
 *
 * This module imports nothing from the site-gen runtime and never reads a
 * wall-clock value.
 */

import { createHash } from "node:crypto";

import type {
  BaselineFinding,
  ConformanceTier,
  RequirementSource,
  ScenarioDefinition,
  TieredGateFinding,
  RequirementCapabilityContract,
  PreviewMode,
  ViewportName,
  CapabilityCaseResult,
} from "./types";

// ---------------------------------------------------------------------------
// Public tier types
// ---------------------------------------------------------------------------

/**
 * The tracked tier baseline: the accepted findings for ONE tier plus the exact
 * digests that lock its normative shape and its selected scenario/case set.
 */
export interface TierBaseline {
  schemaVersion: 1;
  theme: string;
  tier: ConformanceTier;
  parentBaselineDigest: `sha256:${string}` | null;
  requirements: BaselineFinding[];
  findings: TieredGateFinding[];
  capabilityShapeDigest: `sha256:${string}`;
  caseSetDigest: `sha256:${string}`;
}

/**
 * One tier's manifest entry: the exact digest chain proving the tracked baseline
 * bytes, its capture provenance (git commit + tree), the reviewed candidate
 * envelope, the requirements/shape/case/findings locks, the semantic-revision
 * prefix digest (null before the first revision) and the two parent links.
 */
export interface TierManifestEntry {
  tier: ConformanceTier;
  baselinePath: string;
  baselineDigest: `sha256:${string}`;
  captureSourceRef: string; // exact 40-hex git commit
  captureTreeDigest: `sha256:${string}`;
  captureReviewDigest: `sha256:${string}`;
  requirementsDigest: `sha256:${string}`;
  capabilityShapeDigest: `sha256:${string}`;
  caseSetDigest: `sha256:${string}`;
  findingsDigest: `sha256:${string}`;
  semanticRevisionDigest: `sha256:${string}` | null;
  parentBaselineDigest: `sha256:${string}` | null;
}

/** The whole-theme manifest: parent link + a per-tier entry map. */
export interface ThemeBaselineManifest {
  schemaVersion: 1;
  theme: string;
  parentManifestDigest: `sha256:${string}` | null;
  tiers: Partial<Record<ConformanceTier, TierManifestEntry>>;
}

// ---------------------------------------------------------------------------
// Path-aware canonicalization
// ---------------------------------------------------------------------------

/**
 * Deterministic JSON with SORTED object keys but PRESERVED array order. Callers
 * must have already ordered semantically-unordered arrays (findings, sources,
 * scenarios) via the helpers below; normatively-ordered arrays (options, pages,
 * sections, color schemes) are left EXACTLY as given. `undefined` is dropped.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src).sort()) {
    if (src[key] === undefined) continue;
    out[key] = canonicalize(src[key]);
  }
  return out;
}

function sha256(input: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

/** SHA-256 over raw bytes (used for `captureTreeDigest` over `git ls-tree` bytes). */
export function digestBytes(bytes: Buffer): `sha256:${string}` {
  return sha256(bytes);
}

// ---------------------------------------------------------------------------
// Ordering helpers (semantically-unordered arrays only)
// ---------------------------------------------------------------------------

/** Order findings/requirements by `(id,fingerprint)`. */
export function orderFindings<T extends BaselineFinding>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    if (a.fingerprint !== b.fingerprint)
      return a.fingerprint < b.fingerprint ? -1 : 1;
    return 0;
  });
}

/** Order sources by `(kind,ref)`. */
export function orderSources<T extends { kind: string; ref: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    if (a.ref !== b.ref) return a.ref < b.ref ? -1 : 1;
    return 0;
  });
}

/** Order scenarios by `(order,id)`. NEVER re-order a scenario's own value. */
export function orderScenarios(
  items: readonly ScenarioDefinition[],
): ScenarioDefinition[] {
  return [...items].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Reference validation (capture provenance + paths)
// ---------------------------------------------------------------------------

const HEX40 = /^[0-9a-f]{40}$/;

/** A `captureSourceRef` MUST be an exact 40-hex git commit. */
export function isValidCaptureSourceRef(ref: string): boolean {
  return HEX40.test(ref);
}

/** Throwing form of {@link isValidCaptureSourceRef}. */
export function captureSourceRef(ref: string): string {
  if (!isValidCaptureSourceRef(ref)) {
    throw new Error(
      `invalid captureSourceRef "${ref}": must match ^[0-9a-f]{40}$`,
    );
  }
  return ref;
}

/**
 * A tracked baseline path must be a NORMALIZED repo-relative path below
 * `conformance/baselines/`: never absolute, never containing a `..` segment,
 * never a `.` segment. Backslashes and duplicate slashes are rejected so a path
 * can never smuggle a traversal.
 */
export function isValidBaselinePath(path: string): boolean {
  if (path.length === 0) return false;
  if (path.startsWith("/")) return false; // absolute
  if (path.includes("\\")) return false; // no windows separators
  if (path.includes("//")) return false; // no empty segments
  const segments = path.split("/");
  if (segments.some((s) => s === ".." || s === "." || s === "")) return false;
  return path.startsWith("conformance/baselines/");
}

/** Throwing form of {@link isValidBaselinePath}. */
export function baselinePath(path: string): string {
  if (!isValidBaselinePath(path)) {
    throw new Error(
      `invalid baseline path "${path}": must be a normalized repo-relative path below conformance/baselines/`,
    );
  }
  return path;
}

// ---------------------------------------------------------------------------
// capabilityShapeDigest — IDs + normative shape ONLY
// ---------------------------------------------------------------------------

/**
 * A normative capability SHAPE — the reviewed structural identity a
 * `capabilityShapeDigest` locks. It carries the ID plus surface/capability,
 * field type, visibility/editability/persistence/container/order, constraints,
 * conditions, default references, modes and viewports. It EXCLUDES observed
 * paths, status, failures, screenshots and the current source SHA.
 *
 * `constraints.options` is a NORMATIVELY ORDERED array: its order is part of the
 * shape (a reorder is a different shape).
 */
export interface CapabilityShapeInput {
  id: string;
  surface: string;
  capability: string;
  contract: RequirementCapabilityContract | null;
}

/** Canonicalize ONE capability shape (path-aware). */
function canonicalCapabilityShape(shape: CapabilityShapeInput): unknown {
  return {
    id: shape.id,
    surface: shape.surface,
    capability: shape.capability,
    contract: canonicalContract(shape.contract),
  };
}

/**
 * Canonicalize a requirement contract. Options (and every other normatively
 * ordered array) keep their order; object keys are sorted by canonicalize().
 */
function canonicalContract(
  contract: RequirementCapabilityContract | null,
): unknown {
  if (contract === null) return null;
  if (contract.kind === "surface") {
    return {
      kind: "surface",
      modes: [...contract.modes],
      viewports: [...contract.viewports],
    };
  }
  return {
    kind: "field",
    fieldType: contract.fieldType,
    visibility: contract.visibility,
    editable: contract.editable,
    persisted: contract.persisted,
    container: contract.container,
    order: contract.order,
    // defaults + constraints.options are ORDERED — preserved verbatim.
    defaults: contract.defaults.map((d) => ({ ...d })),
    constraints: {
      ...contract.constraints,
      options: contract.constraints.options
        ? contract.constraints.options.map((o) => ({ ...o }))
        : undefined,
    },
    condition: contract.condition,
    modes: [...contract.modes],
    viewports: [...contract.viewports],
  };
}

/**
 * Hash the sorted-by-id capability shapes. Two runs with the same shapes in any
 * ID order hash identically; a normative option/constraint/default/condition/
 * order change churns; an observed-path/status/SHA change does NOT (they are not
 * present in the shape input).
 */
export function capabilityShapeDigest(
  shapes: readonly CapabilityShapeInput[],
): `sha256:${string}` {
  const ordered = [...shapes]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(canonicalCapabilityShape);
  return sha256(canonicalStringify(ordered));
}

// ---------------------------------------------------------------------------
// caseSetDigest — selected tier scenarios/cases ONLY
// ---------------------------------------------------------------------------

/**
 * A selected tier's case-set input: scenario IDs/order/role/value/assignments/
 * validity plus the expected case mode/viewport/effect. Observations/evidence
 * are EXCLUDED. Future-tier cases stay in the full requirements digest but are
 * not part of a captured structural case set.
 */
export interface CaseSetScenarioInput {
  capabilityId: string;
  scenario: ScenarioDefinition;
  expected: {
    modes: PreviewMode[];
    viewports: ViewportName[];
    effect: CapabilityCaseResult["expectedEffect"];
  };
}

function canonicalCaseScenario(input: CaseSetScenarioInput): unknown {
  const s = input.scenario;
  return {
    capabilityId: input.capabilityId,
    scenario: {
      id: s.id,
      order: s.order,
      role: s.role,
      value: s.value,
      assignments: s.assignments ?? null,
      validity: s.validity,
    },
    expected: {
      modes: [...input.expected.modes].sort(),
      viewports: [...input.expected.viewports].sort(),
      effect: input.expected.effect,
    },
  };
}

/**
 * Hash the selected tier's case set. Ordered by `(capabilityId, order, scenarioId)`
 * so it is stable regardless of collection order, yet a scenario `order`/`value`/
 * expected-`effect` change churns it.
 */
export function caseSetDigest(
  scenarios: readonly CaseSetScenarioInput[],
): `sha256:${string}` {
  const ordered = [...scenarios]
    .sort((a, b) => {
      if (a.capabilityId !== b.capabilityId)
        return a.capabilityId < b.capabilityId ? -1 : 1;
      if (a.scenario.order !== b.scenario.order)
        return a.scenario.order - b.scenario.order;
      return a.scenario.id < b.scenario.id
        ? -1
        : a.scenario.id > b.scenario.id
          ? 1
          : 0;
    })
    .map(canonicalCaseScenario);
  return sha256(canonicalStringify(ordered));
}

// ---------------------------------------------------------------------------
// requirementsDigest / findingsDigest
// ---------------------------------------------------------------------------

/**
 * `requirementsDigest` is the SHA-256 of the EXACT reviewed requirements bytes.
 * The caller supplies the exact tracked file bytes so a whitespace change churns.
 */
export function requirementsDigest(
  reviewedRequirementsBytes: Buffer,
): `sha256:${string}` {
  return digestBytes(reviewedRequirementsBytes);
}

/** `findingsDigest` hashes the selected tier's `(id,fingerprint)`-sorted findings. */
export function findingsDigest(
  findings: readonly TieredGateFinding[],
): `sha256:${string}` {
  const ordered = orderFindings(findings).map((f) => ({
    id: f.id,
    fingerprint: f.fingerprint,
    tier: f.tier,
  }));
  return sha256(canonicalStringify(ordered));
}

// ---------------------------------------------------------------------------
// baselineDigest — exact canonical TierBaseline bytes
// ---------------------------------------------------------------------------

/** Canonicalize a `TierBaseline` (path-aware): findings/requirements ordered. */
export function canonicalTierBaseline(baseline: TierBaseline): unknown {
  return {
    schemaVersion: baseline.schemaVersion,
    theme: baseline.theme,
    tier: baseline.tier,
    parentBaselineDigest: baseline.parentBaselineDigest,
    requirements: orderFindings(baseline.requirements).map((f) => ({
      id: f.id,
      fingerprint: f.fingerprint,
    })),
    findings: orderFindings(baseline.findings).map((f) => ({
      id: f.id,
      fingerprint: f.fingerprint,
      tier: f.tier,
    })),
    capabilityShapeDigest: baseline.capabilityShapeDigest,
    caseSetDigest: baseline.caseSetDigest,
  };
}

/** Serialize the EXACT canonical `TierBaseline` bytes (pretty, deterministic). */
export function serializeTierBaseline(baseline: TierBaseline): Buffer {
  return Buffer.from(
    JSON.stringify(canonicalize(canonicalTierBaseline(baseline)), null, 2) +
      "\n",
    "utf8",
  );
}

/** `baselineDigest` hashes the EXACT canonical `TierBaseline` bytes. */
export function baselineDigest(baseline: TierBaseline): `sha256:${string}` {
  return digestBytes(serializeTierBaseline(baseline));
}

// ---------------------------------------------------------------------------
// captureTreeDigest — SHA-256 of raw `git ls-tree` bytes
// ---------------------------------------------------------------------------

/**
 * `captureTreeDigest` is the SHA-256 of the RAW bytes produced by
 * `git ls-tree -r -z --full-tree <captureSourceRef>`. The caller runs git and
 * passes the exact stdout bytes; this keeps the module hermetic (no child
 * process here) while pinning the exact algorithm.
 */
export function captureTreeDigest(lsTreeBytes: Buffer): `sha256:${string}` {
  return digestBytes(lsTreeBytes);
}

// ---------------------------------------------------------------------------
// captureReviewDigest — the reviewed candidate envelope
// ---------------------------------------------------------------------------

/**
 * The reviewed candidate envelope. Its canonical bytes are hashed to
 * `captureReviewDigest`. Keys are exactly (in any order — canonicalize sorts
 * them): schemaVersion, theme, tier, sourceDigest, candidateInventoryDigest,
 * requirementsDigest, capabilityShapeDigest, caseSetDigest, findingsDigest,
 * semanticRevisionDigest, parentBaselineDigest, parentManifestDigest.
 *
 * Mutating any single field changes the digest; object-key order alone must not.
 */
export interface TierReviewEnvelope {
  schemaVersion: 1;
  theme: string;
  tier: ConformanceTier;
  sourceDigest: `sha256:${string}`;
  candidateInventoryDigest: `sha256:${string}`;
  requirementsDigest: `sha256:${string}`;
  capabilityShapeDigest: `sha256:${string}`;
  caseSetDigest: `sha256:${string}`;
  findingsDigest: `sha256:${string}`;
  semanticRevisionDigest: `sha256:${string}` | null;
  parentBaselineDigest: `sha256:${string}` | null;
  parentManifestDigest: `sha256:${string}` | null;
}

const REVIEW_ENVELOPE_KEYS = [
  "schemaVersion",
  "theme",
  "tier",
  "sourceDigest",
  "candidateInventoryDigest",
  "requirementsDigest",
  "capabilityShapeDigest",
  "caseSetDigest",
  "findingsDigest",
  "semanticRevisionDigest",
  "parentBaselineDigest",
  "parentManifestDigest",
] as const;

/** Build the canonical review envelope with EXACTLY the reviewed keys. */
export function buildTierReviewEnvelope(
  input: TierReviewEnvelope,
): TierReviewEnvelope {
  const src = input as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of REVIEW_ENVELOPE_KEYS) {
    out[key] = src[key];
  }
  return out as unknown as TierReviewEnvelope;
}

/** `captureReviewDigest` hashes the canonical review envelope bytes. */
export function computeTierReviewDigest(
  envelope: TierReviewEnvelope,
): `sha256:${string}` {
  return sha256(canonicalStringify(buildTierReviewEnvelope(envelope)));
}

// ---------------------------------------------------------------------------
// Manifest serialization + digest
// ---------------------------------------------------------------------------

const TIER_ORDER: readonly ConformanceTier[] = [
  "structural",
  "authoring",
  "effect",
  "browser",
];

/** Canonicalize a manifest (tiers emitted in the fixed structural→browser order). */
export function canonicalManifest(manifest: ThemeBaselineManifest): unknown {
  const tiers: Record<string, unknown> = {};
  for (const tier of TIER_ORDER) {
    const entry = manifest.tiers[tier];
    if (entry) tiers[tier] = { ...entry };
  }
  return {
    schemaVersion: manifest.schemaVersion,
    theme: manifest.theme,
    parentManifestDigest: manifest.parentManifestDigest,
    tiers,
  };
}

/** Serialize the EXACT canonical manifest bytes (pretty, deterministic). */
export function serializeManifest(manifest: ThemeBaselineManifest): Buffer {
  return Buffer.from(
    JSON.stringify(canonicalize(canonicalManifest(manifest)), null, 2) + "\n",
    "utf8",
  );
}

/** Hash the EXACT canonical manifest bytes — used for `parentManifestDigest`. */
export function manifestDigest(
  manifest: ThemeBaselineManifest,
): `sha256:${string}` {
  return digestBytes(serializeManifest(manifest));
}

// ---------------------------------------------------------------------------
// Utility: normative source list (for revision proofs)
// ---------------------------------------------------------------------------

/** Order requirement sources by `(kind,ref)` (used by the revision validators). */
export function orderRequirementSources(
  sources: readonly RequirementSource[],
): RequirementSource[] {
  return orderSources(sources);
}
