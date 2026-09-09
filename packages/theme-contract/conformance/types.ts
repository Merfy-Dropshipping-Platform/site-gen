/**
 * Canonical capability model for theme structural conformance.
 *
 * This module is the single source of the machine-readable capability schema
 * consumed by the site-gen conformance adapter and the fingerprinted ratchet.
 * It contains TYPES ONLY; ID/aggregation helpers live in `./ids`.
 *
 * The schema is intentionally forward-compatible: Plan 2 adds observable-effect
 * evidence via `CapabilityCaseResult` without changing capability IDs or the
 * reviewed baseline schema.
 */

export type CapabilityStatus = 'PASS' | 'GAP' | 'UNKNOWN' | 'NEEDS_DECISION';

export type PreviewMode = 'hot-preview' | 'initial-preview' | 'live';

export type ViewportName = 'desktop' | 'mobile';

export type FieldPresence =
  | 'runtime-authoring'
  | 'resolved-raw'
  | 'physical-raw';

export interface FieldConstraints {
  min?: number;
  max?: number;
  step?: number;
  maxItems?: number;
  maxInstances?: number | null;
  options?: Array<{ label?: string; value: unknown }>;
  manifest?: Record<string, unknown>;
}

export interface DefaultReference {
  source: 'puck' | 'physical-puck' | 'theme' | 'effective' | 'array-item';
  /** concrete JSON pointer, arrays use /0/ */
  pointer: string;
  /** reusable pointer, arrays use /*\/ */
  normalizedPointer: string;
  state: 'value' | 'explicit-undefined';
  value?: unknown;
}

export interface CapabilityCaseResult {
  scenarioId: string;
  value: unknown;
  mode: PreviewMode;
  viewport: ViewportName;
  expectedEffect: {
    kind:
      | 'dom-attribute'
      | 'dom-text'
      | 'computed-style'
      | 'visibility'
      | 'count'
      | 'url'
      | 'storage'
      | 'event'
      | 'network'
      | 'screenshot'
      | 'custom';
    target: string;
    property?: string;
    comparator: 'equals' | 'contains' | 'matches' | 'changes' | 'not-equals';
    expected: unknown;
  };
  observed?: { value: unknown; notes?: string };
  status: CapabilityStatus;
  evidenceRefs: string[];
  artifactRefs: string[];
  failureIds: string[];
}

export interface ScenarioDefinition {
  id: string;
  /** zero-based semantic order within one capability */
  order: number;
  role:
    | 'empty'
    | 'false'
    | 'true'
    | 'option'
    | 'min'
    | 'default'
    | 'max'
    | 'step'
    | 'array-count'
    | 'condition-on'
    | 'condition-off'
    | 'color-scheme'
    | 'a'
    | 'b'
    | 'invalid-boundary';
  value: unknown;
  /** conditional/multi-field setup */
  assignments?: Record<string, unknown>;
  validity: 'expected-valid' | 'expected-invalid';
}

export interface CapabilityRecord {
  id: string;
  theme: string;
  surface: 'theme-setting' | 'page' | 'block' | 'section' | 'flow';
  capability: string;
  fieldType?: string;
  label?: string;
  defaultValue?: unknown;
  visibility?:
    | 'main-panel'
    | 'focused-panel'
    | 'array-item-panel'
    | 'hidden'
    | 'decorative';
  editable?: boolean;
  persisted?: boolean;
  container?: 'leaf' | 'object' | 'array' | 'decorative';
  presence?: FieldPresence[];
  /** zero-based sibling order; output sorting must not erase it */
  order?: number;
  constraints?: FieldConstraints;
  conditionTargetId?: string;
  conditionEquals?: unknown;
  defaults?: DefaultReference[];
  scenarios: ScenarioDefinition[];
  modes: PreviewMode[];
  viewports: ViewportName[];
  caseResults?: CapabilityCaseResult[];
  sources: Array<{ kind: string; ref: string }>;
  status: CapabilityStatus;
  failureIds: string[];
}

export interface StructuralIssue {
  id: string;
  theme: string;
  status: Exclude<CapabilityStatus, 'PASS'>;
  expectedCode: string;
  observedCode: string;
  /** redacted deterministic facts only */
  canonicalFacts: Record<string, unknown>;
  detail: string;
  sources: Array<{ kind: string; ref: string }>;
}

