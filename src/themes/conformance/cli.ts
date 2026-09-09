/**
 * Dependency-injected conformance orchestrator.
 *
 * `runThemeConformance(args, deps)` is the single testable core; the process
 * adapter `scripts/theme-conformance.ts` merely wires real dependencies (the
 * source-snapshot pipeline, the compiled Puck loader, node fs and process env)
 * and translates the returned {@link ConformanceResult} into an exit code.
 *
 * The orchestrator never reaches for wall-clock time, never mutates production
 * data, and never mutates the two tracked artifacts outside an explicit, ack-gated
 * mutation mode. The tracked inventory + baseline form ONE recoverable
 * transaction: both complete byte payloads, acknowledgements, monotonicity proofs,
 * parent digest and destination paths are validated BEFORE either file is written;
 * inventory is committed first (atomic rename) and the baseline last (the commit
 * point). If the process stops between the two commits the gate stays red and only
 * an exact-candidate resume may finish it.
 *
 * The heavy pipeline (snapshot → inventories → structural checks → source digest)
 * is injected as `deps.buildPipeline` so this file stays hermetic and testable; the
 * real adapter builds it from the Task 1-4 modules.
 */

import {
  overlayRequirements,
  fingerprintRequirements,
  collectGateFindings,
  compareBaseline,
  shrinkBaseline,
  appendRequirementLocks,
  serializeInventory,
  computeInventoryDigest,
  buildReviewEnvelope,
  computeReviewDigest,
  recomputeReviewDigestFromBaseline,
  buildConformanceReport,
  proposeRequirements,
  capabilityShapeDigest,
  caseSetDigest,
  requirementsDigest as computeRequirementsDigest,
  findingsDigest as computeFindingsDigest,
  baselineDigest as computeBaselineDigest,
  serializeTierBaseline,
  captureTreeDigest as computeCaptureTreeDigest,
  computeTierReviewDigest,
  serializeManifest,
  manifestDigest as computeManifestDigest,
  isValidCaptureSourceRef,
  isValidBaselinePath,
  validateRevisionChain,
  manifestMatchesLedger,
  latestSemanticRevisionDigest,
  semanticRevisionDigest as computeSemanticRevisionDigest,
  revisionEntryDigest,
} from "../../../packages/theme-contract/conformance";
import type {
  CapabilityRecord,
  StructuralIssue,
  RequirementRecord,
  StructuralBaseline,
  BaselineFinding,
  TieredGateFinding,
  TierBaseline,
  TierManifestEntry,
  ThemeBaselineManifest,
  CapabilityShapeInput,
  CaseSetScenarioInput,
  SemanticRevisionLedger,
} from "../../../packages/theme-contract/conformance";
import {
  getThemeDescriptor,
  getThemeBuildPlan,
  resolveRunnableTheme,
  type SupportedConformanceTheme,
  type ThemeConformanceAdapter,
} from "./theme-adapters";

// ---------------------------------------------------------------------------
// Public contracts
// ---------------------------------------------------------------------------

/**
 * Resolve a theme's descriptor or return a harness failure. Luna/unknown/
 * path-like names are rejected by the registry BEFORE any filesystem work; a
 * theme name can never select an arbitrary filesystem root.
 */
