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
} from '../../../packages/theme-contract/conformance';
import type {
  CapabilityRecord,
  StructuralIssue,
  RequirementRecord,
  StructuralBaseline,
  BaselineFinding,
} from '../../../packages/theme-contract/conformance';

// ---------------------------------------------------------------------------
// Public contracts
// ---------------------------------------------------------------------------

/** Only Bloom is a target for this release train; Luna is explicitly excluded. */
const SUPPORTED_THEMES = new Set(['bloom']);

export const BUILD_ORDER = [
  'corepack pnpm build',
  'corepack pnpm build:blocks',
  'corepack pnpm build:theme-sections bloom',
  'corepack pnpm exec tsx scripts/run-theme-build.ts bloom',
] as const;

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
  reportDir?: string;
  requirements?: string;
  proposeRequirements?: string;
  reviewDigest?: string;
  diagnose: boolean;
  requireZero: boolean;
  captureInitialBaseline: boolean;
  shrinkBaseline: boolean;
  writeInventory: boolean;
  appendRequirementLocks: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    diagnose: false,
    requireZero: false,
    captureInitialBaseline: false,
    shrinkBaseline: false,
    writeInventory: false,
    appendRequirementLocks: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    const next = () => argv[++i];
    switch (t) {
      case '--theme': a.theme = next(); break;
      case '--baseline': a.baseline = next(); break;
      case '--inventory': a.inventory = next(); break;
      case '--report-dir': a.reportDir = next(); break;
      case '--requirements': a.requirements = next(); break;
      case '--propose-requirements': a.proposeRequirements = next(); break;
      case '--review-digest': a.reviewDigest = next(); break;
      case '--diagnose': a.diagnose = true; break;
      case '--require-zero': a.requireZero = true; break;
      case '--capture-initial-baseline': a.captureInitialBaseline = true; break;
      case '--shrink-baseline': a.shrinkBaseline = true; break;
      case '--write-inventory': a.writeInventory = true; break;
      case '--append-requirement-locks': a.appendRequirementLocks = true; break;
      default: break; // ignore unknown positionals
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
const fail = (error: string, extra: Partial<ConformanceResult> = {}): ConformanceResult => ({
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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return `sha256:${createHash('sha256').update(s, 'utf8').digest('hex')}`;
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
  deps.fs.writeFile(jsonPath, Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'));
  deps.fs.writeFile(mdPath, Buffer.from(report.markdown, 'utf8'));
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
  return { baseline: JSON.parse(bytes.toString('utf8')) as StructuralBaseline, bytes };
}

function baselineBytes(baseline: StructuralBaseline): Buffer {
  return Buffer.from(JSON.stringify(baseline, null, 2) + '\n', 'utf8');
}

function loadReviewed(
  deps: ThemeConformanceDeps,
  path: string | undefined,
): RequirementRecord[] | null {
  if (!path) return null;
  const bytes = deps.fs.readFile(path);
  if (bytes === null) return null;
  return JSON.parse(bytes.toString('utf8')) as RequirementRecord[];
}

// ---------------------------------------------------------------------------
// Mutation mode classification & validation (all illegal combos rejected here)
// ---------------------------------------------------------------------------

type MutationKind = 'capture' | 'shrink' | 'append' | 'inventory-only';

interface MutationPlan {
  kind: MutationKind;
}

/**
 * Classify the requested mutation and reject every illegal flag combination
 * BEFORE any filesystem work. Returns `null` for a non-mutating run.
 */
function classifyMutation(a: Args): { plan: MutationPlan | null; error?: string } {
  const mutFlags = [
    a.captureInitialBaseline,
    a.shrinkBaseline,
    a.appendRequirementLocks,
  ].filter(Boolean).length;

  // Proposal / diagnose / release are mutually exclusive with mutations.
  const anyMutationIntent =
    mutFlags > 0 || a.writeInventory;
  if (anyMutationIntent && (a.diagnose || a.requireZero || a.proposeRequirements)) {
    return { plan: null, error: 'mutation flags are mutually exclusive with --diagnose/--require-zero/--propose-requirements' };
  }

  if (mutFlags > 1) {
    return { plan: null, error: 'only one of --capture-initial-baseline/--shrink-baseline/--append-requirement-locks is allowed' };
  }

  if (mutFlags === 0 && !a.writeInventory) {
    return { plan: null }; // non-mutating run
  }

  // Every mutation requires --review-digest.
  if (!a.reviewDigest) {
    return { plan: null, error: 'every mutation requires --review-digest sha256:...' };
  }

  // capture / shrink / append all require --write-inventory (2-file transaction).
  if (a.captureInitialBaseline || a.shrinkBaseline || a.appendRequirementLocks) {
    if (!a.writeInventory) {
      return { plan: null, error: 'baseline/requirement mutations require --write-inventory (atomic 2-file transaction)' };
    }
  }

  if (a.captureInitialBaseline) return { plan: { kind: 'capture' } };
  if (a.shrinkBaseline) return { plan: { kind: 'shrink' } };
  if (a.appendRequirementLocks) return { plan: { kind: 'append' } };
  // write-inventory alone → inventory-only refresh.
  return { plan: { kind: 'inventory-only' } };
}

function ackOk(env: Record<string, string | undefined>, key: string, value: string): boolean {
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

  // 1) theme validation — accept only bloom, reject Luna/unknown.
  if (!a.theme) return fail('--theme is required');
  if (a.theme === 'luna') return fail('theme "luna" is excluded from the release train');
  if (!SUPPORTED_THEMES.has(a.theme)) return fail(`unsupported theme "${a.theme}"`);

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
      `missing compiled prerequisites: ${pre.missing.join(', ')}. Run the build in order.`,
      { buildOrder: BUILD_ORDER },
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
    if (plan) return fail('--propose-requirements cannot be combined with mutation flags');
    const proposal = proposeRequirements(
      pipeline.capabilities,
      pipeline.structuralIssues,
      pipeline.releaseContract,
    );
    deps.fs.mkdirp(dirname(a.proposeRequirements));
    deps.fs.writeFile(
      a.proposeRequirements,
      Buffer.from(JSON.stringify(proposal, null, 2) + '\n', 'utf8'),
    );
    return ok({ reportPath: a.proposeRequirements });
  }

  const reportDir = a.reportDir ?? 'conformance-results/bloom';

  // -----------------------------------------------------------------------
  // Load reviewed requirements. Proposal is the ONLY mode allowed to run
  // without them; diagnose/normal/release/mutation require them. The canonical
  // location is conformance/requirements/bloom.v1.json unless overridden.
  // -----------------------------------------------------------------------
  const requirementsPath = a.requirements ?? 'conformance/requirements/bloom.v1.json';
  const reviewed = loadReviewed(deps, requirementsPath);
  if (reviewed === null) {
    return fail(
      'reviewed requirements artifact (conformance/requirements/bloom.v1.json) is required for this mode',
    );
  }

  // Existing baseline (for parent link + normal comparison).
  const existing = a.baseline ? readBaseline(deps, a.baseline) : null;
  const parentForCandidate = a.captureInitialBaseline ? null : (existing?.baseline.reviewDigest ?? null);

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
  const mode = plan ? `mutate:${plan.kind}` : a.diagnose ? 'diagnose' : a.requireZero ? 'release' : 'normal';
  const reportPath = writeReport(deps, reportDir, cand, pipeline, parentForCandidate, mode);

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
    return runMutation(deps, a, plan, pipeline, reviewed, cand, existing, reportPath);
  }

  // -----------------------------------------------------------------------
  // Normal / release (read-only) mode.
  // -----------------------------------------------------------------------
  if (!existing) {
    return fail('baseline is missing; run --diagnose then --capture-initial-baseline', {
      reviewDigest: cand.reviewDigest,
      reportPath,
    });
  }

  // 9) compare exact tracked inventory BYTES.
  const trackedInventory = a.inventory ? deps.fs.readFile(a.inventory) : null;
  if (!trackedInventory) {
    return fail('tracked inventory is missing', { reportPath });
  }
  if (!trackedInventory.equals(cand.inventoryBytes)) {
    return fail('tracked inventory is stale (byte mismatch with the current candidate)', {
      reviewDigest: cand.reviewDigest,
      reportPath,
    });
  }

  // 10) baseline.inventoryDigest must match the tracked inventory bytes, and the
  //     stored reviewDigest must recompute.
  const trackedInventoryDigest = computeInventoryDigest(trackedInventory);
  if (existing.baseline.inventoryDigest !== trackedInventoryDigest) {
    return fail('baseline/inventory digest mismatch', { reportPath });
  }
  const recomputed = recomputeReviewDigestFromBaseline(existing.baseline, {
    schemaVersion: deps.schemaVersion,
    generatorVersion: deps.generatorVersion,
  });
  if (recomputed !== existing.baseline.reviewDigest) {
    return fail('stored review digest does not recompute', { reportPath });
  }

  // 12) compare fingerprinted baseline; --require-zero uses ALL findings.
  const compare = compareBaseline(cand.findings, existing.baseline, {
    requireZero: a.requireZero,
  });
  if (!compare.ok) {
    return fail(
      a.requireZero
        ? 'release gate: findings still exist'
        : 'baseline mismatch (unexpected/stale/changed findings)',
      {
        reviewDigest: cand.reviewDigest,
        compare: { unexpected: compare.unexpected, stale: compare.stale },
        reportPath,
      },
    );
  }

  return ok({ reviewDigest: cand.reviewDigest, compare: { unexpected: [], stale: [] }, reportPath });
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
): ConformanceResult {
  // non-CI is mandatory for every mutation.
  if (deps.isCI) return fail('mutations are refused in CI', { reportPath });

  // acknowledgements.
  if (!ackOk(deps.env, 'BLOOM_INVENTORY_ACK', 'reviewed-refresh')) {
    return fail('missing/invalid BLOOM_INVENTORY_ACK=reviewed-refresh', { reportPath });
  }
  if (plan.kind === 'capture' && !ackOk(deps.env, 'BLOOM_BASELINE_ACK', 'initial-bootstrap')) {
    return fail('missing/invalid BLOOM_BASELINE_ACK=initial-bootstrap', { reportPath });
  }
  if (plan.kind === 'shrink' && !ackOk(deps.env, 'BLOOM_BASELINE_SHRINK_ACK', 'verified-remediation')) {
    return fail('missing/invalid BLOOM_BASELINE_SHRINK_ACK=verified-remediation', { reportPath });
  }
  if (plan.kind === 'append' && !ackOk(deps.env, 'BLOOM_REQUIREMENTS_ACK', 'reviewed-append')) {
    return fail('missing/invalid BLOOM_REQUIREMENTS_ACK=reviewed-append', { reportPath });
  }

  // review-digest guard: recompute from CURRENT sources and reject if the
  // reviewer-approved digest differs. `cand` was built from current sources.
  if (a.reviewDigest !== cand.reviewDigest) {
    return fail(
      'review digest rejected: current sources no longer match the reviewed diagnose report',
      { reviewDigest: cand.reviewDigest, reportPath },
    );
  }

  // Build the next baseline for each mutation kind, validating all monotonicity
  // proofs BEFORE any write.
  let nextBaseline: StructuralBaseline;

  if (plan.kind === 'capture') {
    if (existing) {
      return fail('capture refused: a baseline already exists', { reportPath });
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
  } else if (plan.kind === 'shrink') {
    if (!existing) return fail('shrink refused: no existing baseline', { reportPath });
    const result = shrinkBaseline(cand.findings, existing.baseline, cand.requirementLocks);
    if (!result.ok || !result.baseline) {
      return fail(result.reason ?? 'shrink refused', { reportPath });
    }
    nextBaseline = {
      ...result.baseline,
      inventoryDigest: cand.inventoryDigest,
      sourceDigest: cand.sourceDigest,
      reviewDigest: cand.reviewDigest,
    };
  } else if (plan.kind === 'append') {
    if (!existing) return fail('append refused: no existing baseline', { reportPath });
    // findings must stay exactly unchanged vs the existing baseline.
    const cmp = compareBaseline(cand.findings, existing.baseline);
    if (!cmp.ok) {
      return fail('append refused: the finding set must remain exactly unchanged', {
        compare: { unexpected: cmp.unexpected, stale: cmp.stale },
        reportPath,
      });
    }
    const result = appendRequirementLocks(existing.baseline, cand.requirementLocks);
    if (!result.ok || !result.baseline) {
      return fail(result.reason ?? 'append refused', { reportPath });
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
    if (!existing) return fail('inventory refresh refused: no existing baseline', { reportPath });
    const cmp = compareBaseline(cand.findings, existing.baseline);
    if (!cmp.ok) {
      return fail('inventory refresh refused: findings differ from the accepted baseline', {
        compare: { unexpected: cmp.unexpected, stale: cmp.stale },
        reportPath,
      });
    }
    if (!sameLocks(cand.requirementLocks, existing.baseline.requirements)) {
      return fail('inventory refresh refused: requirement locks differ from the accepted baseline', {
        reportPath,
      });
    }
    nextBaseline = {
      ...existing.baseline,
      inventoryDigest: cand.inventoryDigest,
      sourceDigest: cand.sourceDigest,
      reviewDigest: cand.reviewDigest,
    };
  }

  if (!a.inventory || !a.baseline) {
    return fail('mutation requires --inventory and --baseline destinations', { reportPath });
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
    if (plan.kind === 'capture') {
      return fail(
        'resume aborted: an existing inventory does not match the candidate; no partial state may pass',
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
    return fail(`transaction failed (gate stays red): ${(e as Error).message}`, {
      reviewDigest: cand.reviewDigest,
      reportPath,
    });
  }

  return ok({ reviewDigest: cand.reviewDigest, reportPath });
}

function sameLocks(a: readonly BaselineFinding[], b: readonly BaselineFinding[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a.map((f) => `${f.id} ${f.fingerprint}`));
  for (const f of b) if (!sa.has(`${f.id} ${f.fingerprint}`)) return false;
  return true;
}

function dirname(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx === -1 ? '.' : p.slice(0, idx);
}
