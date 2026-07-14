/**
 * Task 4 — Satin tiered 3-artifact transaction runner.
 *
 * The tiered runner is exercised hermetically: an injected Satin-shaped fake
 * pipeline + a real temp directory + an injected git provenance provider. This
 * keeps every branch deterministic while running the ACTUAL overlay → gate →
 * tier baseline → manifest → 3-file transaction machinery.
 *
 * This file carries the `satin-conformance-*` prefix required by the plan for a
 * Satin-owned test, but it does NOT read the real Satin build outputs; it drives
 * the runner with an injected pipeline. Coverage:
 *  - initial capture success + refusals (existing manifest / CI / bad ACK / bad
 *    review digest / unreviewed capability);
 *  - normal pass; source-only change → stale inventory; reviewed inventory refresh;
 *  - a shape/case change fails normal (needs a reviewed baseline transaction);
 *  - failure injection before/after inventory rename, after baseline rename and
 *    before manifest rename; only byte-identical resume recovers;
 *  - shrink / append success + refusal;
 *  - semantic-revision success + reject;
 *  - structural-zero (`--require-zero`) on the structural tier only;
 *  - normal/diagnose/structural-zero never write tracked artifacts and always
 *    write a redacted local report on a product failure.
 */

import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runThemeConformance } from "../conformance/cli";
import type {
  ConformancePipelineResult,
  ThemeConformanceDeps,
} from "../conformance/cli";
import {
  overlayRequirements,
  fingerprintRequirements,
  collectGateFindings,
  serializeInventory,
  computeInventoryDigest,
  buildReviewEnvelope,
  computeReviewDigest,
  capabilityShapeDigest,
  caseSetDigest,
  requirementsDigest as computeRequirementsDigest,
  findingsDigest as computeFindingsDigest,
  serializeTierBaseline,
  baselineDigest as computeBaselineDigest,
  captureTreeDigest as computeCaptureTreeDigest,
  computeTierReviewDigest,
  serializeManifest,
  revisionEntryDigest,
} from "../../../packages/theme-contract/conformance";
import type {
  CapabilityRecord,
  RequirementRecord,
  BaselineFinding,
  TieredGateFinding,
  TierBaseline,
  TierManifestEntry,
  ThemeBaselineManifest,
  CapabilityShapeInput,
  CaseSetScenarioInput,
  SemanticRevisionLedger,
} from "../../../packages/theme-contract/conformance";

const GEN = "test-gen-1";
const HEAD = "a".repeat(40);
const LS_TREE = Buffer.from(
  "100644 blob deadbeef\0packages/theme-satin/theme.json\0",
  "binary",
);

// ---------------------------------------------------------------------------
// Satin-shaped fixtures
// ---------------------------------------------------------------------------

function cap(
  id: string,
  over: Partial<CapabilityRecord> = {},
): CapabilityRecord {
  return {
    id,
    theme: "satin",
    surface: "section",
    capability: id,
    label: id,
    editable: true,
    container: "leaf",
    scenarios: [],
    modes: ["live"],
    viewports: ["desktop"],
    sources: [],
    status: "UNKNOWN",
    failureIds: [],
    ...over,
  };
}

/**
 * A reviewed requirement. `contract: null` by default (the user requires the
 * capability open but its reviewed scenarios/cases are undecided) — this yields a
 * stable shape digest and zero overlay findings for a matching PASS capability.
 * The shape digest is still meaningful: it derives from id + surface + capability
 * + contract, so a different ID or a reviewed contract churns it.
 */
function req(
  id: string,
  over: Partial<RequirementRecord> = {},
): RequirementRecord {
  return {
    id,
    sources: [{ kind: "user", ref: "satin-open" }],
    required: true,
    label: id,
    contract: null,
    ...over,
  };
}

function makePipeline(
  over: Partial<ConformancePipelineResult> = {},
): ConformancePipelineResult {
  return {
    theme: "satin",
    sourceDigest: ("sha256:" + "1".repeat(64)) as `sha256:${string}`,
    // A single PASS capability (label matches the requirement so no overlay
    // mismatch finding) → a clean capture with zero findings by default.
    capabilities: [cap("satin.section.Hero.align", { status: "PASS" })],
    structuralIssues: [],
    releaseContract: { pages: [], flows: [] },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface Harness {
  dir: string;
  reviewedPath: string;
  revisionsPath: string;
  inventoryPath: string;
  baselinePath: string;
  manifestPath: string;
  reportDir: string;
}

function harness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), "satin-tier-"));
  // Use in-tree-looking relative paths for baseline/manifest so the path
  // validator accepts them, rooted at the temp dir via the fs adapter's cwd.
  mkdirSync(join(dir, "conformance", "requirements"), { recursive: true });
  mkdirSync(join(dir, "conformance", "baselines"), { recursive: true });
  mkdirSync(join(dir, "conformance", "inventory"), { recursive: true });
  return {
    dir,
    reviewedPath: join(dir, "conformance", "requirements", "satin.v1.json"),
    revisionsPath: join(
      dir,
      "conformance",
      "requirements",
      "satin.revisions.json",
    ),
    inventoryPath: join(
      dir,
      "conformance",
      "inventory",
      "satin.generated.json",
    ),
    // These two MUST be normalized in-tree paths for the path validator.
    baselinePath: "conformance/baselines/satin.structural.json",
    manifestPath: "conformance/baselines/satin.manifest.json",
    reportDir: join(dir, "conformance-results", "satin"),
  };
}

