/**
 * Deterministic, redacted conformance report.
 *
 * The report is the human/machine review surface written before the gate returns.
 * It is deterministic (sorted capabilities/issues/findings/sources), timestamp-
 * free, and carries the five digests plus the parent-baseline link so two
 * unchanged runs produce byte-identical JSON and the same review digest.
 *
 * REDACTION. Every value serialized into the report is recursively scrubbed of
 * sensitive auth material. Sensitive KEY names (exact + compound, case-insensitive)
 * are dropped to `[REDACTED]`; additionally ANY string VALUE that looks like an
 * email address is redacted regardless of its key. Legitimate design keys named
 * `tokens` / `colorSchemes` are explicitly NOT redacted merely because they carry
 * the substring "token" — only the genuinely sensitive names below are.
 *
 * This module imports nothing from the site-gen runtime.
 */

import type {
  BaselineFinding,
  CapabilityRecord,
  StructuralIssue,
} from './types';

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const REDACTED = '[REDACTED]';

/**
 * Exact + compound sensitive key names (lower-cased for comparison). These are an
 * allow-LIST of forbidden names, not a substring match, so `tokens`/`colorSchemes`
 * and other design keys are safe.
 */
const SENSITIVE_KEYS = new Set<string>([
  'password',
  'otp',
  'cookie',
  'authorization',
  'secret',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'sessionid',
  'sessiontoken',
  'resetcredential',
  'storagestate',
  'email',
]);