export interface BaselineFinding {
  id: string;
  fingerprint: `sha256:${string}`;
}

export interface RequirementSource {
  kind: 'user' | 'figma' | 'project-doc';
  ref: string;
}

export interface RequirementExpectedCase {
  scenarioId: string;
  modes: PreviewMode[];
  viewports: ViewportName[];
  effect: CapabilityCaseResult['expectedEffect'];
}

export type RequirementCapabilityContract =
  | {
      kind: 'field';
      fieldType: string;
      visibility: NonNullable<CapabilityRecord['visibility']>;
      editable: boolean;
      persisted: boolean;
      container: NonNullable<CapabilityRecord['container']>;
      order: number;
      /** empty only when the field truly has no default */
      defaults: DefaultReference[];
      /** explicit empty object when unconstrained */
      constraints: FieldConstraints;
      condition: { targetId: string; equals: unknown } | null;
      modes: PreviewMode[];
      viewports: ViewportName[];
    }
  | {
      kind: 'surface';
      modes: PreviewMode[];
      viewports: ViewportName[];
    };

export interface RequirementRecord {
  /** exact capability ID required from code/runtime */
  id: string;
  /** one ID may be confirmed by both user and Figma */
  sources: RequirementSource[];
  required: true;
  label: string;
  contract: RequirementCapabilityContract | null;
  /** reviewed normative values/states */
  scenarios?: ScenarioDefinition[];
  expectedCases?: RequirementExpectedCase[];
}

export interface StructuralBaseline {
  schemaVersion: 1;
  theme: string;
  reviewDigest: `sha256:${string}`;
  inventoryDigest: `sha256:${string}`;
  sourceDigest: `sha256:${string}`;
  parentBaselineDigest: `sha256:${string}` | null;
  requirements: BaselineFinding[];
  findings: BaselineFinding[];
}

// ---------------------------------------------------------------------------
// Tier routing (Task 3)
//
// A tiered theme (Satin) separates STRUCTURAL conformance (source/contract
// shape, deterministic on disk) from behavior tiers that a later plan will
// execute: AUTHORING (constructor field wiring), EFFECT (rendered output) and
// BROWSER (Playwright). Only the structural tier may enter the tracked
// `<theme>.structural.json` baseline; authoring/effect/browser rows stay in the
// inventory/report as UNKNOWN until their runner lands.
//
// These are EXPLICIT tiered variants of the legacy records — the plan forbids
// bolting an optional `tier` onto the legacy Bloom records (that would let a
// future behavior UNKNOWN silently pollute a structural finding set). A selector
// (`collectTierGateFindings`) filters a single tier's issues/cases so a future
// UNKNOWN never baselines as structural debt.
// ---------------------------------------------------------------------------

export type ConformanceTier =
  | 'structural'
  | 'authoring'
  | 'effect'
  | 'browser';

/** A capability case result carrying the tier it was produced for. */
export interface TieredCapabilityCaseResult extends CapabilityCaseResult {
  tier: ConformanceTier;
}

/**
 * A tiered capability record. It replaces the legacy single-status view with a
 * per-tier status map; `requiredTiers` names the tiers this capability MUST
 * report (a missing `tierStatuses[tier]` for a required tier is a harness
 * failure). Case results are tier-tagged so the selector can filter them.
 */
export interface TieredCapabilityRecord
  extends Omit<CapabilityRecord, 'caseResults'> {
  requiredTiers: readonly ConformanceTier[];
  tierStatuses: Partial<Record<ConformanceTier, CapabilityStatus>>;
  caseResults?: TieredCapabilityCaseResult[];
}

/** A requirement expected-case carrying its tier. */
export interface TieredRequirementExpectedCase
  extends RequirementExpectedCase {
  tier: ConformanceTier;
}

/** A tiered requirement record (expected cases are tier-tagged). */
export interface TieredRequirementRecord
  extends Omit<RequirementRecord, 'expectedCases'> {
  expectedCases?: TieredRequirementExpectedCase[];
}

/** A structural issue is, by construction, always in the structural tier. */
export interface TieredStructuralIssue extends StructuralIssue {
  tier: 'structural';
}

/** A gate finding carrying the tier it was collected for. */
export interface TieredGateFinding extends BaselineFinding {
  tier: ConformanceTier;
}