function writeReviewed(h: Harness, reqs: RequirementRecord[]): void {
  writeFileSync(h.reviewedPath, JSON.stringify(reqs, null, 2), "utf8");
}

/**
 * A temp-dir fs adapter that resolves the RELATIVE baseline/manifest tracked
 * paths under the harness dir, while absolute temp paths pass through.
 */
function makeDeps(
  h: Harness,
  pipeline: ConformancePipelineResult,
  opts: {
    env?: Record<string, string | undefined>;
    isCI?: boolean;
    prerequisitesOk?: boolean;
    fsHooks?: Partial<ThemeConformanceDeps["fs"]>;
    git?: Partial<ThemeConformanceDeps["git"]>;
  } = {},
): ThemeConformanceDeps {
  const abs = (p: string) => (p.startsWith("/") ? p : join(h.dir, p));
  const realFs: ThemeConformanceDeps["fs"] = {
    readFile: (p) => (existsSync(abs(p)) ? readFileSync(abs(p)) : null),
    writeFile: (p, data) => {
      mkdirSync(join(abs(p), ".."), { recursive: true });
      writeFileSync(abs(p), data);
    },
    rename: (from, to) => {
      const buf = readFileSync(abs(from));
      mkdirSync(join(abs(to), ".."), { recursive: true });
      writeFileSync(abs(to), buf);
    },
    exists: (p) => existsSync(abs(p)),
    mkdirp: (p) => {
      mkdirSync(abs(p), { recursive: true });
    },
  };
  const git: ThemeConformanceDeps["git"] = {
    headCommit: () => HEAD,
    isClean: () => true,
    lsTree: () => LS_TREE,
    ...(opts.git ?? {}),
  };
  return {
    generatorVersion: GEN,
    schemaVersion: 1,
    isCI: opts.isCI ?? false,
    env: opts.env ?? {},
    buildPipeline: async () => pipeline,
    checkPrerequisites: async () =>
      opts.prerequisitesOk === false
        ? { ok: false, missing: ["x"] }
        : { ok: true, missing: [] },
    fs: { ...realFs, ...(opts.fsHooks ?? {}) },
    git,
  };
}

// ---------------------------------------------------------------------------
// Candidate reproduction (mirror the tiered runner)
// ---------------------------------------------------------------------------

function shapeInputs(reviewed: RequirementRecord[]): CapabilityShapeInput[] {
  return reviewed.map((r) => {
    const parts = r.id.split(".");
    return {
      id: r.id,
      surface: parts[1] ?? "",
      capability: parts.slice(2).join("."),
      contract: r.contract,
    };
  });
}
function caseInputs(reviewed: RequirementRecord[]): CaseSetScenarioInput[] {
  const out: CaseSetScenarioInput[] = [];
  for (const r of reviewed) {
    const byId = new Map((r.scenarios ?? []).map((s) => [s.id, s]));
    for (const ec of r.expectedCases ?? []) {
      const s = byId.get(ec.scenarioId);
      if (!s) continue;
      out.push({
        capabilityId: r.id,
        scenario: s,
        expected: {
          modes: ec.modes,
          viewports: ec.viewports,
          effect: ec.effect,
        },
      });
    }
  }
  return out;
}

interface Candidate {
  inventoryBytes: Buffer;
  inventoryDigest: `sha256:${string}`;
  findings: BaselineFinding[];
  tierFindings: TieredGateFinding[];
  requirementLocks: BaselineFinding[];
  reviewDigest: `sha256:${string}`;
  capShape: `sha256:${string}`;
  caseSet: `sha256:${string}`;
  reqDigest: `sha256:${string}`;
  findingsDigest: `sha256:${string}`;
  sourceDigest: `sha256:${string}`;
}