/**
 * A pragmatic email detector: `local@domain.tld` with at least one dot in the
 * domain and a 2+ char TLD, found anywhere inside the string.
 */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export function isEmailLikeValue(value: unknown): boolean {
  return typeof value === 'string' && EMAIL_RE.test(value);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

/**
 * Recursively redact sensitive keys and email-looking string values. Returns a
 * new structure; the input is never mutated.
 */
export function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return isEmailLikeValue(value) ? REDACTED : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    if (isSensitiveKey(key)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = redact(src[key]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic sorting
// ---------------------------------------------------------------------------

function sortSources<T extends { kind: string; ref: string }>(
  sources: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of [...sources].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    if (a.ref !== b.ref) return a.ref < b.ref ? -1 : 1;
    return 0;
  })) {
    const k = `${s.kind} ${s.ref}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/** Sort capabilities by id (new array); also sort each row's sources (deduped). */
export function sortCapabilities(rows: readonly CapabilityRecord[]): CapabilityRecord[] {
  return [...rows]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((r) => ({ ...r, sources: sortSources(r.sources) }));
}

export function sortStructuralIssues(issues: readonly StructuralIssue[]): StructuralIssue[] {
  return [...issues]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((i) => ({ ...i, sources: sortSources(i.sources) }));
}

export function sortFindings(findings: readonly BaselineFinding[]): BaselineFinding[] {
  return [...findings].sort((a, b) => {
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    if (a.fingerprint !== b.fingerprint) return a.fingerprint < b.fingerprint ? -1 : 1;
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface ConformanceReportInput {
  theme: string;
  schemaVersion: 1;
  generatorVersion: string;
  sourceDigest: `sha256:${string}`;
  candidateInventoryDigest: `sha256:${string}`;
  observedFindingsDigest: `sha256:${string}`;
  reviewDigest: `sha256:${string}`;
  parentBaselineDigest: `sha256:${string}` | null;
  capabilities: CapabilityRecord[];
  structuralIssues: StructuralIssue[];
  findings: BaselineFinding[];
  /** optional extra context sorted/redacted but never carrying a timestamp. */
  mode?: string;
}

export interface ConformanceReport {
  theme: string;
  schemaVersion: 1;
  generatorVersion: string;
  mode?: string;
  parentBaselineDigest: `sha256:${string}` | null;
  sourceDigest: `sha256:${string}`;
  candidateInventoryDigest: `sha256:${string}`;
  observedFindingsDigest: `sha256:${string}`;
  reviewDigest: `sha256:${string}`;
  counts: {
    capabilities: number;
    open: number;
    gaps: number;
    needsDecision: number;
    unknown: number;
    structuralIssues: number;
    findings: number;
  };
  capabilities: CapabilityRecord[];
  structuralIssues: StructuralIssue[];
  findings: BaselineFinding[];
  /** deterministic Markdown summary (no timestamp). */
  markdown: string;
}

function statusCounts(rows: readonly CapabilityRecord[]): {
  open: number;
  gaps: number;
  needsDecision: number;
  unknown: number;
} {
  let open = 0;
  let gaps = 0;
  let needsDecision = 0;
  let unknown = 0;
  for (const r of rows) {
    if (r.status !== 'PASS') open += 1;
    if (r.status === 'GAP') gaps += 1;
    else if (r.status === 'NEEDS_DECISION') needsDecision += 1;
    else if (r.status === 'UNKNOWN') unknown += 1;
  }
  return { open, gaps, needsDecision, unknown };
}

function renderMarkdown(report: Omit<ConformanceReport, 'markdown'>): string {
  const lines: string[] = [];
  lines.push(`# Conformance report — ${report.theme}`);
  lines.push('');
  if (report.mode) lines.push(`- mode: ${report.mode}`);
  lines.push(`- schemaVersion: ${report.schemaVersion}`);
  lines.push(`- generatorVersion: ${report.generatorVersion}`);
  lines.push(`- parentBaselineDigest: ${report.parentBaselineDigest ?? 'null'}`);
  lines.push(`- sourceDigest: ${report.sourceDigest}`);
  lines.push(`- candidateInventoryDigest: ${report.candidateInventoryDigest}`);
  lines.push(`- observedFindingsDigest: ${report.observedFindingsDigest}`);
  lines.push(`- reviewDigest: ${report.reviewDigest}`);
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push(`- capabilities: ${report.counts.capabilities}`);
  lines.push(`- open: ${report.counts.open}`);
  lines.push(`- GAP: ${report.counts.gaps}`);
  lines.push(`- NEEDS_DECISION: ${report.counts.needsDecision}`);
  lines.push(`- UNKNOWN: ${report.counts.unknown}`);
  lines.push(`- structural issues: ${report.counts.structuralIssues}`);
  lines.push(`- findings: ${report.counts.findings}`);
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('_none_');
  } else {
    for (const f of report.findings) {
      lines.push(`- ${f.id} \`${f.fingerprint}\``);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Build the deterministic, redacted report. Capabilities/issues/findings are
 * sorted; every embedded value is recursively redacted; no timestamp is written.
 */
export function buildConformanceReport(input: ConformanceReportInput): ConformanceReport {
  const capabilities = redact(sortCapabilities(input.capabilities)) as CapabilityRecord[];
  const structuralIssues = redact(
    sortStructuralIssues(input.structuralIssues),
  ) as StructuralIssue[];
  const findings = sortFindings(input.findings);

  const counts = {
    capabilities: capabilities.length,
    ...statusCounts(input.capabilities),
    structuralIssues: structuralIssues.length,
    findings: findings.length,
  };

  const withoutMarkdown: Omit<ConformanceReport, 'markdown'> = {
    theme: input.theme,
    schemaVersion: input.schemaVersion,
    generatorVersion: input.generatorVersion,
    ...(input.mode ? { mode: input.mode } : {}),
    parentBaselineDigest: input.parentBaselineDigest,
    sourceDigest: input.sourceDigest,
    candidateInventoryDigest: input.candidateInventoryDigest,
    observedFindingsDigest: input.observedFindingsDigest,
    reviewDigest: input.reviewDigest,
    counts,
    capabilities,
    structuralIssues,
    findings,
  };

  return { ...withoutMarkdown, markdown: renderMarkdown(withoutMarkdown) };
}
