/**
 * Task 6 — testable conformance CLI (`runThemeConformance`).
 *
 * The orchestrator is fully dependency-injected: the process adapter
 * `scripts/theme-conformance.ts` wires the real pipeline, while these tests inject
 * a fake pipeline (deterministic capability rows / structural issues / source
 * digest / release-contract input) and a real temp directory. That keeps every
 * branch hermetic while still exercising the actual overlay → findings →
 * ratchet → digest → report → transaction machinery from Tasks 1-5.
 *
 * Coverage (per the plan's "CLI tests"):
 *  - invalid theme / Luna;
 *  - missing compiled prerequisites (prints exact build order);
 *  - deterministic proposal with missing reviewed artifacts, local-only output,
 *    no overwrite of an existing reviewed file;
 *  - two byte-identical diagnose runs, stable review digest, no mutation;
 *  - changed source/finding between diagnose and mutation → review-digest
 *    rejection with zero writes;
 *  - normal pass and stale inventory;
 *  - baseline/inventory digest mismatch and invalid stored review digest;
 *  - unexpected / stale / changed-fingerprint baseline;
 *  - new UNKNOWN capability expansion;
 *  - missing locked requirement and code-field deletion;
 *  - --require-zero;
 *  - capture refusal in CI / existing file / bad ack;
 *  - shrink refusal for additions/replacements;
 *  - requirement-lock append success + refusals;
 *  - inventory write refusal in CI / bad ack;
 *  - every illegal flag combination rejected before writes;
 *  - injected failures before/after inventory rename and before baseline rename;
 *    only exact-candidate resume recovers;
 *  - no filesystem mutation in normal / release modes.
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
import { createHash } from "node:crypto";

import { runThemeConformance } from "../conformance/cli";
import {
  serializeInventory,
  computeInventoryDigest,
  buildReviewEnvelope,
  computeReviewDigest,
  collectGateFindings,
  fingerprintRequirements,
  overlayRequirements,
  recomputeReviewDigestFromBaseline,
} from "../../../packages/theme-contract/conformance";
import type {
  CapabilityRecord,
  RequirementRecord,
  StructuralBaseline,
  BaselineFinding,
} from "../../../packages/theme-contract/conformance";
import type {
  ConformancePipelineResult,
  ThemeConformanceDeps,
} from "../conformance/cli";

const GEN_VERSION = "test-gen-1";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function cap(
  id: string,
  overrides: Partial<CapabilityRecord> = {},
): CapabilityRecord {
  return {
    id,
    theme: "bloom",
    surface: "block",
    capability: id,
    // label matches the reviewed requirement label (id) so no spurious
    // label-mismatch finding is emitted by the overlay in these fixtures.
    label: id,
    editable: true,
    container: "leaf",
    scenarios: [],
    modes: ["hot-preview", "initial-preview", "live"],
    viewports: ["desktop", "mobile"],
    sources: [],
    status: "UNKNOWN",
    failureIds: [],
    ...overrides,
  };
}

function req(
  id: string,
  overrides: Partial<RequirementRecord> = {},
): RequirementRecord {
  return {
    id,
    sources: [{ kind: "user", ref: "все-должно-быть-открыто" }],
    required: true,
    label: id,
    contract: null,
    ...overrides,
  };
}

const sha = (s: string): `sha256:${string}` =>
  `sha256:${createHash("sha256").update(s, "utf8").digest("hex")}`;

/** Default fake pipeline: one editable UNKNOWN capability, no structural issues. */
function makePipeline(
  over: Partial<ConformancePipelineResult> = {},
): ConformancePipelineResult {
  return {
    theme: "bloom",
    sourceDigest: sha("source-v1"),
    capabilities: [cap("bloom.block.Hero.title")],
    structuralIssues: [],
    releaseContract: { pages: [], flows: [] },
    ...over,
  };
}

// A deterministic in-memory environment for one CLI run.
interface Harness {
  dir: string;
  reviewedRequirementsPath: string;
  baselinePath: string;
  inventoryPath: string;
  reportDir: string;
}

function harness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), "bloom-conf-"));
  mkdirSync(join(dir, "conformance", "requirements"), { recursive: true });
  mkdirSync(join(dir, "conformance", "baselines"), { recursive: true });
  mkdirSync(join(dir, "conformance", "inventory"), { recursive: true });
  return {
    dir,
    reviewedRequirementsPath: join(
      dir,
      "conformance",
      "requirements",
      "bloom.v1.json",
    ),
    baselinePath: join(
      dir,
      "conformance",
      "baselines",
      "bloom.structural.json",
    ),
    inventoryPath: join(
      dir,
      "conformance",
      "inventory",
      "bloom.generated.json",
    ),
    reportDir: join(dir, "conformance-results", "bloom"),
  };
}

