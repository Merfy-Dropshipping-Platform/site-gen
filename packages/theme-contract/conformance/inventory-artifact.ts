/**
 * The tracked inventory artifact and the review-digest transaction envelope.
 *
 * The gate persists exactly two artifacts (the tracked inventory JSON and the
 * baseline). Their byte-identity is the source of trust: `inventoryDigest` is the
 * SHA-256 of the EXACT serialized candidate inventory bytes, and `reviewDigest`
 * is the SHA-256 of a canonical review envelope that binds the schema/generator
 * version, theme, `sourceDigest`, `inventoryDigest`, the sorted requirement locks,
 * the sorted findings and the parent-baseline link. Recomputing `reviewDigest`
 * while reading a baseline must reproduce the stored value; any tampering with the
 * stored inventory/source/finding/requirement bytes breaks the recompute.
 *
 * Serialization is deterministic and timestamp-free: object keys are sorted deep,
 * arrays that are semantically unordered (capabilities, issues, findings,
 * requirements) are sorted by id, and no wall-clock value is ever written. This
 * module imports nothing from the site-gen runtime.
 */

import { createHash } from 'node:crypto';

import type {
  BaselineFinding,
  CapabilityRecord,
  StructuralBaseline,
  StructuralIssue,
} from './types';

// ---------------------------------------------------------------------------
// canonical JSON
// ---------------------------------------------------------------------------

/**
 * Deterministic JSON: object keys sorted deeply, ARRAY ORDER PRESERVED (callers
 * pre-sort semantically-unordered arrays). `undefined` fields are dropped.
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

function sha256(input: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(input).digest('hex')}`;
}

/** SHA-256 over raw BYTES (so images/fonts and exact serialized inventory work). */
export function digestBytes(bytes: Buffer): `sha256:${string}` {
  return sha256(bytes);
}

// ---------------------------------------------------------------------------
// sorting helpers (semantically-unordered id arrays)
// ---------------------------------------------------------------------------

function byId<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function byIdFingerprint(items: readonly BaselineFinding[]): BaselineFinding[] {
  return [...items].sort((a, b) => {
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    if (a.fingerprint !== b.fingerprint) return a.fingerprint < b.fingerprint ? -1 : 1;
    return 0;
  });
}

// ---------------------------------------------------------------------------
// candidate inventory
// ---------------------------------------------------------------------------

export interface CandidateInventory {
  schemaVersion: 1;
  generatorVersion: string;
  theme: string;
  sourceDigest: `sha256:${string}`;
  capabilities: CapabilityRecord[];
  structuralIssues: StructuralIssue[];
  findings: BaselineFinding[];
  requirements: BaselineFinding[];
}

/**
 * Serialize the EXACT candidate inventory bytes. This is the single source of the
 * `inventoryDigest`; the tracked file on disk must be byte-for-byte this Buffer.
 */
export function serializeInventory(inv: CandidateInventory): Buffer {
  const canonical = {
    schemaVersion: inv.schemaVersion,
    generatorVersion: inv.generatorVersion,
    theme: inv.theme,
    sourceDigest: inv.sourceDigest,
    capabilities: byId(inv.capabilities),
    structuralIssues: byId(inv.structuralIssues),
    findings: byIdFingerprint(inv.findings),
    requirements: byIdFingerprint(inv.requirements),
  };
  // Pretty-print for a readable tracked artifact; canonicalize() already sorted
  // keys deeply so the bytes are deterministic.
  return Buffer.from(JSON.stringify(canonicalize(canonical), null, 2) + '\n', 'utf8');
}

export function computeInventoryDigest(bytes: Buffer): `sha256:${string}` {
  return digestBytes(bytes);
}

// ---------------------------------------------------------------------------
// review envelope + reviewDigest (the transaction commit identity)
// ---------------------------------------------------------------------------

export interface ReviewEnvelopeInput {
  schemaVersion: 1;
  generatorVersion: string;
  theme: string;
  sourceDigest: `sha256:${string}`;
  inventoryDigest: `sha256:${string}`;
  requirements: BaselineFinding[];
  findings: BaselineFinding[];
  parentBaselineDigest: `sha256:${string}` | null;
}

export interface ReviewEnvelope {
  schemaVersion: 1;
  generatorVersion: string;
  theme: string;
  sourceDigest: `sha256:${string}`;
  inventoryDigest: `sha256:${string}`;
  requirements: BaselineFinding[];
  findings: BaselineFinding[];
  parentBaselineDigest: `sha256:${string}` | null;
}

/**
 * The canonical review envelope: schema/generator version, theme, sourceDigest,
 * inventoryDigest, SORTED requirement locks, SORTED findings and the parent link.
 * Lock/finding order is irrelevant, so both are sorted; digest inputs are not.
 */
export function buildReviewEnvelope(input: ReviewEnvelopeInput): ReviewEnvelope {
  return {
    schemaVersion: input.schemaVersion,
    generatorVersion: input.generatorVersion,
    theme: input.theme,
    sourceDigest: input.sourceDigest,
    inventoryDigest: input.inventoryDigest,
    requirements: byIdFingerprint(input.requirements),
    findings: byIdFingerprint(input.findings),
    parentBaselineDigest: input.parentBaselineDigest,
  };
}

export function computeReviewDigest(envelope: ReviewEnvelope): `sha256:${string}` {
  return sha256(canonicalStringify(envelope));
}

/**
 * Recompute `reviewDigest` purely from the STORED baseline bytes. Because the
 * envelope binds the stored inventoryDigest/sourceDigest/requirements/findings/
 * parent link, tampering with any of those breaks the recompute — this is how
 * normal/release mode verifies that neither tracked file was edited in isolation.
 */
export function recomputeReviewDigestFromBaseline(
  baseline: StructuralBaseline,
  ctx: { schemaVersion: 1; generatorVersion: string },
): `sha256:${string}` {
  const envelope = buildReviewEnvelope({
    schemaVersion: ctx.schemaVersion,
    generatorVersion: ctx.generatorVersion,
    theme: baseline.theme,
    sourceDigest: baseline.sourceDigest,
    inventoryDigest: baseline.inventoryDigest,
    requirements: baseline.requirements,
    findings: baseline.findings,
    parentBaselineDigest: baseline.parentBaselineDigest,
  });
  return computeReviewDigest(envelope);
}
