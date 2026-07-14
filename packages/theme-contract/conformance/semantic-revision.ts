/**
 * Reviewed semantic-revision ledger (Task 4).
 *
 * An initial reviewed requirement may declare `contract: null` (a capability the
 * user requires open but whose reviewed scenarios/expected cases are not yet
 * decided). This module is the ONLY append-only route by which such a `null`
 * contract later gains its reviewed scenarios/cases WITHOUT making undeclared
 * growth legal.
 *
 * The tracked ledger lives at `conformance/requirements/satin.revisions.json`.
 * Its initial value is `{ schemaVersion: 1, theme: "satin", revisions: [] }`.
 * Each revision entry:
 *  - hashes its EXACT canonical entry bytes → the entry digest;
 *  - has `parentRevisionDigest === null` for the first entry and, for every
 *    later entry, the PRECEDING entry's digest;
 *  - the manifest's `semanticRevisionDigest` hashes the COMPLETE canonical ledger
 *    PREFIX through the selected entry (not merely the latest entry), so editing,
 *    reordering or deleting any historical entry breaks the chain and can never
 *    pass as an inventory/source-only refresh.
 *
 * `--revise-semantic-baseline` requires (validated here as pure functions):
 *  - strict-superset `added{Requirement,Capability,Case}Ids` (sorted, unique);
 *  - a new user/Figma/product source for each changed meaning;
 *  - no existing requirement/capability/case ID deleted or renamed;
 *  - unrelated findings byte-identical; only the changed requirement IDs may move
 *    findings, and those are listed explicitly.
 *
 * This module imports nothing from the site-gen runtime and reads no clock.
 */

import { createHash } from "node:crypto";

import type { RequirementSource } from "./types";
import { canonicalStringify } from "./tier-baseline";

// ---------------------------------------------------------------------------
// Public ledger types
// ---------------------------------------------------------------------------

export interface SemanticRequirementChange {
  id: string;
  beforeFingerprint: `sha256:${string}`;
  afterFingerprint: `sha256:${string}`;
  decisionSources: RequirementSource[];
}

export interface SemanticRequirementRevision {
  id: string;
  parentRevisionDigest: `sha256:${string}` | null;
  parentRequirementsDigest: `sha256:${string}`;
  nextRequirementsDigest: `sha256:${string}`;
  addedRequirementIds: readonly string[];
  addedCapabilityIds: readonly string[];
  addedCaseIds: readonly string[];
  changes: readonly SemanticRequirementChange[];
}

export interface SemanticRevisionLedger {
  schemaVersion: 1;
  theme: "satin";
  revisions: SemanticRequirementRevision[];
}

/** The canonical empty ledger. */
export function initialLedger(): SemanticRevisionLedger {
  return { schemaVersion: 1, theme: "satin", revisions: [] };
}

// ---------------------------------------------------------------------------
// Canonical entry + digest
// ---------------------------------------------------------------------------

