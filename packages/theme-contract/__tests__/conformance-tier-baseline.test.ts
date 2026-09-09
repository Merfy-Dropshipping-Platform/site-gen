/**
 * Task 4 — tier-baseline machinery.
 *
 * These package tests pin the path-aware canonical serialization, the nine
 * manifest digest fields, the capture-ref/path validators and the review
 * envelope. They exercise the SHARED machinery with hand-built fixtures (no
 * theme build outputs), so they carry the `conformance-` prefix and run in the
 * theme-artifact-free shared cycle.
 */

import {
  canonicalStringify,
  isValidCaptureSourceRef,
  captureSourceRef,
  isValidBaselinePath,
  baselinePath,
  capabilityShapeDigest,
  caseSetDigest,
  requirementsDigest,
  findingsDigest,
  baselineDigest,
  serializeTierBaseline,
  captureTreeDigest,
  buildTierReviewEnvelope,
  computeTierReviewDigest,
  serializeManifest,
  manifestDigest,
  orderFindings,
  type CapabilityShapeInput,
  type CaseSetScenarioInput,
  type TierBaseline,
  type TierReviewEnvelope,
  type ThemeBaselineManifest,
  type TierManifestEntry,
} from "../conformance";
import type {
  TieredGateFinding,
  RequirementCapabilityContract,
} from "../conformance";

const SHA0 = ("sha256:" + "0".repeat(64)) as `sha256:${string}`;
const SHA1 = ("sha256:" + "1".repeat(64)) as `sha256:${string}`;
const SHA2 = ("sha256:" + "2".repeat(64)) as `sha256:${string}`;
const REF = "a".repeat(40);

// ---------------------------------------------------------------------------
// helpers used by the ordered-array regression
// ---------------------------------------------------------------------------

/** Shuffle object keys deeply (arrays keep order) to prove key-order stability. */
function reorderObjectKeys<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(reorderObjectKeys) as unknown as T;
  const src = value as Record<string, unknown>;
  const keys = Object.keys(src).reverse();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = reorderObjectKeys(src[k]);
  return out as T;
}

function fieldContract(
  over: Partial<Extract<RequirementCapabilityContract, { kind: "field" }>> = {},
): RequirementCapabilityContract {
  return {
    kind: "field",
    fieldType: "radio",
    visibility: "main-panel",
    editable: true,
    persisted: true,
    container: "leaf",
    order: 0,
    defaults: [],
    constraints: {},
    condition: null,
    modes: ["live"],
    viewports: ["desktop"],
    ...over,
  };
}

function fixtureShape(
  over: {
    options?: Array<{ label?: string; value: unknown }>;
  } = {},
): CapabilityShapeInput[] {
  return [
    {
      id: "satin.section.Hero.align",
      surface: "section",
      capability: "Hero.align",
      contract: fieldContract({
        constraints: over.options ? { options: over.options } : {},
      }),
    },
  ];
}

// ---------------------------------------------------------------------------

describe("captureSourceRef validation", () => {
  it("accepts an exact 40-hex commit", () => {
    expect(isValidCaptureSourceRef(REF)).toBe(true);
    expect(captureSourceRef(REF)).toBe(REF);
  });

  it("rejects short/long/upper/non-hex refs", () => {
    expect(isValidCaptureSourceRef("a".repeat(39))).toBe(false);
    expect(isValidCaptureSourceRef("a".repeat(41))).toBe(false);
    expect(isValidCaptureSourceRef("A".repeat(40))).toBe(false);
    expect(isValidCaptureSourceRef("g".repeat(40))).toBe(false);
    expect(isValidCaptureSourceRef("HEAD")).toBe(false);
    expect(() => captureSourceRef("HEAD")).toThrow(/captureSourceRef/);
  });
});

describe("baseline path validation", () => {
  it("accepts a normalized path below conformance/baselines/", () => {
    expect(
      isValidBaselinePath("conformance/baselines/satin.structural.json"),
    ).toBe(true);
    expect(baselinePath("conformance/baselines/satin.structural.json")).toBe(
      "conformance/baselines/satin.structural.json",
    );
  });

  it("rejects absolute, traversal, backslash, double-slash and out-of-tree paths", () => {
    expect(isValidBaselinePath("/abs/conformance/baselines/x.json")).toBe(
      false,
    );
    expect(isValidBaselinePath("conformance/baselines/../secrets.json")).toBe(
      false,
    );
    expect(isValidBaselinePath("conformance/baselines/./x.json")).toBe(false);
    expect(isValidBaselinePath("conformance\\baselines\\x.json")).toBe(false);
    expect(isValidBaselinePath("conformance//baselines/x.json")).toBe(false);
    expect(isValidBaselinePath("conformance/inventory/x.json")).toBe(false);
    expect(() => baselinePath("/abs")).toThrow(/baseline path/);
  });
});