function candidate(
  pipeline: ConformancePipelineResult,
  reviewed: RequirementRecord[],
  reviewedBytes: Buffer,
  parentBaselineDigest: `sha256:${string}` | null,
): Candidate {
  const overlay = overlayRequirements(pipeline.capabilities, reviewed);
  const combinedIssues = [...pipeline.structuralIssues, ...overlay.findings];
  const reqFps = fingerprintRequirements(reviewed);
  const gate = collectGateFindings(combinedIssues, overlay.rows, reqFps);
  const inventoryBytes = serializeInventory({
    schemaVersion: 1,
    generatorVersion: GEN,
    theme: "satin",
    sourceDigest: pipeline.sourceDigest,
    capabilities: overlay.rows,
    structuralIssues: combinedIssues,
    findings: gate.findings,
    requirements: gate.requirements,
  });
  const inventoryDigest = computeInventoryDigest(inventoryBytes);
  const reviewDigest = computeReviewDigest(
    buildReviewEnvelope({
      schemaVersion: 1,
      generatorVersion: GEN,
      theme: "satin",
      sourceDigest: pipeline.sourceDigest,
      inventoryDigest,
      requirements: gate.requirements,
      findings: gate.findings,
      parentBaselineDigest,
    }),
  );
  const tierFindings: TieredGateFinding[] = gate.findings.map((f) => ({
    ...f,
    tier: "structural" as const,
  }));
  return {
    inventoryBytes,
    inventoryDigest,
    findings: gate.findings,
    tierFindings,
    requirementLocks: gate.requirements,
    reviewDigest,
    capShape: capabilityShapeDigest(shapeInputs(reviewed)),
    caseSet: caseSetDigest(caseInputs(reviewed)),
    reqDigest: computeRequirementsDigest(reviewedBytes),
    findingsDigest: computeFindingsDigest(tierFindings),
    sourceDigest: pipeline.sourceDigest,
  };
}

/** Seed a valid inventory + tier baseline + manifest for a pipeline/reviewed set. */
function seed(
  h: Harness,
  pipeline: ConformancePipelineResult,
  reviewed: RequirementRecord[],
): {
  cand: Candidate;
  baseline: TierBaseline;
  manifest: ThemeBaselineManifest;
} {
  const reviewedBytes = readFileSync(h.reviewedPath);
  const cand = candidate(pipeline, reviewed, reviewedBytes, null);
  const baseline: TierBaseline = {
    schemaVersion: 1,
    theme: "satin",
    tier: "structural",
    parentBaselineDigest: null,
    requirements: cand.requirementLocks,
    findings: cand.tierFindings,
    capabilityShapeDigest: cand.capShape,
    caseSetDigest: cand.caseSet,
  };
  const baselineDigest = computeBaselineDigest(baseline);
  const reviewEnvelopeDigest = computeTierReviewDigest({
    schemaVersion: 1,
    theme: "satin",
    tier: "structural",
    sourceDigest: cand.sourceDigest,
    candidateInventoryDigest: cand.inventoryDigest,
    requirementsDigest: cand.reqDigest,
    capabilityShapeDigest: cand.capShape,
    caseSetDigest: cand.caseSet,
    findingsDigest: cand.findingsDigest,
    semanticRevisionDigest: null,
    parentBaselineDigest: null,
    parentManifestDigest: null,
  });
  const entry: TierManifestEntry = {
    tier: "structural",
    baselinePath: h.baselinePath,
    baselineDigest,
    captureSourceRef: HEAD,
    captureTreeDigest: computeCaptureTreeDigest(LS_TREE),
    captureReviewDigest: reviewEnvelopeDigest,
    requirementsDigest: cand.reqDigest,
    capabilityShapeDigest: cand.capShape,
    caseSetDigest: cand.caseSet,
    findingsDigest: cand.findingsDigest,
    semanticRevisionDigest: null,
    parentBaselineDigest: null,
  };
  const manifest: ThemeBaselineManifest = {
    schemaVersion: 1,
    theme: "satin",
    parentManifestDigest: null,
    tiers: { structural: entry },
  };
  writeFileSync(h.inventoryPath, cand.inventoryBytes);
  writeFileSync(join(h.dir, h.baselinePath), serializeTierBaseline(baseline));
  writeFileSync(join(h.dir, h.manifestPath), serializeManifest(manifest));
  return { cand, baseline, manifest };
}

// ---------------------------------------------------------------------------
// argument helpers
// ---------------------------------------------------------------------------

function normalArgs(h: Harness): string[] {
  return [
    "--theme",
    "satin",
    "--manifest",
    h.manifestPath,
    "--baseline",
    h.baselinePath,
    "--inventory",
    h.inventoryPath,
    "--report-dir",
    h.reportDir,
    "--requirements",
    h.reviewedPath,
    "--revisions",
    h.revisionsPath,
  ];
}
function diagnoseArgs(h: Harness): string[] {
  return [...normalArgs(h), "--diagnose"];
}
function captureArgs(h: Harness, reviewDigest: string): string[] {
  return [
    ...normalArgs(h),
    "--capture-initial-baseline",
    "--write-inventory",
    "--review-digest",
    reviewDigest,
  ];
}
const CAPTURE_ENV = {
  SATIN_BASELINE_ACK: "initial-bootstrap",
  SATIN_INVENTORY_ACK: "reviewed-refresh",
};

// ===========================================================================