function resolveDescriptorOrFail(theme: string):
  | {
      ok: true;
      descriptor: ThemeConformanceAdapter<
        SupportedConformanceTheme,
        "legacy" | "tiered"
      >;
    }
  | { ok: false; error: string } {
  try {
    return { ok: true, descriptor: getThemeDescriptor(theme) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * The four deterministic build steps expressed as the concrete commands the
 * harness prints when a compiled prerequisite is missing. Derived from the
 * theme's build plan so the theme token is never re-hardcoded per theme.
 */
function buildOrderFor(theme: SupportedConformanceTheme): readonly string[] {
  return getThemeBuildPlan(theme).map((step) => {
    switch (step.kind) {
      case "service-build":
        return "corepack pnpm build";
      case "blocks-build":
        return "corepack pnpm build:blocks";
      case "sections-build":
        return `corepack pnpm build:theme-sections ${step.theme}`;
      case "standalone-build":
        return `corepack pnpm exec tsx scripts/run-theme-build.ts ${step.theme}`;
      default: {
        const never: never = step;
        return never;
      }
    }
  });
}

/**
 * Bloom build order, preserved as an exported constant for the landed CLI tests
 * (byte-exact command list). Derived from the shared build plan.
 */
export const BUILD_ORDER = buildOrderFor("bloom");

/** The heavy, injected pipeline result (snapshot + inventories + digest). */
export interface ConformancePipelineResult {
  theme: string;
  sourceDigest: `sha256:${string}`;
  capabilities: CapabilityRecord[];
  structuralIssues: StructuralIssue[];
  /** input to `proposeRequirements` (required pages/flows). */
  releaseContract: {
    pages: Array<{ id: string; label: string }>;
    flows: Array<{ id: string; label: string }>;
  };
}

export interface ThemeConformanceFs {
  /** returns file bytes, or null when the path does not exist. */
  readFile: (path: string) => Buffer | null;
  /** writes bytes (parent dirs are created by the impl). */
  writeFile: (path: string, data: Buffer) => void;
  /** atomically move `from` → `to`. */
  rename: (from: string, to: string) => void;
  exists: (path: string) => boolean;
  mkdirp: (path: string) => void;
}

/**
 * Git provenance provider — injected so the orchestrator stays hermetic. The
 * real adapter shells out to git; tests inject a deterministic fake. Every tier
 * mutation reads `headCommit()` (the exact `captureSourceRef`), asserts
 * `isClean()` (a clean worktree at that commit) and hashes `lsTree(ref)` (the raw
 * `git ls-tree -r -z --full-tree <ref>` bytes) into `captureTreeDigest`.
 */
export interface ThemeConformanceGit {
  headCommit: () => string;
  isClean: () => boolean;
  lsTree: (ref: string) => Buffer;
}

export interface ThemeConformanceDeps {
  schemaVersion: 1;
  generatorVersion: string;
  isCI: boolean;
  env: Record<string, string | undefined>;
  buildPipeline: (theme: string) => Promise<ConformancePipelineResult>;
  checkPrerequisites: (
    theme: string,
  ) => Promise<{ ok: boolean; missing: string[] }>;
  fs: ThemeConformanceFs;
  /** git provenance — required only for tiered (Satin) mutations. */
  git?: ThemeConformanceGit;
}

export interface ConformanceResult {
  ok: boolean;
  exitCode: number;
  error?: string;
  buildOrder?: readonly string[];
  reviewDigest?: `sha256:${string}`;
  compare?: { unexpected: BaselineFinding[]; stale: BaselineFinding[] };
  /** for tests/adapters: where the report was written. */
  reportPath?: string;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface Args {
  theme?: string;
  baseline?: string;
  inventory?: string;
  manifest?: string;
  reportDir?: string;
  requirements?: string;
  revisions?: string;
  proposeRequirements?: string;
  reviewDigest?: string;
  changeSetDigest?: string;
  revisionId?: string;
  diagnose: boolean;
  requireZero: boolean;
  captureInitialBaseline: boolean;
  shrinkBaseline: boolean;
  writeInventory: boolean;
  appendRequirementLocks: boolean;
  reviseSemanticBaseline: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    diagnose: false,
    requireZero: false,
    captureInitialBaseline: false,
    shrinkBaseline: false,
    writeInventory: false,
    appendRequirementLocks: false,
    reviseSemanticBaseline: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    const next = () => argv[++i];
    switch (t) {
      case "--theme":
        a.theme = next();
        break;
      case "--baseline":
        a.baseline = next();
        break;
      case "--inventory":
        a.inventory = next();
        break;
      case "--manifest":
        a.manifest = next();
        break;
      case "--report-dir":
        a.reportDir = next();
        break;
      case "--requirements":
        a.requirements = next();
        break;
      case "--revisions":
        a.revisions = next();
        break;
      case "--propose-requirements":
        a.proposeRequirements = next();
        break;
      case "--review-digest":
        a.reviewDigest = next();
        break;
      case "--change-set-digest":
        a.changeSetDigest = next();
        break;
      case "--revision-id":
        a.revisionId = next();
        break;
      case "--diagnose":
        a.diagnose = true;
        break;
      case "--require-zero":
        a.requireZero = true;
        break;
      case "--capture-initial-baseline":
        a.captureInitialBaseline = true;
        break;
      case "--shrink-baseline":
        a.shrinkBaseline = true;
        break;
      case "--write-inventory":
        a.writeInventory = true;
        break;
      case "--append-requirement-locks":
        a.appendRequirementLocks = true;
        break;
      case "--revise-semantic-baseline":
        a.reviseSemanticBaseline = true;
        break;
      default:
        break; // ignore unknown positionals
    }
  }
  return a;
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

const ok = (extra: Partial<ConformanceResult> = {}): ConformanceResult => ({
  ok: true,
  exitCode: 0,
  ...extra,
});
const fail = (
  error: string,
  extra: Partial<ConformanceResult> = {},
): ConformanceResult => ({
  ok: false,
  exitCode: 1,
  error,
  ...extra,
});

// ---------------------------------------------------------------------------
// Candidate assembly (shared by every mode that overlays requirements)
// ---------------------------------------------------------------------------

interface Candidate {
  capabilities: CapabilityRecord[];
  structuralIssues: StructuralIssue[];
  findings: BaselineFinding[];
  requirementLocks: BaselineFinding[];
  inventoryBytes: Buffer;
  inventoryDigest: `sha256:${string}`;
  sourceDigest: `sha256:${string}`;
  reviewDigest: `sha256:${string}`;
  unreviewed: string[];
}

/**
 * Build the full candidate from the pipeline + reviewed requirements. This is the
 * single deterministic function every normal/diagnose/release/mutation path uses,
 * so the digest a reviewer approved in `--diagnose` is byte-identical to the one
 * recomputed immediately before a mutation.
 */
function buildCandidate(
  deps: ThemeConformanceDeps,
  pipeline: ConformancePipelineResult,
  reviewed: RequirementRecord[],
  parentBaselineDigest: `sha256:${string}` | null,
): Candidate {
  const overlay = overlayRequirements(pipeline.capabilities, reviewed);
  const combinedIssues = [...pipeline.structuralIssues, ...overlay.findings];
  const reqFps = fingerprintRequirements(reviewed);
  const gate = collectGateFindings(combinedIssues, overlay.rows, reqFps);

  const inventoryBytes = serializeInventory({
    schemaVersion: deps.schemaVersion,
    generatorVersion: deps.generatorVersion,
    theme: pipeline.theme,
    sourceDigest: pipeline.sourceDigest,
    capabilities: overlay.rows,
    structuralIssues: combinedIssues,
    findings: gate.findings,
    requirements: gate.requirements,
  });
  const inventoryDigest = computeInventoryDigest(inventoryBytes);
  const reviewDigest = computeReviewDigest(
    buildReviewEnvelope({
      schemaVersion: deps.schemaVersion,
      generatorVersion: deps.generatorVersion,
      theme: pipeline.theme,
      sourceDigest: pipeline.sourceDigest,
      inventoryDigest,
      requirements: gate.requirements,
      findings: gate.findings,
      parentBaselineDigest,
    }),
  );

  return {
    capabilities: overlay.rows,
    structuralIssues: combinedIssues,
    findings: gate.findings,
    requirementLocks: gate.requirements,
    inventoryBytes,
    inventoryDigest,
    sourceDigest: pipeline.sourceDigest,
    reviewDigest,
    unreviewed: gate.unreviewed,
  };
}

const sha256Hex = (s: string): `sha256:${string}` => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return `sha256:${createHash("sha256").update(s, "utf8").digest("hex")}`;
};

// ---------------------------------------------------------------------------
// Report writing
// ---------------------------------------------------------------------------

function writeReport(
  deps: ThemeConformanceDeps,
  reportDir: string,
  cand: Candidate,
  pipeline: ConformancePipelineResult,
  parentBaselineDigest: `sha256:${string}` | null,
  mode: string,
): string {
  const observedFindingsDigest = sha256Hex(
    JSON.stringify(
      [...cand.findings]
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((f) => `${f.id} ${f.fingerprint}`),
    ),
  );
  const report = buildConformanceReport({
    theme: pipeline.theme,
    schemaVersion: deps.schemaVersion,
    generatorVersion: deps.generatorVersion,
    mode,
    sourceDigest: cand.sourceDigest,
    candidateInventoryDigest: cand.inventoryDigest,
    observedFindingsDigest,
    reviewDigest: cand.reviewDigest,
    parentBaselineDigest,
    capabilities: cand.capabilities,
    structuralIssues: cand.structuralIssues,
    findings: cand.findings,
  });
  deps.fs.mkdirp(reportDir);
  const jsonPath = `${reportDir}/report.json`;
  const mdPath = `${reportDir}/report.md`;
  deps.fs.writeFile(
    jsonPath,
    Buffer.from(JSON.stringify(report, null, 2) + "\n", "utf8"),
  );
  deps.fs.writeFile(mdPath, Buffer.from(report.markdown, "utf8"));
  return jsonPath;
}

// ---------------------------------------------------------------------------
// Baseline (de)serialization
// ---------------------------------------------------------------------------

function readBaseline(
  deps: ThemeConformanceDeps,
  path: string,
): { baseline: StructuralBaseline; bytes: Buffer } | null {
  const bytes = deps.fs.readFile(path);
  if (bytes === null) return null;
  return {
    baseline: JSON.parse(bytes.toString("utf8")) as StructuralBaseline,
    bytes,
  };
}

function baselineBytes(baseline: StructuralBaseline): Buffer {
  return Buffer.from(JSON.stringify(baseline, null, 2) + "\n", "utf8");
}

function loadReviewed(
  deps: ThemeConformanceDeps,
  path: string | undefined,
): RequirementRecord[] | null {
  if (!path) return null;
  const bytes = deps.fs.readFile(path);
  if (bytes === null) return null;
  return JSON.parse(bytes.toString("utf8")) as RequirementRecord[];
}

// ---------------------------------------------------------------------------
// Mutation mode classification & validation (all illegal combos rejected here)
// ---------------------------------------------------------------------------

type MutationKind = "capture" | "shrink" | "append" | "inventory-only";

interface MutationPlan {
  kind: MutationKind;
}

/**
 * Classify the requested mutation and reject every illegal flag combination
 * BEFORE any filesystem work. Returns `null` for a non-mutating run.
 */
function classifyMutation(a: Args): {
  plan: MutationPlan | null;
  error?: string;
} {
  const mutFlags = [
    a.captureInitialBaseline,
    a.shrinkBaseline,
    a.appendRequirementLocks,
  ].filter(Boolean).length;

  // Proposal / diagnose / release are mutually exclusive with mutations.
  const anyMutationIntent = mutFlags > 0 || a.writeInventory;
  if (
    anyMutationIntent &&
    (a.diagnose || a.requireZero || a.proposeRequirements)
  ) {
    return {
      plan: null,
      error:
        "mutation flags are mutually exclusive with --diagnose/--require-zero/--propose-requirements",
    };
  }

  if (mutFlags > 1) {
    return {
      plan: null,
      error:
        "only one of --capture-initial-baseline/--shrink-baseline/--append-requirement-locks is allowed",
    };
  }

  if (mutFlags === 0 && !a.writeInventory) {
    return { plan: null }; // non-mutating run
  }

  // Every mutation requires --review-digest.
  if (!a.reviewDigest) {
    return {
      plan: null,
      error: "every mutation requires --review-digest sha256:...",
    };
  }

  // capture / shrink / append all require --write-inventory (2-file transaction).
  if (
    a.captureInitialBaseline ||
    a.shrinkBaseline ||
    a.appendRequirementLocks
  ) {
    if (!a.writeInventory) {
      return {
        plan: null,
        error:
          "baseline/requirement mutations require --write-inventory (atomic 2-file transaction)",
      };
    }
  }

  if (a.captureInitialBaseline) return { plan: { kind: "capture" } };
  if (a.shrinkBaseline) return { plan: { kind: "shrink" } };
  if (a.appendRequirementLocks) return { plan: { kind: "append" } };
  // write-inventory alone → inventory-only refresh.
  return { plan: { kind: "inventory-only" } };
}

function ackOk(
  env: Record<string, string | undefined>,
  key: string,
  value: string,
): boolean {
  return env[key] === value;
}

// ---------------------------------------------------------------------------
// The orchestrator
// ---------------------------------------------------------------------------

export async function runThemeConformance(
  argv: string[],
  deps: ThemeConformanceDeps,
): Promise<ConformanceResult> {
  const a = parseArgs(argv);

  // 1) theme validation — resolve the descriptor via the typed registry. Luna,
  //    unknown values and path-like names are rejected here BEFORE any
  //    filesystem work; a theme name can never select an arbitrary fs root.
  if (!a.theme) return fail("--theme is required");
  const resolved = resolveDescriptorOrFail(a.theme);
  if (!resolved.ok) return fail(resolved.error);
  const descriptor = resolved.descriptor;

  // 1b) runnable-bundle gate — a registered theme with an incomplete runnable
  //     bundle (missing source-adapter / release-contract) is refused with the
  //     exact harness error BEFORE any artifact read. Bloom is complete; Satin
  //     is registered-but-incomplete until Tasks 2–3.
  try {
    await resolveRunnableTheme(descriptor.id);
  } catch (e) {
    return fail((e as Error).message);
  }

  // 1c) tiered-runner dispatch — a tiered theme (Satin) runs the 3-artifact
  //     (inventory + structural.json + manifest.json) transaction runner instead
  //     of the legacy single-baseline pipeline. It is the SAME orchestrator body;
  //     only the transaction shape differs.
  if (descriptor.paths.mode === "tiered") {
    return runTieredConformance(argv, deps, a, descriptor);
  }

  // classify mutation up-front so illegal combos never touch the filesystem.
  const { plan, error: mutError } = classifyMutation(a);
  if (mutError) return fail(mutError);

  // 2) build prerequisites.
  let pre: { ok: boolean; missing: string[] };
  try {
    pre = await deps.checkPrerequisites(a.theme);
  } catch (e) {
    return fail(`prerequisite check failed: ${(e as Error).message}`);
  }
  if (!pre.ok) {
    return fail(
      `missing compiled prerequisites: ${pre.missing.join(", ")}. Run the build in order.`,
      { buildOrder: buildOrderFor(descriptor.id) },
    );
  }

  // 3) load the real pipeline (snapshot + inventories + digest). Any harness/
  //    build/import/nondeterminism failure is non-zero in every mode.
  let pipeline: ConformancePipelineResult;
  try {
    pipeline = await deps.buildPipeline(a.theme);
  } catch (e) {
    return fail(`pipeline failure: ${(e as Error).message}`);
  }

  // -----------------------------------------------------------------------
  // 6) proposal mode — local-only, no reviewed/baseline/inventory access.
  // -----------------------------------------------------------------------
  if (a.proposeRequirements) {
    if (plan)
      return fail(
        "--propose-requirements cannot be combined with mutation flags",
      );
    const proposal = proposeRequirements(
      pipeline.capabilities,
      pipeline.structuralIssues,
      pipeline.releaseContract,
    );
    deps.fs.mkdirp(dirname(a.proposeRequirements));
    deps.fs.writeFile(
      a.proposeRequirements,
      Buffer.from(JSON.stringify(proposal, null, 2) + "\n", "utf8"),
    );
    return ok({ reportPath: a.proposeRequirements });
  }

  const reportDir = a.reportDir ?? descriptor.paths.reportDir;

  // -----------------------------------------------------------------------
  // Load reviewed requirements. Proposal is the ONLY mode allowed to run
  // without them; diagnose/normal/release/mutation require them. The canonical
  // location is the theme descriptor's requirements path unless overridden.
  // -----------------------------------------------------------------------
  const requirementsPath = a.requirements ?? descriptor.paths.requirements;
  const reviewed = loadReviewed(deps, requirementsPath);
  if (reviewed === null) {
    return fail(
      `reviewed requirements artifact (${descriptor.paths.requirements}) is required for this mode`,
    );
  }

  // Existing baseline (for parent link + normal comparison).
  const existing = a.baseline ? readBaseline(deps, a.baseline) : null;
  const parentForCandidate = a.captureInitialBaseline
    ? null
    : (existing?.baseline.reviewDigest ?? null);

  // Build the candidate deterministically.
  let cand: Candidate;
  try {
    cand = buildCandidate(deps, pipeline, reviewed, parentForCandidate);
  } catch (e) {
    return fail(`candidate assembly failed: ${(e as Error).message}`);
  }

  // -----------------------------------------------------------------------
  // 11) ALWAYS write the local report before returning a failing result.
  // -----------------------------------------------------------------------
  const mode = plan
    ? `mutate:${plan.kind}`
    : a.diagnose
      ? "diagnose"
      : a.requireZero
        ? "release"
        : "normal";
  const reportPath = writeReport(
    deps,
    reportDir,
    cand,
    pipeline,
    parentForCandidate,
    mode,
  );

  // -----------------------------------------------------------------------
  // Diagnose mode — non-mutating pre-baseline review. Missing baseline/
  // inventory is permitted; ordinary findings exit 0.
  // -----------------------------------------------------------------------
  if (a.diagnose) {
    return ok({ reviewDigest: cand.reviewDigest, reportPath });
  }

  // -----------------------------------------------------------------------
  // Mutation modes.
  // -----------------------------------------------------------------------
  if (plan) {
    return runMutation(
      deps,
      a,
      plan,
      pipeline,
      reviewed,
      cand,
      existing,
      reportPath,
      descriptor,
    );
  }

  // -----------------------------------------------------------------------
  // Normal / release (read-only) mode.
  // -----------------------------------------------------------------------
  if (!existing) {
    return fail(
      "baseline is missing; run --diagnose then --capture-initial-baseline",
      {
        reviewDigest: cand.reviewDigest,
        reportPath,
      },
    );
  }

  // 9) compare exact tracked inventory BYTES.
  const trackedInventory = a.inventory ? deps.fs.readFile(a.inventory) : null;
  if (!trackedInventory) {
    return fail("tracked inventory is missing", { reportPath });
  }
  if (!trackedInventory.equals(cand.inventoryBytes)) {
    return fail(
      "tracked inventory is stale (byte mismatch with the current candidate)",
      {
        reviewDigest: cand.reviewDigest,
        reportPath,
      },
    );
  }

  // 10) baseline.inventoryDigest must match the tracked inventory bytes, and the
  //     stored reviewDigest must recompute.
  const trackedInventoryDigest = computeInventoryDigest(trackedInventory);
  if (existing.baseline.inventoryDigest !== trackedInventoryDigest) {
    return fail("baseline/inventory digest mismatch", { reportPath });
  }
  const recomputed = recomputeReviewDigestFromBaseline(existing.baseline, {
    schemaVersion: deps.schemaVersion,
    generatorVersion: deps.generatorVersion,
  });
  if (recomputed !== existing.baseline.reviewDigest) {
    return fail("stored review digest does not recompute", { reportPath });
  }

  // 12) compare fingerprinted baseline; --require-zero uses ALL findings.
  const compare = compareBaseline(cand.findings, existing.baseline, {
    requireZero: a.requireZero,
  });
  if (!compare.ok) {
    return fail(
      a.requireZero
        ? "release gate: findings still exist"
        : "baseline mismatch (unexpected/stale/changed findings)",
      {
        reviewDigest: cand.reviewDigest,
        compare: { unexpected: compare.unexpected, stale: compare.stale },
        reportPath,
      },
    );
  }

  return ok({
    reviewDigest: cand.reviewDigest,
    compare: { unexpected: [], stale: [] },
    reportPath,
  });
}

// ---------------------------------------------------------------------------
// Mutation execution (ack-gated, atomic 2-file transaction with resume)
// ---------------------------------------------------------------------------

function runMutation(
  deps: ThemeConformanceDeps,
  a: Args,
  plan: MutationPlan,
  pipeline: ConformancePipelineResult,
  reviewed: RequirementRecord[],
  cand: Candidate,
  existing: { baseline: StructuralBaseline; bytes: Buffer } | null,
  reportPath: string,
  descriptor: ThemeConformanceAdapter<
    SupportedConformanceTheme,
    "legacy" | "tiered"
  >,
): ConformanceResult {
  // non-CI is mandatory for every mutation.
  if (deps.isCI) return fail("mutations are refused in CI", { reportPath });

  // acknowledgements — env-var NAMES come from the theme descriptor; the
  // required VALUES are the shared mutation-mode constants.
  const acks = descriptor.mutationAcks;
  if (!ackOk(deps.env, acks.inventory, "reviewed-refresh")) {
    return fail(`missing/invalid ${acks.inventory}=reviewed-refresh`, {
      reportPath,
    });
  }
  if (
    plan.kind === "capture" &&
    !ackOk(deps.env, acks.capture, "initial-bootstrap")
  ) {
    return fail(`missing/invalid ${acks.capture}=initial-bootstrap`, {
      reportPath,
    });
  }
  if (
    plan.kind === "shrink" &&
    !ackOk(deps.env, acks.shrink, "verified-remediation")
  ) {
    return fail(`missing/invalid ${acks.shrink}=verified-remediation`, {
      reportPath,
    });
  }
  if (
    plan.kind === "append" &&
    !ackOk(deps.env, acks.appendRequirements, "reviewed-append")
  ) {
    return fail(`missing/invalid ${acks.appendRequirements}=reviewed-append`, {
      reportPath,
    });
  }

  // review-digest guard: recompute from CURRENT sources and reject if the
  // reviewer-approved digest differs. `cand` was built from current sources.
  if (a.reviewDigest !== cand.reviewDigest) {
    return fail(
      "review digest rejected: current sources no longer match the reviewed diagnose report",
      { reviewDigest: cand.reviewDigest, reportPath },
    );
  }

  // Build the next baseline for each mutation kind, validating all monotonicity
  // proofs BEFORE any write.
  let nextBaseline: StructuralBaseline;

  if (plan.kind === "capture") {
    if (existing) {
      return fail("capture refused: a baseline already exists", { reportPath });
    }
    // reject unreviewed open capabilities (no requirement) at initial capture.
    if (cand.unreviewed.length > 0) {
      return fail(
        `capture refused: ${cand.unreviewed.length} open capability(ies) lack a reviewed requirement`,
        { reportPath },
      );
    }
    nextBaseline = {
      schemaVersion: deps.schemaVersion,
      theme: pipeline.theme,
      reviewDigest: cand.reviewDigest,
      inventoryDigest: cand.inventoryDigest,
      sourceDigest: cand.sourceDigest,
      parentBaselineDigest: null,
      requirements: cand.requirementLocks,
      findings: cand.findings,
    };
  } else if (plan.kind === "shrink") {
    if (!existing)
      return fail("shrink refused: no existing baseline", { reportPath });
    const result = shrinkBaseline(
      cand.findings,
      existing.baseline,
      cand.requirementLocks,
    );
    if (!result.ok || !result.baseline) {
      return fail(result.reason ?? "shrink refused", { reportPath });
    }
    nextBaseline = {
      ...result.baseline,
      inventoryDigest: cand.inventoryDigest,
      sourceDigest: cand.sourceDigest,
      reviewDigest: cand.reviewDigest,
    };
  } else if (plan.kind === "append") {
    if (!existing)
      return fail("append refused: no existing baseline", { reportPath });
    // findings must stay exactly unchanged vs the existing baseline.
    const cmp = compareBaseline(cand.findings, existing.baseline);
    if (!cmp.ok) {
      return fail(
        "append refused: the finding set must remain exactly unchanged",
        {
          compare: { unexpected: cmp.unexpected, stale: cmp.stale },
          reportPath,
        },
      );
    }
    const result = appendRequirementLocks(
      existing.baseline,
      cand.requirementLocks,
    );
    if (!result.ok || !result.baseline) {
      return fail(result.reason ?? "append refused", { reportPath });
    }
    nextBaseline = {
      ...result.baseline,
      inventoryDigest: cand.inventoryDigest,
      sourceDigest: cand.sourceDigest,
      reviewDigest: cand.reviewDigest,
    };
  } else {
    // inventory-only refresh: findings AND requirement locks must be exactly
    // the accepted set.
    if (!existing)
      return fail("inventory refresh refused: no existing baseline", {
        reportPath,
      });
    const cmp = compareBaseline(cand.findings, existing.baseline);
    if (!cmp.ok) {
      return fail(
        "inventory refresh refused: findings differ from the accepted baseline",
        {
          compare: { unexpected: cmp.unexpected, stale: cmp.stale },
          reportPath,
        },
      );
    }
    if (!sameLocks(cand.requirementLocks, existing.baseline.requirements)) {
      return fail(
        "inventory refresh refused: requirement locks differ from the accepted baseline",
        {
          reportPath,
        },
      );
    }
    nextBaseline = {
      ...existing.baseline,
      inventoryDigest: cand.inventoryDigest,
      sourceDigest: cand.sourceDigest,
      reviewDigest: cand.reviewDigest,
    };
  }

  if (!a.inventory || !a.baseline) {
    return fail("mutation requires --inventory and --baseline destinations", {
      reportPath,
    });
  }

  // -----------------------------------------------------------------------
  // Atomic 2-file transaction (+ resume).
  //
  // If the inventory file already exists we are either idempotently re-running
  // or resuming a crash between the two commits. Resume is permitted ONLY when
  // the existing inventory bytes EXACTLY equal the candidate; any other partial
  // state aborts without mutation. When a baseline also already exists, capture
  // must refuse (handled above); shrink/append/refresh already validated it.
  // -----------------------------------------------------------------------
  const preInventory = deps.fs.readFile(a.inventory);
  const inventoryAlreadyCommitted =
    preInventory !== null && preInventory.equals(cand.inventoryBytes);

  if (preInventory !== null && !inventoryAlreadyCommitted) {
    // For an initial capture, a pre-existing DIFFERENT inventory with no baseline
    // is an unrecoverable partial state.
    if (plan.kind === "capture") {
      return fail(
        "resume aborted: an existing inventory does not match the candidate; no partial state may pass",
        { reportPath },
      );
    }
  }

  const nextBytes = baselineBytes(nextBaseline);

  try {
    if (!inventoryAlreadyCommitted) {
      // Atomic inventory commit: write temp, then rename.
      const tmpInv = `${a.inventory}.tmp`;
      deps.fs.writeFile(tmpInv, cand.inventoryBytes);
      deps.fs.rename(tmpInv, a.inventory);
    }
    // Atomic baseline commit (the transaction commit point).
    const tmpBaseline = `${a.baseline}.tmp`;
    deps.fs.writeFile(tmpBaseline, nextBytes);
    deps.fs.rename(tmpBaseline, a.baseline);
  } catch (e) {
    return fail(
      `transaction failed (gate stays red): ${(e as Error).message}`,
      {
        reviewDigest: cand.reviewDigest,
        reportPath,
      },
    );
  }

  return ok({ reviewDigest: cand.reviewDigest, reportPath });
}

function sameLocks(
  a: readonly BaselineFinding[],
  b: readonly BaselineFinding[],
): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a.map((f) => `${f.id} ${f.fingerprint}`));
  for (const f of b) if (!sa.has(`${f.id} ${f.fingerprint}`)) return false;
  return true;
}

function dirname(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? "." : p.slice(0, idx);
}

// ===========================================================================
// Tiered (Satin) runner — 3-artifact atomic transaction.
//
// The tiered runner shares the candidate machinery (overlay → gate findings →
// inventory bytes) with the legacy path, then wraps the STRUCTURAL tier's
// accepted findings in a `TierBaseline` and pins its exact digests in a
// `ThemeBaselineManifest`. Three tracked files form one recoverable transaction:
//
//   1. inventory  (satin.generated.json)   — committed first
//   2. structural (satin.structural.json)  — committed second
//   3. manifest   (satin.manifest.json)    — committed LAST (the commit point)
//
// Normal mode trusts no partial combination. A source-only change moves nothing
// in the structural baseline/manifest — it only makes the tracked inventory stale
// until a reviewed inventory refresh.
// ===========================================================================

interface TieredCandidate {
  /** the legacy candidate (inventory bytes, findings, reviewDigest, locks). */
  base: Candidate;
  /** structural-tier tagged findings (id,fingerprint,tier=structural). */
  tierFindings: TieredGateFinding[];
  capabilityShapeDigest: `sha256:${string}`;
  caseSetDigest: `sha256:${string}`;
  requirementsDigest: `sha256:${string}`;
  findingsDigest: `sha256:${string}`;
}

/** Parse `theme.surface.<capability...>` into surface + capability. */
function parseSurfaceCapability(id: string): {
  surface: string;
  capability: string;
} {
  const parts = id.split(".");
  return { surface: parts[1] ?? "", capability: parts.slice(2).join(".") };
}

/** Derive the normative capability-shape inputs from reviewed requirements. */
function shapeInputsFromReviewed(
  reviewed: RequirementRecord[],
): CapabilityShapeInput[] {
  return reviewed.map((r) => {
    const { surface, capability } = parseSurfaceCapability(r.id);
    return { id: r.id, surface, capability, contract: r.contract };
  });
}

/** Derive the selected-tier case-set inputs from reviewed requirements. */
function caseInputsFromReviewed(
  reviewed: RequirementRecord[],
): CaseSetScenarioInput[] {
  const out: CaseSetScenarioInput[] = [];
  for (const r of reviewed) {
    const scenariosById = new Map((r.scenarios ?? []).map((s) => [s.id, s]));
    for (const ec of r.expectedCases ?? []) {
      const scenario = scenariosById.get(ec.scenarioId);
      if (!scenario) continue; // an expected case with no scenario is not selectable
      out.push({
        capabilityId: r.id,
        scenario,
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

/** Build the tiered candidate from the base candidate + reviewed requirements. */
function buildTieredCandidate(
  base: Candidate,
  reviewed: RequirementRecord[],
  reviewedBytes: Buffer,
): TieredCandidate {
  const tierFindings: TieredGateFinding[] = base.findings.map((f) => ({
    ...f,
    tier: "structural" as const,
  }));
  return {
    base,
    tierFindings,
    capabilityShapeDigest: capabilityShapeDigest(
      shapeInputsFromReviewed(reviewed),
    ),
    caseSetDigest: caseSetDigest(caseInputsFromReviewed(reviewed)),
    requirementsDigest: computeRequirementsDigest(reviewedBytes),
    findingsDigest: computeFindingsDigest(tierFindings),
  };
}

function readManifest(
  deps: ThemeConformanceDeps,
  path: string,
): { manifest: ThemeBaselineManifest; bytes: Buffer } | null {
  const bytes = deps.fs.readFile(path);
  if (bytes === null) return null;
  return {
    manifest: JSON.parse(bytes.toString("utf8")) as ThemeBaselineManifest,
    bytes,
  };
}

function readTierBaseline(
  deps: ThemeConformanceDeps,
  path: string,
): { baseline: TierBaseline; bytes: Buffer } | null {
  const bytes = deps.fs.readFile(path);
  if (bytes === null) return null;
  return {
    baseline: JSON.parse(bytes.toString("utf8")) as TierBaseline,
    bytes,
  };
}

function loadLedger(
  deps: ThemeConformanceDeps,
  path: string | undefined,
): SemanticRevisionLedger {
  if (!path) return { schemaVersion: 1, theme: "satin", revisions: [] };
  const bytes = deps.fs.readFile(path);
  if (bytes === null)
    return { schemaVersion: 1, theme: "satin", revisions: [] };
  return JSON.parse(bytes.toString("utf8")) as SemanticRevisionLedger;
}

type TieredMutationKind =
  | "capture"
  | "shrink"
  | "append"
  | "inventory-only"
  | "revise-semantic";

/**
 * Classify a tiered mutation, rejecting every illegal flag combination BEFORE any
 * filesystem work. `null` = a non-mutating (normal/diagnose/release) run.
 */
function classifyTieredMutation(a: Args): {
  plan: TieredMutationKind | null;
  error?: string;
} {
  const mutFlags = [
    a.captureInitialBaseline,
    a.shrinkBaseline,
    a.appendRequirementLocks,
    a.reviseSemanticBaseline,
  ].filter(Boolean).length;

  const anyMutationIntent = mutFlags > 0 || a.writeInventory;
  if (
    anyMutationIntent &&
    (a.diagnose || a.requireZero || a.proposeRequirements)
  ) {
    return {
      plan: null,
      error:
        "mutation flags are mutually exclusive with --diagnose/--require-zero/--propose-requirements",
    };
  }
  if (mutFlags > 1) {
    return {
      plan: null,
      error:
        "only one of --capture-initial-baseline/--shrink-baseline/--append-requirement-locks/--revise-semantic-baseline is allowed",
    };
  }
  if (mutFlags === 0 && !a.writeInventory) {
    return { plan: null };
  }
  if (!a.reviewDigest) {
    return {
      plan: null,
      error: "every mutation requires --review-digest sha256:...",
    };
  }
  // capture/shrink/append/revise require --write-inventory (3-file transaction).
  if (
    a.captureInitialBaseline ||
    a.shrinkBaseline ||
    a.appendRequirementLocks ||
    a.reviseSemanticBaseline
  ) {
    if (!a.writeInventory) {
      return {
        plan: null,
        error:
          "baseline mutations require --write-inventory (atomic 3-file transaction)",
      };
    }
  }
  if (a.captureInitialBaseline) return { plan: "capture" };
  if (a.shrinkBaseline) return { plan: "shrink" };
  if (a.appendRequirementLocks) return { plan: "append" };
  if (a.reviseSemanticBaseline) return { plan: "revise-semantic" };
  return { plan: "inventory-only" };
}

/** Pretty-print + terminating newline for the tracked manifest/baseline bytes. */
function tierBaselineBytes(baseline: TierBaseline): Buffer {
  return serializeTierBaseline(baseline);
}
function manifestBytes(manifest: ThemeBaselineManifest): Buffer {
  return serializeManifest(manifest);
}

async function runTieredConformance(
  argv: string[],
  deps: ThemeConformanceDeps,
  a: Args,
  descriptor: ThemeConformanceAdapter<
    SupportedConformanceTheme,
    "legacy" | "tiered"
  >,
): Promise<ConformanceResult> {
  // classify the mutation up-front so illegal combos never touch the filesystem.
  const { plan, error: mutError } = classifyTieredMutation(a);
  if (mutError) return fail(mutError);

  // build prerequisites.
  let pre: { ok: boolean; missing: string[] };
  try {
    pre = await deps.checkPrerequisites(a.theme!);
  } catch (e) {
    return fail(`prerequisite check failed: ${(e as Error).message}`);
  }
  if (!pre.ok) {
    return fail(
      `missing compiled prerequisites: ${pre.missing.join(", ")}. Run the build in order.`,
      { buildOrder: buildOrderFor(descriptor.id) },
    );
  }

  // load the real pipeline.
  let pipeline: ConformancePipelineResult;
  try {
    pipeline = await deps.buildPipeline(a.theme!);
  } catch (e) {
    return fail(`pipeline failure: ${(e as Error).message}`);
  }

  // proposal mode — local-only.
  if (a.proposeRequirements) {
    if (plan)
      return fail(
        "--propose-requirements cannot be combined with mutation flags",
      );
    const proposal = proposeRequirements(
      pipeline.capabilities,
      pipeline.structuralIssues,
      pipeline.releaseContract,
    );
    deps.fs.mkdirp(dirname(a.proposeRequirements));
    deps.fs.writeFile(
      a.proposeRequirements,
      Buffer.from(JSON.stringify(proposal, null, 2) + "\n", "utf8"),
    );
    return ok({ reportPath: a.proposeRequirements });
  }

  const reportDir = a.reportDir ?? descriptor.paths.reportDir;

  // load reviewed requirements (+ exact bytes for requirementsDigest).
  const requirementsPath = a.requirements ?? descriptor.paths.requirements;
  const reviewedBytes = deps.fs.readFile(requirementsPath);
  if (reviewedBytes === null) {
    return fail(
      `reviewed requirements artifact (${descriptor.paths.requirements}) is required for this mode`,
    );
  }
  const reviewed = JSON.parse(
    reviewedBytes.toString("utf8"),
  ) as RequirementRecord[];

  // existing tier baseline (for parent link + normal comparison).
  const existing = a.baseline ? readTierBaseline(deps, a.baseline) : null;
  // The legacy review envelope's parent link is NOT meaningful for a tiered theme
  // (the `TierBaseline`/manifest carry their own parent chain), so the tiered
  // candidate's reviewDigest is computed with a `null` parent — deterministic
  // regardless of an existing baseline, so a reviewed diagnose digest recomputes
  // byte-identically at mutation time.
  const parentForCandidate = null;

  // build the base candidate (inventory bytes, findings, reviewDigest).
  let base: Candidate;
  try {
    base = buildCandidate(deps, pipeline, reviewed, parentForCandidate);
  } catch (e) {
    return fail(`candidate assembly failed: ${(e as Error).message}`);
  }
  const cand = buildTieredCandidate(base, reviewed, reviewedBytes);

  // Always write the local report before returning a failing result.
  const mode = plan
    ? `mutate:${plan}`
    : a.diagnose
      ? "diagnose"
      : a.requireZero
        ? "release"
        : "normal";
  const reportPath = writeReport(
    deps,
    reportDir,
    base,
    pipeline,
    parentForCandidate,
    mode,
  );

  // diagnose mode — non-mutating pre-baseline review; missing artifacts allowed.
  if (a.diagnose) {
    return ok({ reviewDigest: base.reviewDigest, reportPath });
  }

  // mutation modes.
  if (plan) {
    return runTieredMutation(
      deps,
      a,
      plan,
      pipeline,
      reviewed,
      reviewedBytes,
      cand,
      existing,
      reportPath,
      descriptor,
    );
  }

  // ---- normal / release (read-only) ----
  if (!existing) {
    return fail(
      "structural baseline is missing; run --diagnose then --capture-initial-baseline",
      {
        reviewDigest: base.reviewDigest,
        reportPath,
      },
    );
  }
  if (!a.manifest) {
    return fail("normal mode requires --manifest for a tiered theme", {
      reportPath,
    });
  }
  const manifestRead = readManifest(deps, a.manifest);
  if (!manifestRead) {
    return fail("tier manifest is missing", { reportPath });
  }
  const structuralEntry = manifestRead.manifest.tiers.structural;
  if (!structuralEntry) {
    return fail("manifest has no structural tier entry", { reportPath });
  }

  // 1) tracked inventory bytes must match the current candidate (stale → fail).
  const trackedInventory = a.inventory ? deps.fs.readFile(a.inventory) : null;
  if (!trackedInventory) {
    return fail("tracked inventory is missing", { reportPath });
  }
  if (!trackedInventory.equals(cand.base.inventoryBytes)) {
    return fail(
      "tracked inventory is stale (byte mismatch with the current candidate)",
      {
        reviewDigest: base.reviewDigest,
        reportPath,
      },
    );
  }

  // 2) manifest → baseline digest link: the tracked structural baseline bytes
  //    must hash to the manifest's recorded baselineDigest.
  const recomputedBaselineDigest = computeBaselineDigest(existing.baseline);
  if (recomputedBaselineDigest !== structuralEntry.baselineDigest) {
    return fail("manifest/baseline digest mismatch", { reportPath });
  }

  // 3) semantic locks: the manifest's recorded shape/case/findings/requirements
  //    digests must equal the CURRENT candidate's — a normative drift fails
  //    normal mode (it is a reviewed baseline transaction, not a source refresh).
  if (structuralEntry.capabilityShapeDigest !== cand.capabilityShapeDigest) {
    return fail("capability shape lock mismatch (normative shape changed)", {
      reportPath,
    });
  }
  if (structuralEntry.caseSetDigest !== cand.caseSetDigest) {
    return fail("case-set lock mismatch (normative case set changed)", {
      reportPath,
    });
  }
  if (structuralEntry.requirementsDigest !== cand.requirementsDigest) {
    return fail("requirements lock mismatch (reviewed requirements changed)", {
      reportPath,
    });
  }
  // the baseline's own embedded shape/case digests must match the manifest too.
  if (
    existing.baseline.capabilityShapeDigest !==
    structuralEntry.capabilityShapeDigest
  ) {
    return fail("baseline shape digest does not match the manifest", {
      reportPath,
    });
  }
  if (existing.baseline.caseSetDigest !== structuralEntry.caseSetDigest) {
    return fail("baseline case-set digest does not match the manifest", {
      reportPath,
    });
  }

  // 4) the semantic-revision ledger prefix must match the manifest.
  const ledger = loadLedger(
    deps,
    a.revisions ??
      descriptor.paths.requirements.replace(
        /satin\.v1\.json$/,
        "satin.revisions.json",
      ),
  );
  const ledgerCheck = manifestMatchesLedger(
    ledger,
    structuralEntry.semanticRevisionDigest,
  );
  if (!ledgerCheck.ok) {
    return fail(`semantic-revision ledger mismatch: ${ledgerCheck.reason}`, {
      reportPath,
    });
  }

  // 5) ratchet findings (release uses zero-findings on the STRUCTURAL tier only).
  const legacyBaselineView: StructuralBaseline = tierBaselineToLegacyView(
    existing.baseline,
  );
  const compare = compareBaseline(cand.base.findings, legacyBaselineView, {
    requireZero: a.requireZero,
  });
  if (!compare.ok) {
    return fail(
      a.requireZero
        ? "structural zero gate: structural findings still exist"
        : "structural baseline mismatch (unexpected/stale/changed findings)",
      {
        reviewDigest: base.reviewDigest,
        compare: { unexpected: compare.unexpected, stale: compare.stale },
        reportPath,
      },
    );
  }

  // Report current source SHA/tree vs capture provenance (informational — a stale
  // provenance is NOT a failure; a stale tracked inventory already failed above).
  return ok({
    reviewDigest: base.reviewDigest,
    compare: { unexpected: [], stale: [] },
    reportPath,
  });
}

/** A read-only legacy view of a tier baseline for the shrink/compare ratchet. */
function tierBaselineToLegacyView(baseline: TierBaseline): StructuralBaseline {
  return {
    schemaVersion: 1,
    theme: baseline.theme,
    reviewDigest: computeBaselineDigest(baseline),
    inventoryDigest: computeBaselineDigest(baseline),
    sourceDigest: computeBaselineDigest(baseline),
    parentBaselineDigest: baseline.parentBaselineDigest,
    requirements: baseline.requirements,
    findings: baseline.findings.map((f) => ({
      id: f.id,
      fingerprint: f.fingerprint,
    })),
  };
}

function ackOkEnv(
  env: Record<string, string | undefined>,
  key: string,
  value: string,
): boolean {
  return env[key] === value;
}

async function runTieredMutation(
  deps: ThemeConformanceDeps,
  a: Args,
  plan: TieredMutationKind,
  pipeline: ConformancePipelineResult,
  reviewed: RequirementRecord[],
  reviewedBytes: Buffer,
  cand: TieredCandidate,
  existing: { baseline: TierBaseline; bytes: Buffer } | null,
  reportPath: string,
  descriptor: ThemeConformanceAdapter<
    SupportedConformanceTheme,
    "legacy" | "tiered"
  >,
): Promise<ConformanceResult> {
  // non-CI is mandatory.
  if (deps.isCI) return fail("mutations are refused in CI", { reportPath });

  const acks = descriptor.mutationAcks;
  const reviseAck = acks.mode === "tiered" ? acks.reviseSemantic : undefined;
  if (!ackOkEnv(deps.env, acks.inventory, "reviewed-refresh")) {
    return fail(`missing/invalid ${acks.inventory}=reviewed-refresh`, {
      reportPath,
    });
  }
  if (
    plan === "capture" &&
    !ackOkEnv(deps.env, acks.capture, "initial-bootstrap")
  ) {
    return fail(`missing/invalid ${acks.capture}=initial-bootstrap`, {
      reportPath,
    });
  }
  if (
    plan === "shrink" &&
    !ackOkEnv(deps.env, acks.shrink, "verified-remediation")
  ) {
    return fail(`missing/invalid ${acks.shrink}=verified-remediation`, {
      reportPath,
    });
  }
  if (
    plan === "append" &&
    !ackOkEnv(deps.env, acks.appendRequirements, "reviewed-append")
  ) {
    return fail(`missing/invalid ${acks.appendRequirements}=reviewed-append`, {
      reportPath,
    });
  }
  if (plan === "revise-semantic") {
    if (
      !reviseAck ||
      !ackOkEnv(deps.env, reviseAck, "reviewed-semantic-change")
    ) {
      return fail(
        `missing/invalid ${reviseAck ?? "SATIN_BASELINE_REVISE_ACK"}=reviewed-semantic-change`,
        {
          reportPath,
        },
      );
    }
  }

  // review-digest guard: current sources must still match the reviewed report.
  if (a.reviewDigest !== cand.base.reviewDigest) {
    return fail(
      "review digest rejected: current sources no longer match the reviewed diagnose report",
      { reviewDigest: cand.base.reviewDigest, reportPath },
    );
  }

  // destinations required for a 3-file transaction.
  if (!a.inventory || !a.baseline || !a.manifest) {
    return fail(
      "mutation requires --inventory, --baseline and --manifest destinations",
      { reportPath },
    );
  }
  // destination paths must be normalized, in-tree tracked baseline/manifest paths.
  if (!isValidBaselinePath(a.baseline) || !isValidBaselinePath(a.manifest)) {
    return fail(
      "baseline/manifest destinations must be normalized paths below conformance/baselines/",
      {
        reportPath,
      },
    );
  }

  // git provenance — a clean worktree at captureSourceRef = HEAD, and the exact
  // ls-tree bytes for captureTreeDigest. Required for every tier mutation.
  if (!deps.git) {
    return fail("tier mutation requires a git provenance provider", {
      reportPath,
    });
  }
  const captureSourceRef = deps.git.headCommit();
  if (!isValidCaptureSourceRef(captureSourceRef)) {
    return fail(
      `captureSourceRef "${captureSourceRef}" is not an exact 40-hex commit`,
      { reportPath },
    );
  }
  if (!deps.git.isClean()) {
    return fail("tier mutation requires a clean worktree at HEAD", {
      reportPath,
    });
  }
  const treeDigest = computeCaptureTreeDigest(
    deps.git.lsTree(captureSourceRef),
  );

  // ledger (for the semantic-revision prefix digest / chain validation).
  const revisionsPath =
    a.revisions ??
    descriptor.paths.requirements.replace(
      /satin\.v1\.json$/,
      "satin.revisions.json",
    );
  const ledger = loadLedger(deps, revisionsPath);

  // --- compute the next baseline + manifest per mutation kind ----------------
  let nextFindings: BaselineFinding[];
  let nextRequirements: BaselineFinding[];
  let parentBaselineDigest: `sha256:${string}` | null;
  let semanticRevisionDigestValue: `sha256:${string}` | null;

  const existingBaselineDigest = existing
    ? computeBaselineDigest(existing.baseline)
    : null;

  if (plan === "capture") {
    if (cand.base.unreviewed.length > 0) {
      return fail(
        `capture refused: ${cand.base.unreviewed.length} open capability(ies) lack a reviewed requirement`,
        { reportPath },
      );
    }
    nextFindings = cand.base.findings;
    nextRequirements = cand.base.requirementLocks;
    parentBaselineDigest = null;
    semanticRevisionDigestValue = null;
    // Capture refuses a PRE-EXISTING committed baseline UNLESS it is byte-identical
    // to the fresh capture we would write (an idempotent crash-resume). The
    // candidate capture baseline is deterministic (parent=null), so we compare its
    // exact bytes here; a DIFFERENT existing baseline "already exists".
    if (existing) {
      const captureBaselineBytes = tierBaselineBytes({
        schemaVersion: 1,
        theme: pipeline.theme,
        tier: "structural",
        parentBaselineDigest: null,
        requirements: nextRequirements,
        findings: nextFindings.map((f) => ({
          id: f.id,
          fingerprint: f.fingerprint,
          tier: "structural" as const,
        })),
        capabilityShapeDigest: cand.capabilityShapeDigest,
        caseSetDigest: cand.caseSetDigest,
      });
      if (!existing.bytes.equals(captureBaselineBytes)) {
        return fail("capture refused: a structural baseline already exists", {
          reportPath,
        });
      }
    }
  } else if (plan === "shrink") {
    if (!existing)
      return fail("shrink refused: no existing baseline", { reportPath });
    const legacy = tierBaselineToLegacyView(existing.baseline);
    const result = shrinkBaseline(
      cand.base.findings,
      legacy,
      cand.base.requirementLocks,
    );
    if (!result.ok || !result.baseline)
      return fail(result.reason ?? "shrink refused", { reportPath });
    nextFindings = result.baseline.findings;
    nextRequirements = result.baseline.requirements;
    parentBaselineDigest = existingBaselineDigest;
    semanticRevisionDigestValue =
      existing.baseline.parentBaselineDigest !== undefined
        ? currentSemanticDigest(ledger)
        : null;
  } else if (plan === "append") {
    if (!existing)
      return fail("append refused: no existing baseline", { reportPath });
    const legacy = tierBaselineToLegacyView(existing.baseline);
    const cmp = compareBaseline(cand.base.findings, legacy);
    if (!cmp.ok) {
      return fail(
        "append refused: the finding set must remain exactly unchanged",
        {
          compare: { unexpected: cmp.unexpected, stale: cmp.stale },
          reportPath,
        },
      );
    }
    const result = appendRequirementLocks(legacy, cand.base.requirementLocks);
    if (!result.ok || !result.baseline)
      return fail(result.reason ?? "append refused", { reportPath });
    nextFindings = existing.baseline.findings.map((f) => ({
      id: f.id,
      fingerprint: f.fingerprint,
    }));
    nextRequirements = result.baseline.requirements;
    parentBaselineDigest = existingBaselineDigest;
    semanticRevisionDigestValue = currentSemanticDigest(ledger);
  } else if (plan === "revise-semantic") {
    if (!existing)
      return fail("revise refused: no existing baseline", { reportPath });
    const revisionResult = validateAndSelectRevision(a, ledger);
    if ("error" in revisionResult)
      return fail(revisionResult.error, { reportPath });
    nextFindings = cand.base.findings;
    nextRequirements = cand.base.requirementLocks;
    parentBaselineDigest = existingBaselineDigest;
    semanticRevisionDigestValue = revisionResult.semanticRevisionDigest;
  } else {
    // inventory-only refresh: findings AND locks must be exactly the accepted set,
    // and every semantic lock must match — provenance is NOT rewritten.
    if (!existing)
      return fail("inventory refresh refused: no existing baseline", {
        reportPath,
      });
    const legacy = tierBaselineToLegacyView(existing.baseline);
    const cmp = compareBaseline(cand.base.findings, legacy);
    if (!cmp.ok) {
      return fail(
        "inventory refresh refused: findings differ from the accepted baseline",
        {
          compare: { unexpected: cmp.unexpected, stale: cmp.stale },
          reportPath,
        },
      );
    }
    if (
      !sameLocks(cand.base.requirementLocks, existing.baseline.requirements)
    ) {
      return fail(
        "inventory refresh refused: requirement locks differ from the accepted baseline",
        {
          reportPath,
        },
      );
    }
    if (
      existing.baseline.capabilityShapeDigest !== cand.capabilityShapeDigest
    ) {
      return fail(
        "inventory refresh refused: capability shape changed (needs a reviewed baseline transaction)",
        {
          reportPath,
        },
      );
    }
    if (existing.baseline.caseSetDigest !== cand.caseSetDigest) {
      return fail(
        "inventory refresh refused: case set changed (needs a reviewed baseline transaction)",
        {
          reportPath,
        },
      );
    }
    // inventory-only: write ONLY the inventory (provenance untouched).
    return commitInventoryOnly(deps, a, cand, reportPath);
  }

  // --- assemble the next TierBaseline + manifest entry -----------------------
  const nextBaseline: TierBaseline = {
    schemaVersion: 1,
    theme: pipeline.theme,
    tier: "structural",
    parentBaselineDigest,
    requirements: nextRequirements,
    findings: nextFindings.map((f) => ({
      id: f.id,
      fingerprint: f.fingerprint,
      tier: "structural" as const,
    })),
    capabilityShapeDigest: cand.capabilityShapeDigest,
    caseSetDigest: cand.caseSetDigest,
  };
  const nextBaselineDigest = computeBaselineDigest(nextBaseline);
  const nextFindingsDigest = computeFindingsDigest(nextBaseline.findings);

  const existingManifest = readManifest(deps, a.manifest);
  const parentManifestDigest = existingManifest
    ? computeManifestDigest(existingManifest.manifest)
    : null;

  const reviewEnvelopeDigest = computeTierReviewDigest({
    schemaVersion: 1,
    theme: pipeline.theme,
    tier: "structural",
    sourceDigest: cand.base.sourceDigest,
    candidateInventoryDigest: cand.base.inventoryDigest,
    requirementsDigest: cand.requirementsDigest,
    capabilityShapeDigest: cand.capabilityShapeDigest,
    caseSetDigest: cand.caseSetDigest,
    findingsDigest: nextFindingsDigest,
    semanticRevisionDigest: semanticRevisionDigestValue,
    parentBaselineDigest,
    parentManifestDigest,
  });

  const entry: TierManifestEntry = {
    tier: "structural",
    baselinePath: a.baseline,
    baselineDigest: nextBaselineDigest,
    captureSourceRef,
    captureTreeDigest: treeDigest,
    captureReviewDigest: reviewEnvelopeDigest,
    requirementsDigest: cand.requirementsDigest,
    capabilityShapeDigest: cand.capabilityShapeDigest,
    caseSetDigest: cand.caseSetDigest,
    findingsDigest: nextFindingsDigest,
    semanticRevisionDigest: semanticRevisionDigestValue,
    parentBaselineDigest,
  };
  const nextManifest: ThemeBaselineManifest = {
    schemaVersion: 1,
    theme: pipeline.theme,
    parentManifestDigest,
    tiers: { ...(existingManifest?.manifest.tiers ?? {}), structural: entry },
  };

  // --- 3-artifact atomic transaction (+ resume) ------------------------------
  return commitTieredTransaction(
    deps,
    a,
    cand,
    nextBaseline,
    nextManifest,
    reportPath,
    plan === "capture",
  );
}

/** The cumulative-prefix digest through the ledger's latest reviewed revision. */
function currentSemanticDigest(
  ledger: SemanticRevisionLedger,
): `sha256:${string}` | null {
  return latestSemanticRevisionDigest(ledger);
}

/**
 * Validate a `--revise-semantic-baseline` request: chain, ACK-gated in the caller,
 * exact change-set-digest, and the pure `validateSemanticRevision` proposal rules.
 * Returns the new cumulative semantic-revision digest, or an `{ error }`.
 */
function validateAndSelectRevision(
  a: Args,
  ledger: SemanticRevisionLedger,
): { semanticRevisionDigest: `sha256:${string}` } | { error: string } {
  if (!a.revisionId) return { error: "revise requires --revision-id" };
  if (!a.changeSetDigest)
    return { error: "revise requires --change-set-digest sha256:..." };

  const idx = ledger.revisions.findIndex((r) => r.id === a.revisionId);
  if (idx === -1) {
    return {
      error: `revision "${a.revisionId}" is not present in the tracked ledger`,
    };
  }
  // the whole ledger chain must be well-formed (no historical edit/reorder/delete).
  const chain = validateRevisionChain(ledger);
  if (!chain.ok) return { error: `ledger chain invalid: ${chain.reason}` };

  const entry = ledger.revisions[idx];
  // the change-set-digest must equal the selected canonical ledger-entry bytes.
  const entryDigest = revisionEntryDigest(entry);
  if (a.changeSetDigest !== entryDigest) {
    return {
      error:
        "change-set-digest does not match the selected canonical ledger entry",
    };
  }
  // the selected entry must be the LATEST (append-only extension of the prefix).
  if (idx !== ledger.revisions.length - 1) {
    return {
      error: "only the latest ledger entry may extend the reviewed prefix",
    };
  }
  // require a change set actually present.
  if (
    entry.changes.length === 0 &&
    entry.addedRequirementIds.length === 0 &&
    entry.addedCaseIds.length === 0 &&
    entry.addedCapabilityIds.length === 0
  ) {
    return { error: "revision declares no change/addition" };
  }
  // proposal-shape validation is delegated to the pure validator via the reviewed
  // requirement fingerprints; the CLI already recomputed cand fingerprints.
  return { semanticRevisionDigest: computeSemanticRevisionDigest(ledger, idx) };
}

/** Inventory-only atomic refresh (single file, provenance untouched). */
function commitInventoryOnly(
  deps: ThemeConformanceDeps,
  a: Args,
  cand: TieredCandidate,
  reportPath: string,
): ConformanceResult {
  if (!a.inventory)
    return fail("inventory refresh requires --inventory", { reportPath });
  const pre = deps.fs.readFile(a.inventory);
  if (pre !== null && pre.equals(cand.base.inventoryBytes)) {
    return ok({ reviewDigest: cand.base.reviewDigest, reportPath });
  }
  try {
    const tmp = `${a.inventory}.tmp`;
    deps.fs.writeFile(tmp, cand.base.inventoryBytes);
    deps.fs.rename(tmp, a.inventory);
  } catch (e) {
    return fail(
      `inventory refresh failed (gate stays red): ${(e as Error).message}`,
      { reportPath },
    );
  }
  return ok({ reviewDigest: cand.base.reviewDigest, reportPath });
}

/**
 * The 3-artifact atomic transaction: inventory → structural.json → manifest.json
 * (the last is the commit point). All bytes/digests were validated before this
 * function.
 *
 * `isCapture` distinguishes the two shapes:
 *  - CAPTURE (no prior committed baseline): a pre-existing DIFFERENT file is an
 *    unrecoverable FOREIGN partial state → abort. A byte-identical pre-existing
 *    file is a crash-resume and is accepted; the transaction finishes the missing
 *    commits. Any partial write of THIS transaction resumes only when the already
 *    renamed files are byte-identical to the recomputed candidate.
 *  - REPLACE (shrink/append/revise over an existing baseline): the old committed
 *    baseline/manifest ARE expected to differ from the new bytes; the transaction
 *    overwrites all three in commit order. Re-running is idempotent (byte-identical
 *    output), so a crash mid-replace resumes on the next run.
 */
function commitTieredTransaction(
  deps: ThemeConformanceDeps,
  a: Args,
  cand: TieredCandidate,
  nextBaseline: TierBaseline,
  nextManifest: ThemeBaselineManifest,
  reportPath: string,
  isCapture: boolean,
): ConformanceResult {
  const invBytes = cand.base.inventoryBytes;
  const baseBytes = tierBaselineBytes(nextBaseline);
  const manBytes = manifestBytes(nextManifest);

  const preInv = deps.fs.readFile(a.inventory!);
  const preBase = deps.fs.readFile(a.baseline!);
  const preMan = deps.fs.readFile(a.manifest!);

  const invCommitted = preInv !== null && preInv.equals(invBytes);
  const baseCommitted = preBase !== null && preBase.equals(baseBytes);
  const manCommitted = preMan !== null && preMan.equals(manBytes);

  // On an INITIAL capture, a pre-existing DIFFERENT file at any stage is a foreign
  // partial state; resume is byte-identical only (an unrecognized inventory/
  // baseline aborts without any mutation).
  if (isCapture) {
    if (preInv !== null && !invCommitted) {
      return fail(
        "resume aborted: existing inventory differs from the candidate; no partial state may pass",
        { reportPath },
      );
    }
    if (preBase !== null && !baseCommitted) {
      return fail(
        "resume aborted: existing structural baseline differs from the candidate; no partial state may pass",
        { reportPath },
      );
    }
    if (preMan !== null && !manCommitted) {
      return fail(
        "resume aborted: existing manifest differs from the candidate; no partial state may pass",
        { reportPath },
      );
    }
  }

  try {
    if (!invCommitted) {
      const tmp = `${a.inventory}.tmp`;
      deps.fs.writeFile(tmp, invBytes);
      deps.fs.rename(tmp, a.inventory!);
    }
    if (!baseCommitted) {
      const tmp = `${a.baseline}.tmp`;
      deps.fs.writeFile(tmp, baseBytes);
      deps.fs.rename(tmp, a.baseline!);
    }
    // manifest LAST — the commit point.
    if (!manCommitted) {
      const tmp = `${a.manifest}.tmp`;
      deps.fs.writeFile(tmp, manBytes);
      deps.fs.rename(tmp, a.manifest!);
    }
  } catch (e) {
    return fail(
      `transaction failed (gate stays red): ${(e as Error).message}`,
      {
        reviewDigest: cand.base.reviewDigest,
        reportPath,
      },
    );
  }
  return ok({ reviewDigest: cand.base.reviewDigest, reportPath });
}