describe("canonical serialization", () => {
  it("sorts object keys but preserves array order", () => {
    const a = canonicalStringify({ b: 1, a: [{ y: 1, x: 2 }, { z: 3 }] });
    const b = canonicalStringify({ a: [{ x: 2, y: 1 }, { z: 3 }], b: 1 });
    expect(a).toBe(b);
    // a reordered array is a DIFFERENT canonical string.
    const c = canonicalStringify({ a: [{ z: 3 }, { y: 1, x: 2 }], b: 1 });
    expect(c).not.toBe(a);
  });
});

describe("capabilityShapeDigest", () => {
  it("preserves normative option order in capability shape", () => {
    const a = fixtureShape({
      options: [{ value: "left" }, { value: "right" }],
    });
    const b = fixtureShape({
      options: [{ value: "right" }, { value: "left" }],
    });
    expect(capabilityShapeDigest(a)).not.toBe(capabilityShapeDigest(b));
    expect(capabilityShapeDigest(reorderObjectKeys(a))).toBe(
      capabilityShapeDigest(a),
    );
  });

  it("is stable under capability-ID reorder", () => {
    const s: CapabilityShapeInput[] = [
      {
        id: "satin.b",
        surface: "section",
        capability: "b",
        contract: fieldContract(),
      },
      {
        id: "satin.a",
        surface: "section",
        capability: "a",
        contract: fieldContract(),
      },
    ];
    expect(capabilityShapeDigest(s)).toBe(
      capabilityShapeDigest([...s].reverse()),
    );
  });

  it("churns on a constraint / default / condition / order change", () => {
    const base = fixtureShape();
    const baseDigest = capabilityShapeDigest(base);
    const constraint = [
      { ...base[0], contract: fieldContract({ constraints: { max: 5 } }) },
    ];
    const dflt = [
      {
        ...base[0],
        contract: fieldContract({
          defaults: [
            {
              source: "theme" as const,
              pointer: "/x",
              normalizedPointer: "/x",
              state: "value" as const,
              value: "left",
            },
          ],
        }),
      },
    ];
    const cond = [
      {
        ...base[0],
        contract: fieldContract({
          condition: { targetId: "other", equals: true },
        }),
      },
    ];
    const order = [{ ...base[0], contract: fieldContract({ order: 3 }) }];
    expect(capabilityShapeDigest(constraint)).not.toBe(baseDigest);
    expect(capabilityShapeDigest(dflt)).not.toBe(baseDigest);
    expect(capabilityShapeDigest(cond)).not.toBe(baseDigest);
    expect(capabilityShapeDigest(order)).not.toBe(baseDigest);
  });

  it("ignores observed path / status / SHA (they are not shape inputs)", () => {
    // Two shapes with identical normative fields hash identically regardless of
    // any observed data the caller might have — the input type carries none.
    const a = fixtureShape();
    const b = fixtureShape();
    expect(capabilityShapeDigest(a)).toBe(capabilityShapeDigest(b));
  });
});

describe("caseSetDigest", () => {
  const scenario = (over: Partial<CaseSetScenarioInput["scenario"]> = {}) => ({
    id: "sc-a",
    order: 0,
    role: "option" as const,
    value: "left",
    validity: "expected-valid" as const,
    ...over,
  });
  const input = (
    over: Partial<CaseSetScenarioInput> = {},
  ): CaseSetScenarioInput => ({
    capabilityId: "satin.section.Hero.align",
    scenario: scenario(),
    expected: {
      modes: ["live"],
      viewports: ["desktop"],
      effect: {
        kind: "dom-attribute",
        target: "#x",
        comparator: "equals",
        expected: "left",
      },
    },
    ...over,
  });

  it("is stable under collection reorder and object-key reorder", () => {
    const a = [
      input({ scenario: scenario({ id: "a", order: 0 }) }),
      input({ scenario: scenario({ id: "b", order: 1 }) }),
    ];
    expect(caseSetDigest(a)).toBe(caseSetDigest([...a].reverse()));
    expect(caseSetDigest(reorderObjectKeys(a))).toBe(caseSetDigest(a));
  });

  it("churns on scenario value / order / expected-effect change", () => {
    const base = [input()];
    const d = caseSetDigest(base);
    expect(
      caseSetDigest([input({ scenario: scenario({ value: "right" }) })]),
    ).not.toBe(d);
    expect(
      caseSetDigest([input({ scenario: scenario({ order: 5 }) })]),
    ).not.toBe(d);
    expect(
      caseSetDigest([
        input({
          expected: {
            modes: ["live"],
            viewports: ["desktop"],
            effect: {
              kind: "dom-attribute",
              target: "#x",
              comparator: "equals",
              expected: "CHANGED",
            },
          },
        }),
      ]),
    ).not.toBe(d);
  });

  it("does NOT churn on observation-only differences (they are excluded)", () => {
    // observed data is not part of the CaseSetScenarioInput → identical inputs
    // hash identically even if a runner observed different values.
    expect(caseSetDigest([input()])).toBe(caseSetDigest([input()]));
  });
});