describe("Satin tiered — diagnose", () => {
  it("permits missing artifacts, writes report, exits 0, mutates nothing", async () => {
    const h = harness();
    writeReviewed(h, [req("satin.section.Hero.align")]);
    const res = await runThemeConformance(
      diagnoseArgs(h),
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(true);
    expect(existsSync(join(h.reportDir, "report.json"))).toBe(true);
    expect(existsSync(h.inventoryPath)).toBe(false);
    expect(existsSync(join(h.dir, h.baselinePath))).toBe(false);
    expect(existsSync(join(h.dir, h.manifestPath))).toBe(false);
  });
});

describe("Satin tiered — initial capture (3-artifact)", () => {
  it("captures inventory + structural.json + manifest.json atomically", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    const pipeline = makePipeline();
    const cand = candidate(
      pipeline,
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    const res = await runThemeConformance(
      captureArgs(h, cand.reviewDigest),
      makeDeps(h, pipeline, { env: CAPTURE_ENV }),
    );
    expect(res.ok).toBe(true);
    expect(existsSync(h.inventoryPath)).toBe(true);
    expect(existsSync(join(h.dir, h.baselinePath))).toBe(true);
    expect(existsSync(join(h.dir, h.manifestPath))).toBe(true);
    // the tracked baseline's shape/case digests match the candidate.
    const baseline = JSON.parse(
      readFileSync(join(h.dir, h.baselinePath), "utf8"),
    ) as TierBaseline;
    expect(baseline.capabilityShapeDigest).toBe(cand.capShape);
    expect(baseline.caseSetDigest).toBe(cand.caseSet);
    // the manifest baselineDigest matches the actual baseline bytes.
    const manifest = JSON.parse(
      readFileSync(join(h.dir, h.manifestPath), "utf8"),
    ) as ThemeBaselineManifest;
    expect(manifest.tiers.structural!.baselineDigest).toBe(
      computeBaselineDigest(baseline),
    );
    expect(manifest.tiers.structural!.captureSourceRef).toBe(HEAD);
  });

  it("refuses capture when a DIFFERENT baseline already exists", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    // Seed a DIFFERENT accepted baseline (a GAP capability → non-empty findings).
    seed(
      h,
      makePipeline({
        capabilities: [cap("satin.section.Hero.align", { status: "GAP" })],
      }),
      reviewed,
    );
    // Now attempt a fresh capture with a PASS pipeline → the existing baseline
    // differs, so capture must refuse (never overwrite an accepted baseline).
    const cand = candidate(
      makePipeline(),
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    const res = await runThemeConformance(
      captureArgs(h, cand.reviewDigest),
      makeDeps(h, makePipeline(), { env: CAPTURE_ENV }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/already exists/i);
  });

  it("refuses capture in CI", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    const cand = candidate(
      makePipeline(),
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    const res = await runThemeConformance(
      captureArgs(h, cand.reviewDigest),
      makeDeps(h, makePipeline(), { env: CAPTURE_ENV, isCI: true }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/CI/);
    expect(existsSync(h.inventoryPath)).toBe(false);
  });

  it("refuses capture with a bad acknowledgement", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    const cand = candidate(
      makePipeline(),
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    const res = await runThemeConformance(
      captureArgs(h, cand.reviewDigest),
      makeDeps(h, makePipeline(), {
        env: { SATIN_INVENTORY_ACK: "reviewed-refresh" },
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/SATIN_BASELINE_ACK/);
  });

  it("rejects a review digest that no longer matches current sources (zero writes)", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    const res = await runThemeConformance(
      captureArgs(h, "sha256:" + "0".repeat(64)),
      makeDeps(h, makePipeline(), { env: CAPTURE_ENV }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/review digest rejected/i);
    expect(existsSync(h.inventoryPath)).toBe(false);
    expect(existsSync(join(h.dir, h.manifestPath))).toBe(false);
  });

  it("refuses capture with an unreviewed open capability", async () => {
    const h = harness();
    // A GAP capability with NO reviewed requirement → unreviewed open finding.
    const pipeline = makePipeline({
      capabilities: [cap("satin.section.Hero.align", { status: "GAP" })],
    });
    writeReviewed(h, []); // no reviewed requirements
    const cand = candidate(pipeline, [], readFileSync(h.reviewedPath), null);
    const res = await runThemeConformance(
      captureArgs(h, cand.reviewDigest),
      makeDeps(h, pipeline, { env: CAPTURE_ENV }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/lack a reviewed requirement/i);
  });
});

describe("Satin tiered — normal mode", () => {
  it("passes when tracked inventory + baseline + manifest exactly match", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    seed(h, makePipeline(), reviewed);
    const res = await runThemeConformance(
      normalArgs(h),
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(true);
  });

  it("fails on a stale (source-only changed) tracked inventory but leaves baseline/manifest bytes intact", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    seed(h, makePipeline(), reviewed);
    const baselineBefore = readFileSync(join(h.dir, h.baselinePath));
    const manifestBefore = readFileSync(join(h.dir, h.manifestPath));
    // a source-only change: only the sourceDigest moves.
    const moved = makePipeline({
      sourceDigest: ("sha256:" + "9".repeat(64)) as `sha256:${string}`,
    });
    const res = await runThemeConformance(normalArgs(h), makeDeps(h, moved));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/stale/i);
    // the tracked baseline/manifest bytes are UNCHANGED (normal mode never writes).
    expect(
      readFileSync(join(h.dir, h.baselinePath)).equals(baselineBefore),
    ).toBe(true);
    expect(
      readFileSync(join(h.dir, h.manifestPath)).equals(manifestBefore),
    ).toBe(true);
  });

  it("a reviewed inventory refresh restores a normal pass after a source-only change", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    seed(h, makePipeline(), reviewed);
    const moved = makePipeline({
      sourceDigest: ("sha256:" + "9".repeat(64)) as `sha256:${string}`,
    });
    const cand = candidate(moved, reviewed, readFileSync(h.reviewedPath), null);
    // inventory-only refresh (--write-inventory alone).
    const refresh = await runThemeConformance(
      [
        ...normalArgs(h),
        "--write-inventory",
        "--review-digest",
        cand.reviewDigest,
      ],
      makeDeps(h, moved, { env: { SATIN_INVENTORY_ACK: "reviewed-refresh" } }),
    );
    expect(refresh.ok).toBe(true);
    // now normal mode passes against the moved source.
    const normal = await runThemeConformance(normalArgs(h), makeDeps(h, moved));
    expect(normal.ok).toBe(true);
  });

  it("fails normal when the manifest capability-shape lock no longer matches the candidate", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    seed(h, makePipeline(), reviewed);
    // Tamper ONLY the manifest's recorded capabilityShapeDigest (a normative shape
    // drift) — the tracked inventory still matches, so this isolates the shape-lock
    // check. Normal mode must FAIL: a shape change needs a reviewed baseline
    // transaction, never a silent normal pass.
    const manifest = JSON.parse(
      readFileSync(join(h.dir, h.manifestPath), "utf8"),
    ) as ThemeBaselineManifest;
    manifest.tiers.structural!.capabilityShapeDigest = ("sha256:" +
      "7".repeat(64)) as `sha256:${string}`;
    writeFileSync(join(h.dir, h.manifestPath), serializeManifest(manifest));
    const res = await runThemeConformance(
      normalArgs(h),
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/shape lock mismatch/i);
  });
});

describe("Satin tiered — atomic transaction + resume (failure injection)", () => {
  function captureRun(
    h: Harness,
    pipeline: ConformancePipelineResult,
    fsHooks: Partial<ThemeConformanceDeps["fs"]>,
    reviewDigest: string,
  ) {
    return runThemeConformance(
      captureArgs(h, reviewDigest),
      makeDeps(h, pipeline, { env: CAPTURE_ENV, fsHooks }),
    );
  }

  it("a failure BEFORE inventory commit leaves no partial state", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    const cand = candidate(
      makePipeline(),
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    const abs = (p: string) => (p.startsWith("/") ? p : join(h.dir, p));
    const res = await captureRun(
      h,
      makePipeline(),
      {
        rename: (from) => {
          if (from.includes("inventory"))
            throw new Error("boom-before-inventory");
          const buf = readFileSync(abs(from));
          writeFileSync(abs(from.replace(".tmp", "")), buf);
        },
      },
      cand.reviewDigest,
    );
    expect(res.ok).toBe(false);
    expect(existsSync(h.inventoryPath)).toBe(false);
    expect(existsSync(join(h.dir, h.baselinePath))).toBe(false);
    expect(existsSync(join(h.dir, h.manifestPath))).toBe(false);
  });

  it("a failure AFTER inventory but BEFORE baseline stays red; exact-candidate resume recovers", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    const cand = candidate(
      makePipeline(),
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    const abs = (p: string) => (p.startsWith("/") ? p : join(h.dir, p));
    // First run: fail when renaming the baseline (inventory already committed).
    const res1 = await captureRun(
      h,
      makePipeline(),
      {
        rename: (from, to) => {
          if (from.includes("structural"))
            throw new Error("boom-before-baseline");
          const buf = readFileSync(abs(from));
          writeFileSync(abs(to), buf);
        },
      },
      cand.reviewDigest,
    );
    expect(res1.ok).toBe(false);
    expect(existsSync(h.inventoryPath)).toBe(true); // inventory committed
    expect(existsSync(join(h.dir, h.baselinePath))).toBe(false); // baseline not
    expect(existsSync(join(h.dir, h.manifestPath))).toBe(false);
    // Resume with the EXACT same candidate — the byte-identical inventory is
    // accepted and the transaction finishes.
    const res2 = await captureRun(h, makePipeline(), {}, cand.reviewDigest);
    expect(res2.ok).toBe(true);
    expect(existsSync(join(h.dir, h.baselinePath))).toBe(true);
    expect(existsSync(join(h.dir, h.manifestPath))).toBe(true);
  });

  it("a failure AFTER baseline but BEFORE manifest stays red; resume completes the manifest", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    const cand = candidate(
      makePipeline(),
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    const abs = (p: string) => (p.startsWith("/") ? p : join(h.dir, p));
    const res1 = await captureRun(
      h,
      makePipeline(),
      {
        rename: (from, to) => {
          if (from.includes("manifest"))
            throw new Error("boom-before-manifest");
          const buf = readFileSync(abs(from));
          writeFileSync(abs(to), buf);
        },
      },
      cand.reviewDigest,
    );
    expect(res1.ok).toBe(false);
    expect(existsSync(h.inventoryPath)).toBe(true);
    expect(existsSync(join(h.dir, h.baselinePath))).toBe(true);
    expect(existsSync(join(h.dir, h.manifestPath))).toBe(false); // commit point not reached
    const res2 = await captureRun(h, makePipeline(), {}, cand.reviewDigest);
    expect(res2.ok).toBe(true);
    expect(existsSync(join(h.dir, h.manifestPath))).toBe(true);
  });

  it("resume aborts when a pre-existing inventory differs from the candidate", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    const cand = candidate(
      makePipeline(),
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    // Pre-existing DIFFERENT inventory (a foreign partial state).
    writeFileSync(h.inventoryPath, Buffer.from('{"foreign":true}\n', "utf8"));
    const res = await captureRun(h, makePipeline(), {}, cand.reviewDigest);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/resume aborted/i);
  });
});

describe("Satin tiered — shrink / append", () => {
  it("shrinks when the current structural findings are a strict subset", async () => {
    const h = harness();
    // Two GAP capabilities, both reviewed → two structural findings.
    const reviewed = [
      req("satin.section.Hero.align"),
      req("satin.section.Hero.subtitle"),
    ];
    writeReviewed(h, reviewed);
    const gapPipeline = makePipeline({
      capabilities: [
        cap("satin.section.Hero.align", { status: "GAP" }),
        cap("satin.section.Hero.subtitle", { status: "GAP" }),
      ],
    });
    seed(h, gapPipeline, reviewed);
    // now one capability is repaired → one finding removed.
    const repaired = makePipeline({
      capabilities: [
        cap("satin.section.Hero.align", { status: "PASS" }),
        cap("satin.section.Hero.subtitle", { status: "GAP" }),
      ],
    });
    const cand = candidate(
      repaired,
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    const res = await runThemeConformance(
      [
        ...normalArgs(h),
        "--shrink-baseline",
        "--write-inventory",
        "--review-digest",
        cand.reviewDigest,
      ],
      makeDeps(h, repaired, {
        env: {
          SATIN_BASELINE_SHRINK_ACK: "verified-remediation",
          SATIN_INVENTORY_ACK: "reviewed-refresh",
        },
      }),
    );
    expect(res.ok).toBe(true);
    const before = seed(h, gapPipeline, reviewed).baseline.findings.length; // 4 findings (2 GAP caps × status-open+status-gap)
    // re-seed above resets the baseline; re-run the shrink to measure the result.
    const cand2 = candidate(
      repaired,
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    const res2 = await runThemeConformance(
      [
        ...normalArgs(h),
        "--shrink-baseline",
        "--write-inventory",
        "--review-digest",
        cand2.reviewDigest,
      ],
      makeDeps(h, repaired, {
        env: {
          SATIN_BASELINE_SHRINK_ACK: "verified-remediation",
          SATIN_INVENTORY_ACK: "reviewed-refresh",
        },
      }),
    );
    expect(res2.ok).toBe(true);
    const baseline = JSON.parse(
      readFileSync(join(h.dir, h.baselinePath), "utf8"),
    ) as TierBaseline;
    // repairing one of two GAP capabilities removes its findings → the baseline SHRANK.
    expect(baseline.findings.length).toBeLessThan(before);
    expect(baseline.findings.length).toBeGreaterThan(0);
    // the manifest chained a parent baseline digest.
    const manifest = JSON.parse(
      readFileSync(join(h.dir, h.manifestPath), "utf8"),
    ) as ThemeBaselineManifest;
    expect(manifest.tiers.structural!.parentBaselineDigest).not.toBeNull();
    expect(manifest.parentManifestDigest).not.toBeNull();
  });

  it("refuses shrink when a finding is ADDED", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    seed(
      h,
      makePipeline({
        capabilities: [cap("satin.section.Hero.align", { status: "PASS" })],
      }),
      reviewed,
    );
    // now the capability regresses to GAP → a NEW finding (an addition).
    const regressed = makePipeline({
      capabilities: [cap("satin.section.Hero.align", { status: "GAP" })],
    });
    const cand = candidate(
      regressed,
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    const res = await runThemeConformance(
      [
        ...normalArgs(h),
        "--shrink-baseline",
        "--write-inventory",
        "--review-digest",
        cand.reviewDigest,
      ],
      makeDeps(h, regressed, {
        env: {
          SATIN_BASELINE_SHRINK_ACK: "verified-remediation",
          SATIN_INVENTORY_ACK: "reviewed-refresh",
        },
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/subset|addition/i);
  });

  it("appends a new requirement lock while the finding set stays byte-identical", async () => {
    const h = harness();
    // seed with one requirement.
    const reviewed1 = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed1);
    seed(h, makePipeline(), reviewed1);
    // add a SECOND requirement whose capability is PASS (no new finding).
    const reviewed2 = [
      req("satin.section.Hero.align"),
      req("satin.section.Hero.subtitle"),
    ];
    writeReviewed(h, reviewed2);
    const pipeline2 = makePipeline({
      capabilities: [
        cap("satin.section.Hero.align", { status: "PASS" }),
        cap("satin.section.Hero.subtitle", { status: "PASS" }),
      ],
    });
    const cand = candidate(
      pipeline2,
      reviewed2,
      readFileSync(h.reviewedPath),
      null,
    );
    const res = await runThemeConformance(
      [
        ...normalArgs(h),
        "--append-requirement-locks",
        "--write-inventory",
        "--review-digest",
        cand.reviewDigest,
      ],
      makeDeps(h, pipeline2, {
        env: {
          SATIN_REQUIREMENTS_ACK: "reviewed-append",
          SATIN_INVENTORY_ACK: "reviewed-refresh",
        },
      }),
    );
    // The finding set must stay byte-identical; the shape changed (a new
    // requirement was added) so append is only legal when findings are unchanged.
    // With both PASS there are zero findings before and after → append succeeds.
    expect(res.ok).toBe(true);
    const baseline = JSON.parse(
      readFileSync(join(h.dir, h.baselinePath), "utf8"),
    ) as TierBaseline;
    expect(baseline.requirements.length).toBe(2);
  });
});

describe("Satin tiered — structural zero (--require-zero)", () => {
  it("passes only when zero structural findings exist", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    seed(h, makePipeline(), reviewed); // PASS capability → zero findings
    const res = await runThemeConformance(
      [...normalArgs(h), "--require-zero"],
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(true);
  });

  it("fails when a structural finding still exists even if it matches the baseline", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    const gap = makePipeline({
      capabilities: [cap("satin.section.Hero.align", { status: "GAP" })],
    });
    seed(h, gap, reviewed); // one accepted finding
    const res = await runThemeConformance(
      [...normalArgs(h), "--require-zero"],
      makeDeps(h, gap),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/structural zero/i);
  });
});

describe("Satin tiered — semantic revision", () => {
  it("rejects revise with a bad change-set digest", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    seed(h, makePipeline(), reviewed);
    // a ledger with one entry.
    const entry = {
      id: "rev-0",
      parentRevisionDigest: null,
      parentRequirementsDigest: ("sha256:" +
        "1".repeat(64)) as `sha256:${string}`,
      nextRequirementsDigest: ("sha256:" +
        "2".repeat(64)) as `sha256:${string}`,
      addedRequirementIds: [],
      addedCapabilityIds: [],
      addedCaseIds: ["satin.section.Hero.align.case.b"],
      changes: [],
    };
    const ledger: SemanticRevisionLedger = {
      schemaVersion: 1,
      theme: "satin",
      revisions: [entry],
    };
    writeFileSync(h.revisionsPath, JSON.stringify(ledger, null, 2), "utf8");
    const cand = candidate(
      makePipeline(),
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    const res = await runThemeConformance(
      [
        ...normalArgs(h),
        "--revise-semantic-baseline",
        "--write-inventory",
        "--revision-id",
        "rev-0",
        "--change-set-digest",
        "sha256:" + "0".repeat(64),
        "--review-digest",
        cand.reviewDigest,
      ],
      makeDeps(h, makePipeline(), {
        env: {
          SATIN_BASELINE_REVISE_ACK: "reviewed-semantic-change",
          SATIN_INVENTORY_ACK: "reviewed-refresh",
        },
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/change-set-digest/i);
  });

  it("accepts a revise with the exact change-set digest and extends the manifest prefix", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    seed(h, makePipeline(), reviewed);
    const entry = {
      id: "rev-0",
      parentRevisionDigest: null,
      parentRequirementsDigest: ("sha256:" +
        "1".repeat(64)) as `sha256:${string}`,
      nextRequirementsDigest: ("sha256:" +
        "2".repeat(64)) as `sha256:${string}`,
      addedRequirementIds: [],
      addedCapabilityIds: [],
      addedCaseIds: ["satin.section.Hero.align.case.b"],
      changes: [],
    };
    const ledger: SemanticRevisionLedger = {
      schemaVersion: 1,
      theme: "satin",
      revisions: [entry],
    };
    writeFileSync(h.revisionsPath, JSON.stringify(ledger, null, 2), "utf8");
    const changeSetDigest = revisionEntryDigest(entry);
    const cand = candidate(
      makePipeline(),
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    const res = await runThemeConformance(
      [
        ...normalArgs(h),
        "--revise-semantic-baseline",
        "--write-inventory",
        "--revision-id",
        "rev-0",
        "--change-set-digest",
        changeSetDigest,
        "--review-digest",
        cand.reviewDigest,
      ],
      makeDeps(h, makePipeline(), {
        env: {
          SATIN_BASELINE_REVISE_ACK: "reviewed-semantic-change",
          SATIN_INVENTORY_ACK: "reviewed-refresh",
        },
      }),
    );
    expect(res.ok).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(h.dir, h.manifestPath), "utf8"),
    ) as ThemeBaselineManifest;
    expect(manifest.tiers.structural!.semanticRevisionDigest).not.toBeNull();
  });

  it("refuses revise in CI", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    seed(h, makePipeline(), reviewed);
    const cand = candidate(
      makePipeline(),
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    const res = await runThemeConformance(
      [
        ...normalArgs(h),
        "--revise-semantic-baseline",
        "--write-inventory",
        "--revision-id",
        "rev-0",
        "--change-set-digest",
        "sha256:" + "0".repeat(64),
        "--review-digest",
        cand.reviewDigest,
      ],
      makeDeps(h, makePipeline(), {
        isCI: true,
        env: {
          SATIN_BASELINE_REVISE_ACK: "reviewed-semantic-change",
          SATIN_INVENTORY_ACK: "reviewed-refresh",
        },
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/CI/);
  });

  it("refuses revise on a dirty worktree", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    seed(h, makePipeline(), reviewed);
    const entry = {
      id: "rev-0",
      parentRevisionDigest: null,
      parentRequirementsDigest: ("sha256:" +
        "1".repeat(64)) as `sha256:${string}`,
      nextRequirementsDigest: ("sha256:" +
        "2".repeat(64)) as `sha256:${string}`,
      addedRequirementIds: [],
      addedCapabilityIds: [],
      addedCaseIds: ["x"],
      changes: [],
    };
    writeFileSync(
      h.revisionsPath,
      JSON.stringify(
        { schemaVersion: 1, theme: "satin", revisions: [entry] },
        null,
        2,
      ),
      "utf8",
    );
    const cand = candidate(
      makePipeline(),
      reviewed,
      readFileSync(h.reviewedPath),
      null,
    );
    const res = await runThemeConformance(
      [
        ...normalArgs(h),
        "--revise-semantic-baseline",
        "--write-inventory",
        "--revision-id",
        "rev-0",
        "--change-set-digest",
        revisionEntryDigest(entry),
        "--review-digest",
        cand.reviewDigest,
      ],
      makeDeps(h, makePipeline(), {
        env: {
          SATIN_BASELINE_REVISE_ACK: "reviewed-semantic-change",
          SATIN_INVENTORY_ACK: "reviewed-refresh",
        },
        git: { isClean: () => false },
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/clean worktree/i);
  });
});

describe("Satin tiered — no tracked writes + redacted report on product failure", () => {
  it("normal/diagnose/release never write tracked artifacts and always write a report", async () => {
    const h = harness();
    const reviewed = [req("satin.section.Hero.align")];
    writeReviewed(h, reviewed);
    seed(h, makePipeline(), reviewed);
    // introduce a product failure: a source-only change → stale inventory.
    const moved = makePipeline({
      sourceDigest: ("sha256:" + "9".repeat(64)) as `sha256:${string}`,
    });
    const invBefore = readFileSync(h.inventoryPath);
    const baseBefore = readFileSync(join(h.dir, h.baselinePath));
    const manBefore = readFileSync(join(h.dir, h.manifestPath));
    let wrote = false;
    const deps = makeDeps(h, moved, {
      fsHooks: {
        writeFile: (p, data) => {
          if (!p.includes("conformance-results")) wrote = true; // a TRACKED write
          mkdirSync(join(p.startsWith("/") ? p : join(h.dir, p), ".."), {
            recursive: true,
          });
          writeFileSync(p.startsWith("/") ? p : join(h.dir, p), data);
        },
      },
    });
    const res = await runThemeConformance(normalArgs(h), deps);
    expect(res.ok).toBe(false);
    expect(wrote).toBe(false); // no tracked write
    // tracked bytes untouched.
    expect(readFileSync(h.inventoryPath).equals(invBefore)).toBe(true);
    expect(readFileSync(join(h.dir, h.baselinePath)).equals(baseBefore)).toBe(
      true,
    );
    expect(readFileSync(join(h.dir, h.manifestPath)).equals(manBefore)).toBe(
      true,
    );
    // a report was still written.
    expect(existsSync(join(h.reportDir, "report.json"))).toBe(true);
  });
});