function sha256(input: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(input, "utf8").digest("hex")}`;
}

/** Order requirement sources by `(kind,ref)` for a change's decision sources. */
function orderSources(
  sources: readonly RequirementSource[],
): RequirementSource[] {
  return [...sources].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    if (a.ref !== b.ref) return a.ref < b.ref ? -1 : 1;
    return 0;
  });
}

/**
 * Canonicalize ONE revision entry (path-aware): `added*Ids` are sorted-unique,
 * changes are ordered by id and each change's decision sources are ordered.
 */
export function canonicalRevisionEntry(
  entry: SemanticRequirementRevision,
): unknown {
  return {
    id: entry.id,
    parentRevisionDigest: entry.parentRevisionDigest,
    parentRequirementsDigest: entry.parentRequirementsDigest,
    nextRequirementsDigest: entry.nextRequirementsDigest,
    addedRequirementIds: sortedUnique(entry.addedRequirementIds),
    addedCapabilityIds: sortedUnique(entry.addedCapabilityIds),
    addedCaseIds: sortedUnique(entry.addedCaseIds),
    changes: [...entry.changes]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((c) => ({
        id: c.id,
        beforeFingerprint: c.beforeFingerprint,
        afterFingerprint: c.afterFingerprint,
        decisionSources: orderSources(c.decisionSources),
      })),
  };
}

/** The entry digest hashes the EXACT canonical entry bytes. */
export function revisionEntryDigest(
  entry: SemanticRequirementRevision,
): `sha256:${string}` {
  return sha256(canonicalStringify(canonicalRevisionEntry(entry)));
}

/**
 * `semanticRevisionDigest` hashes the COMPLETE canonical ledger PREFIX through
 * the entry at `throughIndex` (inclusive). The prefix carries the ledger header
 * plus every entry up to and including the selected one, so any historical edit/
 * reorder/delete churns it.
 */
export function semanticRevisionDigest(
  ledger: SemanticRevisionLedger,
  throughIndex: number,
): `sha256:${string}` {
  if (throughIndex < 0 || throughIndex >= ledger.revisions.length) {
    throw new Error(
      `semanticRevisionDigest: index ${throughIndex} out of range [0, ${ledger.revisions.length})`,
    );
  }
  const prefix = {
    schemaVersion: ledger.schemaVersion,
    theme: ledger.theme,
    revisions: ledger.revisions
      .slice(0, throughIndex + 1)
      .map(canonicalRevisionEntry),
  };
  return sha256(canonicalStringify(prefix));
}

/** The cumulative prefix digest through the LAST entry (or null on empty). */
export function latestSemanticRevisionDigest(
  ledger: SemanticRevisionLedger,
): `sha256:${string}` | null {
  if (ledger.revisions.length === 0) return null;
  return semanticRevisionDigest(ledger, ledger.revisions.length - 1);
}

function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

// ---------------------------------------------------------------------------
// Chain validation (normal mode)
// ---------------------------------------------------------------------------

export interface ChainValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Recompute every revision-entry digest, verify the parent chain (first is null;
 * each later `parentRevisionDigest` equals the preceding entry digest) and prove
 * the ledger contains no reordered/edited/deleted historical entry. Normal mode,
 * inventory-refresh and semantic-revision ALL run this; a broken chain fails all
 * three.
 */
export function validateRevisionChain(
  ledger: SemanticRevisionLedger,
): ChainValidation {
  let previousDigest: `sha256:${string}` | null = null;
  const seenIds = new Set<string>();
  for (let i = 0; i < ledger.revisions.length; i += 1) {
    const entry = ledger.revisions[i];
    if (seenIds.has(entry.id)) {
      return { ok: false, reason: `duplicate revision id "${entry.id}"` };
    }
    seenIds.add(entry.id);
    if (entry.parentRevisionDigest !== previousDigest) {
      return {
        ok: false,
        reason:
          i === 0
            ? "first revision must have a null parentRevisionDigest"
            : `revision "${entry.id}" parentRevisionDigest does not match the preceding entry digest`,
      };
    }
    // The next entry's parentRequirementsDigest must equal this entry's
    // nextRequirementsDigest (a contiguous requirements chain).
    const next = ledger.revisions[i + 1];
    if (
      next &&
      next.parentRequirementsDigest !== entry.nextRequirementsDigest
    ) {
      return {
        ok: false,
        reason: `revision "${next.id}" parentRequirementsDigest does not chain from "${entry.id}"`,
      };
    }
    previousDigest = revisionEntryDigest(entry);
  }
  return { ok: true };
}

/**
 * Verify that the manifest's stored `semanticRevisionDigest` equals the ledger's
 * cumulative-prefix digest through the manifest's latest reviewed revision.
 * `manifestDigest` is `null` before the first revision — then the ledger must be
 * empty for a match.
 */
export function manifestMatchesLedger(
  ledger: SemanticRevisionLedger,
  manifestSemanticRevisionDigest: `sha256:${string}` | null,
): ChainValidation {
  const chain = validateRevisionChain(ledger);
  if (!chain.ok) return chain;
  const latest = latestSemanticRevisionDigest(ledger);
  if (manifestSemanticRevisionDigest !== latest) {
    return {
      ok: false,
      reason:
        "manifest semanticRevisionDigest does not equal the cumulative ledger prefix digest",
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Revision proposal validation (--revise-semantic-baseline)
// ---------------------------------------------------------------------------

/** A requirement's `(id → fingerprint)` and its normative source list. */
export interface RequirementSnapshotEntry {
  id: string;
  fingerprint: `sha256:${string}`;
  sources: readonly RequirementSource[];
}

export interface RevisionProposalInput {
  /** the reviewed OLD requirements (id → fingerprint + sources). */
  oldRequirements: readonly RequirementSnapshotEntry[];
  /** the reviewed NEW requirements (id → fingerprint + sources). */
  newRequirements: readonly RequirementSnapshotEntry[];
  /** old capability IDs (from the old inventory shape). */
  oldCapabilityIds: readonly string[];
  newCapabilityIds: readonly string[];
  /** old case IDs (selected tier scenario ids). */
  oldCaseIds: readonly string[];
  newCaseIds: readonly string[];
  /** the proposed ledger entry being appended. */
  entry: SemanticRequirementRevision;
  /** findings under the OLD baseline (id,fingerprint). */
  oldFindings: readonly { id: string; fingerprint: string }[];
  /** findings under the NEW candidate (id,fingerprint). */
  newFindings: readonly { id: string; fingerprint: string }[];
}

export interface RevisionValidation {
  ok: boolean;
  reason?: string;
  /** the exact finding IDs allowed to move because of a changed requirement. */
  allowedFindingChangeIds?: string[];
}

/**
 * Validate a proposed semantic revision against the exact ledger rules. Pure —
 * no I/O, no clock. The CLI layers CI/dirty/ACK/review-digest/change-set-digest
 * gates around this.
 */
export function validateSemanticRevision(
  input: RevisionProposalInput,
): RevisionValidation {
  const {
    oldRequirements,
    newRequirements,
    oldCapabilityIds,
    newCapabilityIds,
    oldCaseIds,
    newCaseIds,
    entry,
    oldFindings,
    newFindings,
  } = input;

  const oldReqById = new Map(oldRequirements.map((r) => [r.id, r]));
  const newReqById = new Map(newRequirements.map((r) => [r.id, r]));

  // 1) No existing requirement ID may be deleted or renamed → old IDs ⊆ new IDs.
  for (const r of oldRequirements) {
    if (!newReqById.has(r.id)) {
      return {
        ok: false,
        reason: `requirement "${r.id}" was deleted or renamed; forbidden`,
      };
    }
  }
  // capabilities + cases: old ⊆ new.
  if (!isSubset(oldCapabilityIds, newCapabilityIds)) {
    return {
      ok: false,
      reason: "a capability ID was deleted or renamed; forbidden",
    };
  }
  if (!isSubset(oldCaseIds, newCaseIds)) {
    return { ok: false, reason: "a case ID was deleted or renamed; forbidden" };
  }

  // 2) Strict-superset additions must EXACTLY equal the sorted-unique added arrays.
  const reqAdded = sortedUnique(
    diff(newReqIds(newRequirements), oldReqIds(oldRequirements)),
  );
  const capAdded = sortedUnique(diff(newCapabilityIds, oldCapabilityIds));
  const caseAdded = sortedUnique(diff(newCaseIds, oldCaseIds));
  if (!arraysEqual(reqAdded, sortedUnique(entry.addedRequirementIds))) {
    return {
      ok: false,
      reason:
        "addedRequirementIds does not exactly match the old→new requirement additions",
    };
  }
  if (!arraysEqual(capAdded, sortedUnique(entry.addedCapabilityIds))) {
    return {
      ok: false,
      reason:
        "addedCapabilityIds does not exactly match the old→new capability additions",
    };
  }
  if (!arraysEqual(caseAdded, sortedUnique(entry.addedCaseIds))) {
    return {
      ok: false,
      reason: "addedCaseIds does not exactly match the old→new case additions",
    };
  }

  // 3) Every declared change must match the actual old→new fingerprint diff, and
  //    carry at least one new user/figma/product source for the changed meaning.
  const changedByEntry = new Map(entry.changes.map((c) => [c.id, c]));
  const actuallyChanged: string[] = [];
  for (const oldR of oldRequirements) {
    const newR = newReqById.get(oldR.id);
    if (!newR) continue; // deletion caught above
    if (newR.fingerprint !== oldR.fingerprint) actuallyChanged.push(oldR.id);
  }
  // Every actual change must be declared; every declared change must be actual.
  if (
    !arraysEqual(
      sortedUnique(actuallyChanged),
      sortedUnique([...changedByEntry.keys()]),
    )
  ) {
    return {
      ok: false,
      reason:
        "the declared change set does not exactly match the old→new requirement fingerprint diff",
    };
  }
  for (const c of entry.changes) {
    const oldR = oldReqById.get(c.id);
    const newR = newReqById.get(c.id);
    if (!oldR || !newR) {
      return {
        ok: false,
        reason: `changed requirement "${c.id}" is missing from old or new set`,
      };
    }
    if (c.beforeFingerprint !== oldR.fingerprint) {
      return {
        ok: false,
        reason: `change "${c.id}" beforeFingerprint mismatch`,
      };
    }
    if (c.afterFingerprint !== newR.fingerprint) {
      return {
        ok: false,
        reason: `change "${c.id}" afterFingerprint mismatch`,
      };
    }
    // at least one NEW source (a source present in new-requirement sources but
    // not the old-requirement sources) for the changed meaning.
    const oldSrcKeys = new Set(oldR.sources.map(srcKey));
    const introduced = newR.sources.filter((s) => !oldSrcKeys.has(srcKey(s)));
    if (introduced.length === 0) {
      return {
        ok: false,
        reason: `change "${c.id}" introduces no new decision source for the changed meaning`,
      };
    }
    // the declared decisionSources must be a non-empty subset of the introduced
    // new sources (so a stale/old source cannot masquerade as a decision).
    if (c.decisionSources.length === 0) {
      return {
        ok: false,
        reason: `change "${c.id}" has no declared decisionSources`,
      };
    }
    const introducedKeys = new Set(introduced.map(srcKey));
    for (const ds of c.decisionSources) {
      if (!introducedKeys.has(srcKey(ds))) {
        return {
          ok: false,
          reason: `change "${c.id}" decisionSource ${srcKey(ds)} is not a newly introduced source`,
        };
      }
    }
  }

  // 4) Unrelated findings byte-identical. Only findings owned by a changed
  //    requirement ID may move; everything else must be unchanged.
  const changedReqIds = [...changedByEntry.keys()];
  const allowedFindingChangeIds = findingIdsOwnedBy(
    [...oldFindings, ...newFindings].map((f) => f.id),
    changedReqIds,
  );
  const allowed = new Set(allowedFindingChangeIds);
  const oldMap = new Map(oldFindings.map((f) => [f.id, f.fingerprint]));
  const newMap = new Map(newFindings.map((f) => [f.id, f.fingerprint]));
  const allIds = new Set([...oldMap.keys(), ...newMap.keys()]);
  for (const id of allIds) {
    if (allowed.has(id)) continue;
    if (oldMap.get(id) !== newMap.get(id)) {
      return {
        ok: false,
        reason: `unrelated finding "${id}" changed; only findings of the changed requirements may move`,
      };
    }
  }

  return { ok: true, allowedFindingChangeIds: [...allowed].sort() };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function srcKey(s: RequirementSource): string {
  return `${s.kind} ${s.ref}`;
}

function newReqIds(reqs: readonly RequirementSnapshotEntry[]): string[] {
  return reqs.map((r) => r.id);
}
function oldReqIds(reqs: readonly RequirementSnapshotEntry[]): string[] {
  return reqs.map((r) => r.id);
}

function isSubset(a: readonly string[], b: readonly string[]): boolean {
  const bs = new Set(b);
  return a.every((x) => bs.has(x));
}

function diff(a: readonly string[], b: readonly string[]): string[] {
  const bs = new Set(b);
  return a.filter((x) => !bs.has(x));
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** A finding is owned by a requirement/capability ID when the ID is a dotted
 *  prefix of the finding ID (or exactly equals it). */
function findingIdsOwnedBy(
  findingIds: readonly string[],
  ownerIds: readonly string[],
): string[] {
  const out = new Set<string>();
  for (const fid of findingIds) {
    for (const owner of ownerIds) {
      if (fid === owner || fid.startsWith(`${owner}.`)) {
        out.add(fid);
        break;
      }
    }
  }
  return [...out];
}
