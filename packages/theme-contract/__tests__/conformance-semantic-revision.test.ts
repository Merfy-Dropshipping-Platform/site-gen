/**
 * Task 4 — semantic-revision ledger.
 *
 * Pins the append-only ledger digest chain, the cumulative-prefix
 * `semanticRevisionDigest`, and the `--revise-semantic-baseline` proposal rules
 * (strict-superset additions, no ID deletion/rename, a new source per changed
 * meaning, unrelated findings byte-identical). Uses hand-built fixtures — no
 * theme build outputs — so it carries the `conformance-` prefix.
 */

import {
  initialLedger,
  revisionEntryDigest,
  semanticRevisionDigest,
  latestSemanticRevisionDigest,
  validateRevisionChain,
  manifestMatchesLedger,
  validateSemanticRevision,
  type SemanticRequirementRevision,
  type SemanticRevisionLedger,
  type RequirementSnapshotEntry,
  type RevisionProposalInput,
} from "../conformance";

const SHA = (n: number): `sha256:${string}` =>
  ("sha256:" + String(n).padStart(64, "0")) as `sha256:${string}`;

// A revision whose parent chain we can fill in incrementally.
function rev(
  id: string,
  parentRevisionDigest: `sha256:${string}` | null,
  over: Partial<SemanticRequirementRevision> = {},
): SemanticRequirementRevision {
  return {
    id,
    parentRevisionDigest,
    parentRequirementsDigest: SHA(1),
    nextRequirementsDigest: SHA(2),
    addedRequirementIds: [],
    addedCapabilityIds: [],
    addedCaseIds: [],
    changes: [],
    ...over,
  };
}

/** Build a valid N-entry ledger, wiring each parent digest to the previous. */
function buildLedger(count: number): SemanticRevisionLedger {
  const ledger = initialLedger();
  let parent: `sha256:${string}` | null = null;
  let parentReq: `sha256:${string}` = SHA(0);
  for (let i = 0; i < count; i += 1) {
    const entry = rev(`rev-${i}`, parent, {
      parentRequirementsDigest: parentReq,
      nextRequirementsDigest: SHA(100 + i),
    });
    ledger.revisions.push(entry);
    parent = revisionEntryDigest(entry);
    parentReq = entry.nextRequirementsDigest;
  }
  return ledger;
}

// ---------------------------------------------------------------------------

describe("initial ledger", () => {
  it("is the canonical empty ledger", () => {
    expect(initialLedger()).toEqual({
      schemaVersion: 1,
      theme: "satin",
      revisions: [],
    });
    expect(latestSemanticRevisionDigest(initialLedger())).toBeNull();
  });
});

describe("entry digest + cumulative prefix", () => {
  it("semanticRevisionDigest hashes the WHOLE prefix, not just the latest entry", () => {
    const ledger = buildLedger(2);
    const prefix0 = semanticRevisionDigest(ledger, 0);
    const prefix1 = semanticRevisionDigest(ledger, 1);
    expect(prefix0).not.toBe(prefix1);
    // Mutating the FIRST entry changes the prefix through the SECOND entry too.
    const mutated: SemanticRevisionLedger = {
      ...ledger,
      revisions: [
        { ...ledger.revisions[0], nextRequirementsDigest: SHA(999) },
        ledger.revisions[1],
      ],
    };
    expect(semanticRevisionDigest(mutated, 1)).not.toBe(prefix1);
  });

  it("latestSemanticRevisionDigest equals the full-prefix digest", () => {
    const ledger = buildLedger(3);
    expect(latestSemanticRevisionDigest(ledger)).toBe(
      semanticRevisionDigest(ledger, 2),
    );
  });
});

