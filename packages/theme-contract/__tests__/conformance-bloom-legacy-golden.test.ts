/**
 * Task 4 — Bloom legacy golden fixture.
 *
 * Proves the landed Bloom TWO-artifact structural format remains readable and
 * behaves byte-for-byte as before, and that Bloom normal/capture/shrink/append/
 * inventory-refresh semantics require NO tier manifest. The golden pair
 * (`fixtures/bloom-legacy-{inventory,baseline}.json`) is a self-consistent legacy
 * baseline: its stored `reviewDigest` recomputes from the stored bytes, and its
 * accepted findings drive the shrink-only ratchet exactly as the landed tests do.
 *
 * A shared, fixture-only test (the `conformance-` prefix): it reads only the
 * committed JSON, never a theme build output.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeInventoryDigest,
  recomputeReviewDigestFromBaseline,
  compareBaseline,
  shrinkBaseline,
  appendRequirementLocks,
} from "../conformance";
import type { StructuralBaseline, BaselineFinding } from "../conformance";

const FIX = resolve(__dirname, "fixtures");
const inventoryBytes = readFileSync(
  resolve(FIX, "bloom-legacy-inventory.json"),
);
const baseline = JSON.parse(
  readFileSync(resolve(FIX, "bloom-legacy-baseline.json"), "utf8"),
) as StructuralBaseline;

// The generatorVersion the fixture was minted with (recorded in the inventory).
const GEN = (
  JSON.parse(inventoryBytes.toString("utf8")) as { generatorVersion: string }
).generatorVersion;

describe("Bloom legacy golden fixture", () => {
  it("is a legacy two-artifact baseline with NO tier fields", () => {
    expect(baseline.schemaVersion).toBe(1);
    expect(baseline.theme).toBe("bloom");
    // legacy baseline has NO tier / manifest fields.
    expect(
      (baseline as unknown as Record<string, unknown>).tier,
    ).toBeUndefined();
    expect(
      (baseline as unknown as Record<string, unknown>).capabilityShapeDigest,
    ).toBeUndefined();
    expect(
      (baseline as unknown as Record<string, unknown>).caseSetDigest,
    ).toBeUndefined();
    // findings are tier-LESS BaselineFinding pairs.
    for (const f of baseline.findings) {
      expect((f as unknown as Record<string, unknown>).tier).toBeUndefined();
      expect(typeof f.id).toBe("string");
      expect(f.fingerprint.startsWith("sha256:")).toBe(true);
    }
  });

  it("the baseline inventoryDigest matches the exact inventory bytes", () => {
    expect(baseline.inventoryDigest).toBe(
      computeInventoryDigest(inventoryBytes),
    );
  });

  it("the stored reviewDigest recomputes from the stored bytes (no manifest needed)", () => {
    const recomputed = recomputeReviewDigestFromBaseline(baseline, {
      schemaVersion: 1,
      generatorVersion: GEN,
    });
    expect(recomputed).toBe(baseline.reviewDigest);
  });

  it("normal comparison against its own accepted findings passes (no manifest)", () => {
    const cmp = compareBaseline(baseline.findings, baseline);
    expect(cmp.ok).toBe(true);
    expect(cmp.unexpected).toEqual([]);
    expect(cmp.stale).toEqual([]);
  });

  it("shrink removes an accepted finding without any tier manifest", () => {
    expect(baseline.findings.length).toBeGreaterThan(0);
    const subset = baseline.findings.slice(1); // drop one accepted finding
    const res = shrinkBaseline(subset, baseline, baseline.requirements);
    expect(res.ok).toBe(true);
    expect(res.baseline!.findings.length).toBe(baseline.findings.length - 1);
    // shrink links a parentBaselineDigest but adds NO tier/manifest field.
    expect(
      (res.baseline as unknown as Record<string, unknown>).tier,
    ).toBeUndefined();
  });

  it("append grows the requirement lock list without any tier manifest", () => {
    const extra: BaselineFinding = {
      id: "bloom.block.NewCap",
      fingerprint: ("sha256:" + "5".repeat(64)) as `sha256:${string}`,
    };
    const grown = [...baseline.requirements, extra];
    const res = appendRequirementLocks(baseline, grown);
    expect(res.ok).toBe(true);
    expect(res.baseline!.requirements.length).toBe(
      baseline.requirements.length + 1,
    );
    expect(
      (res.baseline as unknown as Record<string, unknown>).tier,
    ).toBeUndefined();
  });

  it("inventory-refresh semantics (findings + locks unchanged) hold without a manifest", () => {
    // A source-only refresh keeps findings + locks exactly the accepted set.
    const cmp = compareBaseline(baseline.findings, baseline);
    expect(cmp.ok).toBe(true);
    // requirement locks are byte-identical (same set) → append refuses (no growth).
    const noGrowth = appendRequirementLocks(baseline, baseline.requirements);
    expect(noGrowth.ok).toBe(false); // not a strict superset → correctly refused
  });
});