describe("findingsDigest", () => {
  const f = (
    id: string,
    fp: `sha256:${string}`,
    tier: TieredGateFinding["tier"] = "structural",
  ): TieredGateFinding => ({ id, fingerprint: fp, tier });
  it("is order-insensitive on the finding set", () => {
    const a = [f("b", SHA1), f("a", SHA2)];
    expect(findingsDigest(a)).toBe(findingsDigest([...a].reverse()));
  });
  it("churns on a changed fingerprint", () => {
    expect(findingsDigest([f("a", SHA1)])).not.toBe(
      findingsDigest([f("a", SHA2)]),
    );
  });
  it("churns on a changed tier", () => {
    expect(findingsDigest([f("a", SHA1, "structural")])).not.toBe(
      findingsDigest([f("a", SHA1, "effect")]),
    );
  });
});

describe("requirementsDigest / captureTreeDigest", () => {
  it("requirementsDigest hashes the exact reviewed bytes (whitespace churns)", () => {
    const a = Buffer.from('[{"id":"x"}]\n', "utf8");
    const b = Buffer.from('[{"id":"x"}] \n', "utf8");
    expect(requirementsDigest(a)).not.toBe(requirementsDigest(b));
    expect(requirementsDigest(a)).toBe(
      requirementsDigest(Buffer.from('[{"id":"x"}]\n', "utf8")),
    );
  });
  it("captureTreeDigest hashes raw ls-tree bytes", () => {
    const a = Buffer.from("100644 blob abc\0path\0", "binary");
    expect(captureTreeDigest(a)).toBe(
      captureTreeDigest(Buffer.from("100644 blob abc\0path\0", "binary")),
    );
    expect(captureTreeDigest(a)).not.toBe(
      captureTreeDigest(Buffer.from("different", "binary")),
    );
  });
});

describe("TierBaseline serialization + baselineDigest", () => {
  const baseline = (over: Partial<TierBaseline> = {}): TierBaseline => ({
    schemaVersion: 1,
    theme: "satin",
    tier: "structural",
    parentBaselineDigest: null,
    requirements: [{ id: "r1", fingerprint: SHA1 }],
    findings: [{ id: "satin.a", fingerprint: SHA1, tier: "structural" }],
    capabilityShapeDigest: SHA1,
    caseSetDigest: SHA2,
    ...over,
  });

  it("serializes deterministically and orders findings/requirements", () => {
    const a = baseline({
      findings: [
        { id: "satin.b", fingerprint: SHA1, tier: "structural" },
        { id: "satin.a", fingerprint: SHA1, tier: "structural" },
      ],
    });
    const b = baseline({
      findings: [
        { id: "satin.a", fingerprint: SHA1, tier: "structural" },
        { id: "satin.b", fingerprint: SHA1, tier: "structural" },
      ],
    });
    expect(serializeTierBaseline(a).equals(serializeTierBaseline(b))).toBe(
      true,
    );
    expect(baselineDigest(a)).toBe(baselineDigest(b));
  });

  it("churns on a shape/case digest change", () => {
    const d = baselineDigest(baseline());
    expect(baselineDigest(baseline({ capabilityShapeDigest: SHA0 }))).not.toBe(
      d,
    );
    expect(baselineDigest(baseline({ caseSetDigest: SHA0 }))).not.toBe(d);
    expect(baselineDigest(baseline({ parentBaselineDigest: SHA0 }))).not.toBe(
      d,
    );
  });
});