describe("validateRevisionChain", () => {
  it("accepts a well-formed chain", () => {
    expect(validateRevisionChain(buildLedger(3)).ok).toBe(true);
  });

  it("rejects a wrong first parent", () => {
    const ledger = buildLedger(1);
    ledger.revisions[0].parentRevisionDigest = SHA(7);
    expect(validateRevisionChain(ledger).ok).toBe(false);
  });

  it("rejects an edited historical entry (breaks the child parent link)", () => {
    const ledger = buildLedger(2);
    // Editing entry 0 changes its digest, so entry 1's parent no longer matches.
    ledger.revisions[0].nextRequirementsDigest = SHA(555);
    expect(validateRevisionChain(ledger).ok).toBe(false);
  });

  it("rejects a reordered ledger", () => {
    const ledger = buildLedger(2);
    ledger.revisions.reverse();
    expect(validateRevisionChain(ledger).ok).toBe(false);
  });

  it("rejects a deleted historical entry", () => {
    const ledger = buildLedger(3);
    ledger.revisions.splice(1, 1); // delete the middle entry
    expect(validateRevisionChain(ledger).ok).toBe(false);
  });

  it("rejects a duplicate revision id", () => {
    const ledger = buildLedger(1);
    ledger.revisions.push({ ...ledger.revisions[0] });
    expect(validateRevisionChain(ledger).ok).toBe(false);
  });
});