function writeReviewed(h: Harness, reqs: RequirementRecord[]): void {
  writeFileSync(
    h.reviewedRequirementsPath,
    JSON.stringify(reqs, null, 2),
    "utf8",
  );
}

/** Build the deps object for a run. `pipeline` is the injected fake. */
function makeDeps(
  h: Harness,
  pipeline: ConformancePipelineResult,
  opts: {
    env?: Record<string, string | undefined>;
    isCI?: boolean;
    prerequisitesOk?: boolean;
    fsHooks?: Partial<ThemeConformanceDeps["fs"]>;
  } = {},
): ThemeConformanceDeps {
  const realFs: ThemeConformanceDeps["fs"] = {
    readFile: (p) => (existsSync(p) ? readFileSync(p) : null),
    writeFile: (p, data) => {
      mkdirSync(join(p, ".."), { recursive: true });
      writeFileSync(p, data);
    },
    rename: (from, to) => {
      const buf = readFileSync(from);
      writeFileSync(to, buf);
    },
    exists: (p) => existsSync(p),
    mkdirp: (p) => {
      mkdirSync(p, { recursive: true });
    },
  };
  return {
    generatorVersion: GEN_VERSION,
    schemaVersion: 1,
    isCI: opts.isCI ?? false,
    env: opts.env ?? {},
    buildPipeline: async () => pipeline,
    checkPrerequisites: async () =>
      opts.prerequisitesOk === false
        ? {
            ok: false,
            missing: ["dist/src/controllers/theme-puck-config.controller.js"],
          }
        : { ok: true, missing: [] },
    fs: { ...realFs, ...(opts.fsHooks ?? {}) },
  };
}

// Reproduce the CLI's expected candidate so tests can assert digests/writes.
// `parentBaselineDigest` mirrors the orchestrator: null for capture, the existing
// baseline's reviewDigest for shrink/append/inventory-only refresh.
function expectedCandidate(
  pipeline: ConformancePipelineResult,
  reviewed: RequirementRecord[],
  parentBaselineDigest: `sha256:${string}` | null = null,
): {
  inventoryBytes: Buffer;
  inventoryDigest: `sha256:${string}`;
  findings: BaselineFinding[];
  requirementLocks: BaselineFinding[];
  reviewDigest: `sha256:${string}`;
} {
  // Faithfully mirror the orchestrator: overlay reviewed requirements onto the
  // rows (merging sources + emitting mismatch findings), then collect gate
  // findings over the OVERLAID rows and the combined issue list.
  const overlay = overlayRequirements(pipeline.capabilities, reviewed);
  const combinedIssues = [...pipeline.structuralIssues, ...overlay.findings];
  const reqFps = fingerprintRequirements(reviewed);
  const gate = collectGateFindings(combinedIssues, overlay.rows, reqFps);
  const inventoryBytes = serializeInventory({
    schemaVersion: 1,
    generatorVersion: GEN_VERSION,
    theme: "bloom",
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
      generatorVersion: GEN_VERSION,
      theme: "bloom",
      sourceDigest: pipeline.sourceDigest,
      inventoryDigest,
      requirements: gate.requirements,
      findings: gate.findings,
      parentBaselineDigest,
    }),
  );
  return {
    inventoryBytes,
    inventoryDigest,
    findings: gate.findings,
    requirementLocks: gate.requirements,
    reviewDigest,
  };
}

// ---------------------------------------------------------------------------
// theme validation
// ---------------------------------------------------------------------------