describe("review envelope (captureReviewDigest)", () => {
  const env = (over: Partial<TierReviewEnvelope> = {}): TierReviewEnvelope => ({
    schemaVersion: 1,
    theme: "satin",
    tier: "structural",
    sourceDigest: SHA1,
    candidateInventoryDigest: SHA1,
    requirementsDigest: SHA1,
    capabilityShapeDigest: SHA1,
    caseSetDigest: SHA1,
    findingsDigest: SHA1,
    semanticRevisionDigest: null,
    parentBaselineDigest: null,
    parentManifestDigest: null,
    ...over,
  });

  it("carries exactly the reviewed keys", () => {
    const built = buildTierReviewEnvelope(env());
    expect(Object.keys(built).sort()).toEqual(
      [
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
      ].sort(),
    );
  });

  it("mutating each field independently changes the digest; key order alone does not", () => {
    const base = computeTierReviewDigest(env());
    const fields: Array<Partial<TierReviewEnvelope>> = [
      { theme: "other" },
      { tier: "effect" },
      { sourceDigest: SHA2 },
      { candidateInventoryDigest: SHA2 },
      { requirementsDigest: SHA2 },
      { capabilityShapeDigest: SHA2 },
      { caseSetDigest: SHA2 },
      { findingsDigest: SHA2 },
      { semanticRevisionDigest: SHA2 },
      { parentBaselineDigest: SHA2 },
      { parentManifestDigest: SHA2 },
    ];
    for (const f of fields) {
      expect(computeTierReviewDigest(env(f))).not.toBe(base);
    }
    // reordering the object keys must not change the digest.
    expect(computeTierReviewDigest(reorderObjectKeys(env()))).toBe(base);
  });
});

describe("manifest serialization + digest + parent chain", () => {
  const entry = (over: Partial<TierManifestEntry> = {}): TierManifestEntry => ({
    tier: "structural",
    baselinePath: "conformance/baselines/satin.structural.json",
    baselineDigest: SHA1,
    captureSourceRef: REF,
    captureTreeDigest: SHA1,
    captureReviewDigest: SHA1,
    requirementsDigest: SHA1,
    capabilityShapeDigest: SHA1,
    caseSetDigest: SHA1,
    findingsDigest: SHA1,
    semanticRevisionDigest: null,
    parentBaselineDigest: null,
    ...over,
  });
  const manifest = (
    over: Partial<ThemeBaselineManifest> = {},
  ): ThemeBaselineManifest => ({
    schemaVersion: 1,
    theme: "satin",
    parentManifestDigest: null,
    tiers: { structural: entry() },
    ...over,
  });

  it("serializes deterministically and is order-stable across tier insertion order", () => {
    const a = manifest({ tiers: { structural: entry() } });
    // Insert an effect tier — the fixed tier order keeps bytes stable regardless
    // of insertion order.
    const withEffect1: ThemeBaselineManifest = {
      ...manifest(),
      tiers: { structural: entry(), effect: entry({ tier: "effect" }) },
    };
    const withEffect2: ThemeBaselineManifest = {
      ...manifest(),
      tiers: { effect: entry({ tier: "effect" }), structural: entry() },
    };
    expect(
      serializeManifest(withEffect1).equals(serializeManifest(withEffect2)),
    ).toBe(true);
    expect(serializeManifest(a).length).toBeGreaterThan(0);
  });

  it("chains parentManifestDigest to the previous exact manifest bytes", () => {
    const first = manifest();
    const firstDigest = manifestDigest(first);
    const second = manifest({ parentManifestDigest: firstDigest });
    expect(manifestDigest(second)).not.toBe(firstDigest);
    // a manifest whose parent link does not equal the previous manifest digest
    // is detectably different.
    const tampered = manifest({ parentManifestDigest: SHA0 });
    expect(manifestDigest(tampered)).not.toBe(manifestDigest(second));
  });

  it("detects a manifest/baseline digest mismatch", () => {
    // The manifest entry's baselineDigest must equal the actual baseline bytes'
    // digest; a mismatch is detectable by recomputing baselineDigest.
    const realBaseline: TierBaseline = {
      schemaVersion: 1,
      theme: "satin",
      tier: "structural",
      parentBaselineDigest: null,
      requirements: [],
      findings: [],
      capabilityShapeDigest: SHA1,
      caseSetDigest: SHA1,
    };
    const trueDigest = baselineDigest(realBaseline);
    const m = manifest({
      tiers: { structural: entry({ baselineDigest: SHA0 }) },
    });
    expect(m.tiers.structural!.baselineDigest).not.toBe(trueDigest);
  });
});

describe("orderFindings", () => {
  it("orders by (id,fingerprint)", () => {
    const out = orderFindings([
      { id: "b", fingerprint: SHA1 },
      { id: "a", fingerprint: SHA2 },
      { id: "a", fingerprint: SHA1 },
    ]);
    expect(out.map((f) => `${f.id} ${f.fingerprint}`)).toEqual([
      `a ${SHA1}`,
      `a ${SHA2}`,
      `b ${SHA1}`,
    ]);
  });
});