describe("manifestMatchesLedger", () => {
  it("null manifest digest requires an empty ledger", () => {
    expect(manifestMatchesLedger(initialLedger(), null).ok).toBe(true);
    expect(manifestMatchesLedger(buildLedger(1), null).ok).toBe(false);
  });
  it("matches the cumulative prefix through the latest entry", () => {
    const ledger = buildLedger(2);
    const latest = latestSemanticRevisionDigest(ledger);
    expect(manifestMatchesLedger(ledger, latest).ok).toBe(true);
    expect(manifestMatchesLedger(ledger, SHA(9)).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateSemanticRevision — the contract:null → reviewed contract route
// ---------------------------------------------------------------------------

const OLD_SRC = { kind: "user" as const, ref: "initial-open" };
const NEW_SRC = { kind: "figma" as const, ref: "figma-node-42" };

function reqEntry(
  id: string,
  fp: `sha256:${string}`,
  sources: RequirementSnapshotEntry["sources"],
): RequirementSnapshotEntry {
  return { id, fingerprint: fp, sources };
}

/** A base valid proposal: requirement `r1` gains a reviewed scenario + case. */
function baseProposal(
  over: Partial<RevisionProposalInput> = {},
): RevisionProposalInput {
  const oldRequirements = [reqEntry("r1", SHA(1), [OLD_SRC])];
  const newRequirements = [reqEntry("r1", SHA(2), [OLD_SRC, NEW_SRC])];
  const entry: SemanticRequirementRevision = {
    id: "rev-0",
    parentRevisionDigest: null,
    parentRequirementsDigest: SHA(10),
    nextRequirementsDigest: SHA(11),
    addedRequirementIds: [],
    addedCapabilityIds: [],
    addedCaseIds: ["r1.case.a"],
    changes: [
      {
        id: "r1",
        beforeFingerprint: SHA(1),
        afterFingerprint: SHA(2),
        decisionSources: [NEW_SRC],
      },
    ],
  };
  return {
    oldRequirements,
    newRequirements,
    oldCapabilityIds: ["r1"],
    newCapabilityIds: ["r1"],
    oldCaseIds: [],
    newCaseIds: ["r1.case.a"],
    entry,
    oldFindings: [],
    newFindings: [],
    ...over,
  };
}

describe("validateSemanticRevision — success", () => {
  it("accepts contract:null → reviewed with one declared case addition + new source", () => {
    const res = validateSemanticRevision(baseProposal());
    expect(res.ok).toBe(true);
  });
});

describe("validateSemanticRevision — rejects", () => {
  it("rejects an undeclared case addition (added arrays must match exactly)", () => {
    const p = baseProposal({ newCaseIds: ["r1.case.a", "r1.case.UNDECLARED"] });
    expect(validateSemanticRevision(p).ok).toBe(false);
  });

  it("rejects a change with no NEW decision source", () => {
    const p = baseProposal({
      newRequirements: [reqEntry("r1", SHA(2), [OLD_SRC])], // no new source added
    });
    expect(validateSemanticRevision(p).ok).toBe(false);
  });

  it("rejects a declared decisionSource that is not newly introduced", () => {
    const p = baseProposal();
    p.entry.changes[0].decisionSources = [OLD_SRC];
    expect(validateSemanticRevision(p).ok).toBe(false);
  });

  it("rejects a bad change-set (declared change does not match the fingerprint diff)", () => {
    const p = baseProposal();
    // declare a change to r1 but keep the new fingerprint equal to the old one.
    p.newRequirements = [reqEntry("r1", SHA(1), [OLD_SRC, NEW_SRC])];
    expect(validateSemanticRevision(p).ok).toBe(false);
  });

  it("rejects an ID deletion", () => {
    const p = baseProposal({
      oldRequirements: [
        reqEntry("r1", SHA(1), [OLD_SRC]),
        reqEntry("r2", SHA(3), [OLD_SRC]),
      ],
    });
    expect(validateSemanticRevision(p).ok).toBe(false);
  });

  it("rejects an ID rename (r1 → r1x is a delete + add, not allowed)", () => {
    const p = baseProposal({
      newRequirements: [reqEntry("r1x", SHA(2), [OLD_SRC, NEW_SRC])],
    });
    expect(validateSemanticRevision(p).ok).toBe(false);
  });

  it("rejects a capability ID deletion", () => {
    const p = baseProposal({
      oldCapabilityIds: ["r1", "r-extra"],
      newCapabilityIds: ["r1"],
    });
    expect(validateSemanticRevision(p).ok).toBe(false);
  });

  it("rejects an unrelated finding change", () => {
    const p = baseProposal({
      oldFindings: [{ id: "satin.other.status-open", fingerprint: SHA(1) }],
      newFindings: [{ id: "satin.other.status-open", fingerprint: SHA(9) }],
    });
    expect(validateSemanticRevision(p).ok).toBe(false);
  });

  it("ALLOWS a finding change owned by the changed requirement ID", () => {
    const p = baseProposal({
      oldFindings: [{ id: "r1.status-open", fingerprint: SHA(1) }],
      newFindings: [{ id: "r1.status-open", fingerprint: SHA(9) }],
    });
    const res = validateSemanticRevision(p);
    expect(res.ok).toBe(true);
    expect(res.allowedFindingChangeIds).toContain("r1.status-open");
  });
});

describe("two valid revisions then a historical mutation fails the chain", () => {
  it("after 2 revisions, mutating/reordering/deleting the first entry fails validateRevisionChain", () => {
    const ledger = buildLedger(2);
    expect(validateRevisionChain(ledger).ok).toBe(true);

    const mutated: SemanticRevisionLedger = {
      ...ledger,
      revisions: [
        { ...ledger.revisions[0], nextRequirementsDigest: SHA(777) },
        ledger.revisions[1],
      ],
    };
    expect(validateRevisionChain(mutated).ok).toBe(false);

    const reordered: SemanticRevisionLedger = {
      ...ledger,
      revisions: [...ledger.revisions].reverse(),
    };
    expect(validateRevisionChain(reordered).ok).toBe(false);

    const deleted: SemanticRevisionLedger = {
      ...ledger,
      revisions: [ledger.revisions[1]],
    };
    expect(validateRevisionChain(deleted).ok).toBe(false);

    // and the manifest→ledger match fails for all three.
    const latest = latestSemanticRevisionDigest(ledger);
    expect(manifestMatchesLedger(mutated, latest).ok).toBe(false);
    expect(manifestMatchesLedger(reordered, latest).ok).toBe(false);
    expect(manifestMatchesLedger(deleted, latest).ok).toBe(false);
  });
});