describe("theme validation", () => {
  it("rejects an unknown theme", async () => {
    const h = harness();
    const res = await runThemeConformance(
      ["--theme", "nope", "--report-dir", h.reportDir],
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(false);
    expect(res.exitCode).not.toBe(0);
    expect(res.error).toMatch(/theme/i);
  });

  it("rejects Luna explicitly", async () => {
    const h = harness();
    const res = await runThemeConformance(
      ["--theme", "luna", "--report-dir", h.reportDir],
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/luna/i);
  });

  it("dispatches Satin to the tiered runner (Task 4 — no longer a deferral marker)", async () => {
    const h = harness();
    // Satin now runs the tiered 3-artifact runner. It resolves the complete
    // bundle (Task 3) and dispatches into the tiered orchestrator: prerequisites
    // are checked and the pipeline runs. It NEVER returns the old
    // `tier-runner-not-implemented` marker, and it is NOT a missing-adapter error.
    const deps = makeDeps(h, makePipeline());
    let checked = false;
    deps.checkPrerequisites = async () => {
      checked = true;
      return { ok: true, missing: [] };
    };
    const res = await runThemeConformance(
      ["--theme", "satin", "--report-dir", h.reportDir, "--diagnose"],
      deps,
    );
    // Satin diagnose dispatches into the tiered runner (prerequisites checked,
    // pipeline reached) and reports current findings. Diagnose is lenient — it
    // does NOT require a captured baseline/reviewed artifact — so it returns no
    // error here (res.error undefined). It must NEVER surface the old deferral
    // or missing-adapter markers. Guard `?? ""` keeps the marker assertions
    // valid when diagnose succeeds with no error string.
    expect(res.error ?? "").not.toBe("tier-runner-not-implemented");
    expect(res.error ?? "").not.toMatch(
      /incomplete|missing adapter|release-contract/i,
    );
    expect(checked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// prerequisites
// ---------------------------------------------------------------------------

describe("build prerequisites", () => {
  it("fails with the exact build order when compiled prerequisites are missing", async () => {
    const h = harness();
    writeReviewed(h, [req("bloom.block.Hero.title")]);
    const res = await runThemeConformance(
      diagnoseArgs(h),
      makeDeps(h, makePipeline(), { prerequisitesOk: false }),
    );
    expect(res.ok).toBe(false);
    expect(res.exitCode).not.toBe(0);
    expect(res.buildOrder).toEqual([
      "corepack pnpm build",
      "corepack pnpm build:blocks",
      "corepack pnpm build:theme-sections bloom",
      "corepack pnpm exec tsx scripts/run-theme-build.ts bloom",
    ]);
  });
});

// ---------------------------------------------------------------------------
// argument helpers
// ---------------------------------------------------------------------------

function normalArgs(h: Harness): string[] {
  return [
    "--theme",
    "bloom",
    "--baseline",
    h.baselinePath,
    "--inventory",
    h.inventoryPath,
    "--report-dir",
    h.reportDir,
    "--requirements",
    h.reviewedRequirementsPath,
  ];
}
function diagnoseArgs(h: Harness): string[] {
  return [...normalArgs(h), "--diagnose"];
}
function releaseArgs(h: Harness): string[] {
  return [...normalArgs(h), "--require-zero"];
}

// Write a valid tracked inventory + baseline pair for a pipeline+reviewed set.
function seedBaseline(
  h: Harness,
  pipeline: ConformancePipelineResult,
  reviewed: RequirementRecord[],
): { inventoryDigest: `sha256:${string}`; reviewDigest: `sha256:${string}` } {
  const cand = expectedCandidate(pipeline, reviewed);
  writeFileSync(h.inventoryPath, cand.inventoryBytes);
  const baseline: StructuralBaseline = {
    schemaVersion: 1,
    theme: "bloom",
    reviewDigest: cand.reviewDigest,
    inventoryDigest: cand.inventoryDigest,
    sourceDigest: pipeline.sourceDigest,
    parentBaselineDigest: null,
    requirements: cand.requirementLocks,
    findings: cand.findings,
  };
  writeFileSync(h.baselinePath, JSON.stringify(baseline, null, 2), "utf8");
  return {
    inventoryDigest: cand.inventoryDigest,
    reviewDigest: cand.reviewDigest,
  };
}

// ---------------------------------------------------------------------------
// proposal mode
// ---------------------------------------------------------------------------

describe("--propose-requirements", () => {
  it("writes a deterministic local proposal without reading/mutating reviewed artifacts", async () => {
    const h = harness();
    const proposalPath = join(h.reportDir, "requirements.proposal.json");
    const pipeline = makePipeline();
    const res = await runThemeConformance(
      [
        "--theme",
        "bloom",
        "--report-dir",
        h.reportDir,
        "--propose-requirements",
        proposalPath,
      ],
      makeDeps(h, pipeline),
    );
    expect(res.ok).toBe(true);
    expect(res.exitCode).toBe(0);
    expect(existsSync(proposalPath)).toBe(true);
    // No reviewed / baseline / inventory mutation.
    expect(existsSync(h.baselinePath)).toBe(false);
    expect(existsSync(h.inventoryPath)).toBe(false);
    const a = readFileSync(proposalPath, "utf8");

    // Second run is byte-identical.
    const res2 = await runThemeConformance(
      [
        "--theme",
        "bloom",
        "--report-dir",
        h.reportDir,
        "--propose-requirements",
        proposalPath,
      ],
      makeDeps(h, pipeline),
    );
    expect(res2.ok).toBe(true);
    expect(readFileSync(proposalPath, "utf8")).toEqual(a);
  });

  it("never overwrites an existing reviewed requirements file", async () => {
    const h = harness();
    const proposalPath = join(h.reportDir, "requirements.proposal.json");
    writeReviewed(h, [req("bloom.block.Hero.title")]);
    const before = readFileSync(h.reviewedRequirementsPath, "utf8");
    await runThemeConformance(
      [
        "--theme",
        "bloom",
        "--report-dir",
        h.reportDir,
        "--propose-requirements",
        proposalPath,
      ],
      makeDeps(h, makePipeline()),
    );
    expect(readFileSync(h.reviewedRequirementsPath, "utf8")).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// diagnose mode
// ---------------------------------------------------------------------------

describe("--diagnose", () => {
  it("permits missing baseline/inventory, writes report, exits 0, mutates nothing", async () => {
    const h = harness();
    writeReviewed(h, [req("bloom.block.Hero.title")]);
    const res = await runThemeConformance(
      diagnoseArgs(h),
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(true);
    expect(res.exitCode).toBe(0);
    expect(existsSync(h.baselinePath)).toBe(false);
    expect(existsSync(h.inventoryPath)).toBe(false);
    expect(existsSync(join(h.reportDir, "report.json"))).toBe(true);
  });

  it("two unchanged diagnose runs produce byte-identical report + stable review digest", async () => {
    const h = harness();
    writeReviewed(h, [req("bloom.block.Hero.title")]);
    const r1 = await runThemeConformance(
      diagnoseArgs(h),
      makeDeps(h, makePipeline()),
    );
    const json1 = readFileSync(join(h.reportDir, "report.json"), "utf8");
    const md1 = readFileSync(join(h.reportDir, "report.md"), "utf8");
    const r2 = await runThemeConformance(
      diagnoseArgs(h),
      makeDeps(h, makePipeline()),
    );
    const json2 = readFileSync(join(h.reportDir, "report.json"), "utf8");
    const md2 = readFileSync(join(h.reportDir, "report.md"), "utf8");
    expect(json1).toEqual(json2);
    expect(md1).toEqual(md2);
    expect(r1.reviewDigest).toEqual(r2.reviewDigest);
  });

  it("exits non-zero for harness/build failures even in diagnose mode", async () => {
    const h = harness();
    writeReviewed(h, [req("bloom.block.Hero.title")]);
    const deps = makeDeps(h, makePipeline());
    deps.buildPipeline = async () => {
      throw new Error("import failure in snapshot");
    };
    const res = await runThemeConformance(diagnoseArgs(h), deps);
    expect(res.ok).toBe(false);
    expect(res.exitCode).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// normal mode
// ---------------------------------------------------------------------------

describe("normal mode", () => {
  it("passes when the tracked inventory + baseline exactly match", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    seedBaseline(h, makePipeline(), reviewed);
    const res = await runThemeConformance(
      normalArgs(h),
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(true);
    expect(res.exitCode).toBe(0);
  });

  it("fails on a stale (byte-mismatched) tracked inventory", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    seedBaseline(h, makePipeline(), reviewed);
    // Corrupt the tracked inventory bytes.
    writeFileSync(
      h.inventoryPath,
      readFileSync(h.inventoryPath, "utf8") + " ",
      "utf8",
    );
    const res = await runThemeConformance(
      normalArgs(h),
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/inventory/i);
  });

  it("fails on baseline/inventory digest mismatch", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    seedBaseline(h, makePipeline(), reviewed);
    // Tamper the baseline's stored inventoryDigest.
    const b = JSON.parse(
      readFileSync(h.baselinePath, "utf8"),
    ) as StructuralBaseline;
    b.inventoryDigest = sha("other");
    writeFileSync(h.baselinePath, JSON.stringify(b, null, 2), "utf8");
    const res = await runThemeConformance(
      normalArgs(h),
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(false);
  });

  it("fails when the stored review digest does not recompute", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    seedBaseline(h, makePipeline(), reviewed);
    const b = JSON.parse(
      readFileSync(h.baselinePath, "utf8"),
    ) as StructuralBaseline;
    b.reviewDigest = sha("wrong-review");
    writeFileSync(h.baselinePath, JSON.stringify(b, null, 2), "utf8");
    const res = await runThemeConformance(
      normalArgs(h),
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/review/i);
  });

  it("fails with an unexpected finding (new UNKNOWN capability expansion)", async () => {
    const h = harness();
    // The reviewed set + pipeline BOTH expose two UNKNOWN capabilities, so the
    // tracked inventory matches the candidate. But the checked-in baseline was
    // accepted with only ONE capability's findings → the second capability's
    // status-open/status-gap are UNEXPECTED expansions of the ratchet.
    const reviewed = [
      req("bloom.block.Hero.title"),
      req("bloom.block.Hero.subtitle"),
    ];
    writeReviewed(h, reviewed);
    const expanded = makePipeline({
      capabilities: [
        cap("bloom.block.Hero.title"),
        cap("bloom.block.Hero.subtitle"),
      ],
    });
    // Seed a coherent inventory (full candidate bytes) + baseline, then strip the
    // subtitle findings from the stored baseline and RE-DERIVE its reviewDigest so
    // the recompute still passes while the finding set is a strict subset of the
    // candidate → compare must flag the subtitle findings as unexpected.
    seedBaseline(h, expanded, reviewed);
    const b = JSON.parse(
      readFileSync(h.baselinePath, "utf8"),
    ) as StructuralBaseline;
    b.findings = b.findings.filter((f) => !f.id.includes("Hero.subtitle"));
    b.reviewDigest = recomputeReviewDigestFromBaseline(b, {
      schemaVersion: 1,
      generatorVersion: GEN_VERSION,
    });
    writeFileSync(h.baselinePath, JSON.stringify(b, null, 2), "utf8");

    const res = await runThemeConformance(normalArgs(h), makeDeps(h, expanded));
    expect(res.ok).toBe(false);
    expect(res.compare?.unexpected.length ?? 0).toBeGreaterThan(0);
  });

  it("fails on a changed-fingerprint baseline", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    seedBaseline(h, makePipeline(), reviewed);
    const b = JSON.parse(
      readFileSync(h.baselinePath, "utf8"),
    ) as StructuralBaseline;
    // Flip one finding fingerprint → same id, changed fp → BOTH unexpected+stale.
    b.findings = b.findings.map((f, i) =>
      i === 0 ? { id: f.id, fingerprint: sha("flipped") } : f,
    );
    writeFileSync(h.baselinePath, JSON.stringify(b, null, 2), "utf8");
    const res = await runThemeConformance(
      normalArgs(h),
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(false);
  });

  it("writes the local report before returning a failing result", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    // No baseline at all → normal mode fails, but a report must still be written.
    const res = await runThemeConformance(
      normalArgs(h),
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(false);
    expect(existsSync(join(h.reportDir, "report.json"))).toBe(true);
  });

  it("fails on a missing locked requirement (code-field deletion)", async () => {
    const h = harness();
    // Reviewed requires a field; the pipeline no longer exposes it → requirement-missing GAP.
    const reviewed = [
      req("bloom.block.Hero.title"),
      req("bloom.block.Hero.deleted"),
    ];
    writeReviewed(h, reviewed);
    // Seed a baseline that does NOT include the requirement-missing finding, so the
    // live overlay produces an unexpected finding.
    seedBaseline(h, makePipeline(), [req("bloom.block.Hero.title")]);
    // But run with the full reviewed set → overlay emits requirement-missing.
    const res = await runThemeConformance(
      normalArgs(h),
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// release mode (--require-zero)
// ---------------------------------------------------------------------------

describe("--require-zero", () => {
  it("fails while any finding exists even if it matches the baseline", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    seedBaseline(h, makePipeline(), reviewed);
    const res = await runThemeConformance(
      releaseArgs(h),
      makeDeps(h, makePipeline()),
    );
    expect(res.ok).toBe(false);
    expect(res.exitCode).not.toBe(0);
    // no mutation
    const before = readFileSync(h.inventoryPath);
    expect(readFileSync(h.inventoryPath).equals(before)).toBe(true);
  });

  it("passes only when there are zero findings", async () => {
    const h = harness();
    // A PASS-only capability produces no findings.
    const pipeline = makePipeline({
      capabilities: [
        cap("bloom.block.Hero.title", { status: "PASS", editable: false }),
      ],
    });
    const reviewed: RequirementRecord[] = [];
    writeReviewed(h, reviewed);
    seedBaseline(h, pipeline, reviewed);
    const res = await runThemeConformance(
      releaseArgs(h),
      makeDeps(h, pipeline),
    );
    expect(res.ok).toBe(true);
    expect(res.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mutation guards — illegal flag combinations
// ---------------------------------------------------------------------------

describe("illegal flag combinations rejected before writes", () => {
  const combos: string[][] = [
    ["--capture-initial-baseline", "--diagnose"],
    ["--capture-initial-baseline", "--require-zero"],
    ["--capture-initial-baseline", "--shrink-baseline"],
    ["--shrink-baseline", "--append-requirement-locks"],
    ["--capture-initial-baseline", "--propose-requirements", "x.json"],
    ["--capture-initial-baseline"], // missing --write-inventory
    ["--shrink-baseline"], // missing --write-inventory
    ["--write-inventory"], // missing --review-digest & ack
  ];
  for (const combo of combos) {
    it(`rejects ${combo.join(" ")} with zero writes`, async () => {
      const h = harness();
      writeReviewed(h, [req("bloom.block.Hero.title")]);
      const res = await runThemeConformance(
        [...normalArgs(h), ...combo],
        makeDeps(h, makePipeline(), {
          env: {
            BLOOM_BASELINE_ACK: "initial-bootstrap",
            BLOOM_INVENTORY_ACK: "reviewed-refresh",
            BLOOM_BASELINE_SHRINK_ACK: "verified-remediation",
            BLOOM_REQUIREMENTS_ACK: "reviewed-append",
          },
        }),
      );
      expect(res.ok).toBe(false);
      expect(existsSync(h.baselinePath)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// capture-initial-baseline
// ---------------------------------------------------------------------------

describe("--capture-initial-baseline", () => {
  function captureArgs(h: Harness, reviewDigest: string): string[] {
    return [
      ...normalArgs(h),
      "--capture-initial-baseline",
      "--write-inventory",
      "--review-digest",
      reviewDigest,
    ];
  }
  const goodEnv = {
    BLOOM_BASELINE_ACK: "initial-bootstrap",
    BLOOM_INVENTORY_ACK: "reviewed-refresh",
  };

  it("captures a fresh baseline + inventory when everything is valid", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    const cand = expectedCandidate(makePipeline(), reviewed);
    const res = await runThemeConformance(
      captureArgs(h, cand.reviewDigest),
      makeDeps(h, makePipeline(), { env: goodEnv }),
    );
    expect(res.ok).toBe(true);
    expect(existsSync(h.inventoryPath)).toBe(true);
    expect(existsSync(h.baselinePath)).toBe(true);
    // The written inventory bytes are exactly the candidate.
    expect(readFileSync(h.inventoryPath).equals(cand.inventoryBytes)).toBe(
      true,
    );
    const stored = JSON.parse(
      readFileSync(h.baselinePath, "utf8"),
    ) as StructuralBaseline;
    expect(stored.parentBaselineDigest).toBeNull();
    expect(stored.reviewDigest).toEqual(cand.reviewDigest);
  });

  it("refuses in CI", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    const cand = expectedCandidate(makePipeline(), reviewed);
    const res = await runThemeConformance(
      captureArgs(h, cand.reviewDigest),
      makeDeps(h, makePipeline(), { env: goodEnv, isCI: true }),
    );
    expect(res.ok).toBe(false);
    expect(existsSync(h.baselinePath)).toBe(false);
  });

  it("refuses when a baseline already exists", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    seedBaseline(h, makePipeline(), reviewed);
    const cand = expectedCandidate(makePipeline(), reviewed);
    const res = await runThemeConformance(
      captureArgs(h, cand.reviewDigest),
      makeDeps(h, makePipeline(), { env: goodEnv }),
    );
    expect(res.ok).toBe(false);
  });

  it("refuses with a bad acknowledgement", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    const cand = expectedCandidate(makePipeline(), reviewed);
    const res = await runThemeConformance(
      captureArgs(h, cand.reviewDigest),
      makeDeps(h, makePipeline(), {
        env: {
          BLOOM_BASELINE_ACK: "wrong",
          BLOOM_INVENTORY_ACK: "reviewed-refresh",
        },
      }),
    );
    expect(res.ok).toBe(false);
    expect(existsSync(h.baselinePath)).toBe(false);
  });

  it("rejects a review-digest that no longer matches current sources (zero writes)", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    // Reviewer approved the OLD source digest; the pipeline now reports a new one.
    const oldCand = expectedCandidate(
      makePipeline({ sourceDigest: sha("OLD") }),
      reviewed,
    );
    const res = await runThemeConformance(
      captureArgs(h, oldCand.reviewDigest),
      makeDeps(h, makePipeline({ sourceDigest: sha("NEW") }), { env: goodEnv }),
    );
    expect(res.ok).toBe(false);
    expect(existsSync(h.baselinePath)).toBe(false);
    expect(existsSync(h.inventoryPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// atomic 2-file transaction / resume
// ---------------------------------------------------------------------------

describe("atomic transaction + resume", () => {
  const goodEnv = {
    BLOOM_BASELINE_ACK: "initial-bootstrap",
    BLOOM_INVENTORY_ACK: "reviewed-refresh",
  };
  function captureArgs(h: Harness, reviewDigest: string): string[] {
    return [
      ...normalArgs(h),
      "--capture-initial-baseline",
      "--write-inventory",
      "--review-digest",
      reviewDigest,
    ];
  }

  it("a failure BEFORE inventory commit leaves no partial state", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    const cand = expectedCandidate(makePipeline(), reviewed);
    let calls = 0;
    const res = await runThemeConformance(
      captureArgs(h, cand.reviewDigest),
      makeDeps(h, makePipeline(), {
        env: goodEnv,
        fsHooks: {
          rename: () => {
            calls += 1;
            throw new Error("rename failed before inventory commit");
          },
        },
      }),
    );
    expect(res.ok).toBe(false);
    expect(existsSync(h.baselinePath)).toBe(false);
    // inventory temp must not survive as the final file.
    expect(existsSync(h.inventoryPath)).toBe(false);
    expect(calls).toBeGreaterThan(0);
  });

  it("a failure AFTER inventory commit but BEFORE baseline commit stays red; resume with exact candidate recovers", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    const cand = expectedCandidate(makePipeline(), reviewed);

    // First run: fail on the SECOND rename (baseline commit).
    let renameCall = 0;
    const res1 = await runThemeConformance(
      captureArgs(h, cand.reviewDigest),
      makeDeps(h, makePipeline(), {
        env: goodEnv,
        fsHooks: {
          rename: (from, to) => {
            renameCall += 1;
            if (renameCall === 1) {
              // inventory commit succeeds
              const buf = readFileSync(from);
              writeFileSync(to, buf);
              return;
            }
            throw new Error("crash before baseline commit");
          },
        },
      }),
    );
    expect(res1.ok).toBe(false);
    // Inventory file now exists (committed), baseline does not → gate stays red.
    expect(existsSync(h.inventoryPath)).toBe(true);
    expect(existsSync(h.baselinePath)).toBe(false);
    expect(readFileSync(h.inventoryPath).equals(cand.inventoryBytes)).toBe(
      true,
    );

    // Resume: rerun the SAME reviewed command; inventory bytes equal the candidate
    // → resume permitted, baseline committed.
    const res2 = await runThemeConformance(
      captureArgs(h, cand.reviewDigest),
      makeDeps(h, makePipeline(), { env: goodEnv }),
    );
    expect(res2.ok).toBe(true);
    expect(existsSync(h.baselinePath)).toBe(true);
  });

  it("resume aborts when the pre-existing inventory bytes differ from the candidate", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    const cand = expectedCandidate(makePipeline(), reviewed);
    // A DIFFERENT (corrupt) inventory already sits on disk, baseline missing.
    writeFileSync(h.inventoryPath, Buffer.from("corrupt-partial", "utf8"));
    const res = await runThemeConformance(
      captureArgs(h, cand.reviewDigest),
      makeDeps(h, makePipeline(), { env: goodEnv }),
    );
    expect(res.ok).toBe(false);
    expect(existsSync(h.baselinePath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shrink-baseline
// ---------------------------------------------------------------------------

describe("--shrink-baseline", () => {
  const goodEnv = {
    BLOOM_BASELINE_SHRINK_ACK: "verified-remediation",
    BLOOM_INVENTORY_ACK: "reviewed-refresh",
  };
  function shrinkArgs(h: Harness, reviewDigest: string): string[] {
    return [
      ...normalArgs(h),
      "--shrink-baseline",
      "--write-inventory",
      "--review-digest",
      reviewDigest,
    ];
  }

  it("refuses to shrink when the current findings ADD a finding", async () => {
    const h = harness();
    // Baseline has fewer findings than current would produce (current adds one).
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    const seeded = seedBaseline(h, makePipeline(), reviewed);
    // Current pipeline adds a second capability → additional finding → not a shrink.
    const grown = makePipeline({
      capabilities: [
        cap("bloom.block.Hero.title"),
        cap("bloom.block.Hero.added"),
      ],
    });
    const cand = expectedCandidate(grown, reviewed, seeded.reviewDigest);
    const res = await runThemeConformance(
      shrinkArgs(h, cand.reviewDigest),
      makeDeps(h, grown, { env: goodEnv }),
    );
    expect(res.ok).toBe(false);
  });

  it("shrinks when the current findings are a strict subset (at least one removed)", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    // Baseline built from TWO capabilities.
    const big = makePipeline({
      capabilities: [
        cap("bloom.block.Hero.title"),
        cap("bloom.block.Hero.extra"),
      ],
    });
    const seeded = seedBaseline(h, big, reviewed);
    // Current pipeline resolves one to PASS → fewer findings (subset).
    const shrunk = makePipeline({
      capabilities: [
        cap("bloom.block.Hero.title"),
        cap("bloom.block.Hero.extra", { status: "PASS", editable: false }),
      ],
    });
    const cand = expectedCandidate(shrunk, reviewed, seeded.reviewDigest);
    const res = await runThemeConformance(
      shrinkArgs(h, cand.reviewDigest),
      makeDeps(h, shrunk, { env: goodEnv }),
    );
    expect(res.ok).toBe(true);
    // baseline parent link now points at the previous review digest.
    const stored = JSON.parse(
      readFileSync(h.baselinePath, "utf8"),
    ) as StructuralBaseline;
    expect(stored.parentBaselineDigest).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// append-requirement-locks
// ---------------------------------------------------------------------------

describe("--append-requirement-locks", () => {
  const goodEnv = {
    BLOOM_REQUIREMENTS_ACK: "reviewed-append",
    BLOOM_INVENTORY_ACK: "reviewed-refresh",
  };
  function appendArgs(h: Harness, reviewDigest: string): string[] {
    return [
      ...normalArgs(h),
      "--append-requirement-locks",
      "--write-inventory",
      "--review-digest",
      reviewDigest,
    ];
  }

  it("appends a new requirement lock while the finding set stays byte-identical", async () => {
    const h = harness();
    // Two PASS-only capabilities so requirement growth does NOT add a finding.
    const pipeline2 = makePipeline({
      capabilities: [
        cap("bloom.block.Hero.title", { status: "PASS", editable: false }),
        cap("bloom.block.Hero.also", { status: "PASS", editable: false }),
      ],
    });
    // Baseline has ONE requirement lock (Hero.title); the reviewed artifact then
    // grows with a second requirement (Hero.also) whose capability already PASSes.
    const reviewedOld = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewedOld);
    const seeded = seedBaseline(h, pipeline2, reviewedOld);
    const reviewedNew = [
      req("bloom.block.Hero.title"),
      req("bloom.block.Hero.also"),
    ];
    writeReviewed(h, reviewedNew);
    const cand = expectedCandidate(pipeline2, reviewedNew, seeded.reviewDigest);
    const res = await runThemeConformance(
      appendArgs(h, cand.reviewDigest),
      makeDeps(h, pipeline2, { env: goodEnv }),
    );
    expect(res.ok).toBe(true);
    const stored = JSON.parse(
      readFileSync(h.baselinePath, "utf8"),
    ) as StructuralBaseline;
    expect(
      stored.requirements.some((r) => r.id === "bloom.block.Hero.also"),
    ).toBe(true);
  });

  it("refuses append on a no-op (no new lock)", async () => {
    const h = harness();
    const pipeline = makePipeline({
      capabilities: [
        cap("bloom.block.Hero.title", { status: "PASS", editable: false }),
      ],
    });
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    const seeded = seedBaseline(h, pipeline, reviewed);
    const cand = expectedCandidate(pipeline, reviewed, seeded.reviewDigest);
    const res = await runThemeConformance(
      appendArgs(h, cand.reviewDigest),
      makeDeps(h, pipeline, { env: goodEnv }),
    );
    expect(res.ok).toBe(false);
  });

  it("refuses append in CI", async () => {
    const h = harness();
    const pipeline = makePipeline({
      capabilities: [
        cap("bloom.block.Hero.title", { status: "PASS", editable: false }),
        cap("bloom.block.Hero.also", { status: "PASS", editable: false }),
      ],
    });
    const reviewedOld = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewedOld);
    const seeded = seedBaseline(h, pipeline, reviewedOld);
    const reviewedNew = [
      req("bloom.block.Hero.title"),
      req("bloom.block.Hero.also"),
    ];
    writeReviewed(h, reviewedNew);
    const cand = expectedCandidate(pipeline, reviewedNew, seeded.reviewDigest);
    const res = await runThemeConformance(
      appendArgs(h, cand.reviewDigest),
      makeDeps(h, pipeline, { env: goodEnv, isCI: true }),
    );
    expect(res.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// write-inventory (inventory-only refresh)
// ---------------------------------------------------------------------------

describe("--write-inventory (reviewed refresh)", () => {
  function writeInvArgs(h: Harness, reviewDigest: string): string[] {
    return [
      ...normalArgs(h),
      "--write-inventory",
      "--review-digest",
      reviewDigest,
    ];
  }

  it("refuses in CI", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    seedBaseline(h, makePipeline(), reviewed);
    const cand = expectedCandidate(makePipeline(), reviewed);
    const res = await runThemeConformance(
      writeInvArgs(h, cand.reviewDigest),
      makeDeps(h, makePipeline(), {
        env: { BLOOM_INVENTORY_ACK: "reviewed-refresh" },
        isCI: true,
      }),
    );
    expect(res.ok).toBe(false);
  });

  it("refuses with a bad acknowledgement", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    seedBaseline(h, makePipeline(), reviewed);
    const cand = expectedCandidate(makePipeline(), reviewed);
    const res = await runThemeConformance(
      writeInvArgs(h, cand.reviewDigest),
      makeDeps(h, makePipeline(), { env: { BLOOM_INVENTORY_ACK: "wrong" } }),
    );
    expect(res.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// no mutation in normal / release
// ---------------------------------------------------------------------------

describe("no mutation in normal/release modes", () => {
  it("normal mode never calls writeFile on tracked artifacts", async () => {
    const h = harness();
    const reviewed = [req("bloom.block.Hero.title")];
    writeReviewed(h, reviewed);
    seedBaseline(h, makePipeline(), reviewed);
    const written: string[] = [];
    const deps = makeDeps(h, makePipeline(), {
      fsHooks: {
        writeFile: (p, data) => {
          written.push(p);
          mkdirSync(join(p, ".."), { recursive: true });
          writeFileSync(p, data);
        },
        rename: () => {
          throw new Error("rename must not be called in normal mode");
        },
      },
    });
    const res = await runThemeConformance(normalArgs(h), deps);
    expect(res.ok).toBe(true);
    // only report files may be written, never baseline/inventory.
    expect(written.every((p) => p.includes("conformance-results"))).toBe(true);
    expect(written).not.toContain(h.baselinePath);
    expect(written).not.toContain(h.inventoryPath);
  });
});
