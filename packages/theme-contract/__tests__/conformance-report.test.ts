/**
 * Task 6 — Deterministic report & tracked inventory artifact.
 *
 * These tests are the authoritative behavioural contract for
 * `conformance/report.ts` and `conformance/inventory-artifact.ts`. They are
 * written FIRST (strict TDD) and pin every invariant enumerated in the plan's
 * "Deterministic artifacts" section:
 *
 *  - deterministic sort of capabilities, issues, findings and sources;
 *  - `inventoryDigest` = SHA-256 of the EXACT serialized candidate inventory
 *    bytes; a canonical review envelope over schema/generator version, theme,
 *    sourceDigest, inventoryDigest, sorted requirement locks, sorted findings and
 *    parentBaselineDigest; `reviewDigest` = SHA-256 of that envelope; recomputing
 *    while reading a baseline reproduces the stored value;
 *  - the reviewed requirement artifact byte digest participates in the inventory
 *    source digest;
 *  - recursive redaction of exact/compound auth keys + any email-looking string,
 *    but NOT legitimate design keys named `tokens` / `colorSchemes`;
 *  - the report carries parentBaselineDigest / sourceDigest /
 *    candidateInventoryDigest / observedFindingsDigest / reviewDigest and NO
 *    timestamp; two unchanged runs are byte-identical.
 */

import { createHash } from 'node:crypto';

import {
  redact,
  isEmailLikeValue,
  sortCapabilities,
  sortStructuralIssues,
  sortFindings,
  buildConformanceReport,
} from '../conformance/report';
import {
  serializeInventory,
  digestBytes,
  buildReviewEnvelope,
  computeReviewDigest,
  computeInventoryDigest,
  recomputeReviewDigestFromBaseline,
} from '../conformance/inventory-artifact';
import type {
  CapabilityRecord,
  StructuralIssue,
  BaselineFinding,
  StructuralBaseline,
} from '../conformance/types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function cap(id: string, overrides: Partial<CapabilityRecord> = {}): CapabilityRecord {
  return {
    id,
    theme: 'bloom',
    surface: 'block',
    capability: id,
    scenarios: [],
    modes: ['hot-preview', 'initial-preview', 'live'],
    viewports: ['desktop', 'mobile'],
    sources: [],
    status: 'UNKNOWN',
    failureIds: [],
    ...overrides,
  };
}

function issue(id: string, overrides: Partial<StructuralIssue> = {}): StructuralIssue {
  return {
    id,
    theme: 'bloom',
    status: 'GAP',
    expectedCode: 'x',
    observedCode: 'y',
    canonicalFacts: {},
    detail: '',
    sources: [],
    ...overrides,
  };
}

const f = (id: string, fp: string): BaselineFinding => ({
  id,
  fingerprint: `sha256:${fp}` as const,
});

const sha = (s: string): `sha256:${string}` =>
  `sha256:${createHash('sha256').update(s, 'utf8').digest('hex')}`;

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

describe('redact', () => {
  it('recursively redacts exact and compound auth key names', () => {
    const input = {
      password: 'hunter2',
      otp: '123456',
      cookie: 'sid=abc',
      authorization: 'Bearer xyz',
      secret: 's',
      apiKey: 'k',
      accessToken: 'a',
      refreshToken: 'r',
      sessionId: 'sess',
      sessionToken: 'st',
      resetCredential: 'rc',
      storageState: { cookies: [] },
      email: 'user@example.com',
      keep: 'visible',
    };
    const out = redact(input) as Record<string, unknown>;
    for (const k of [
      'password',
      'otp',
      'cookie',
      'authorization',
      'secret',
      'apiKey',
      'accessToken',
      'refreshToken',
      'sessionId',
      'sessionToken',
      'resetCredential',
      'storageState',
      'email',
    ]) {
      expect(out[k]).toBe('[REDACTED]');
    }
    expect(out.keep).toBe('visible');
  });

  it('redacts sensitive keys nested inside objects and arrays', () => {
    const input = {
      list: [
        { password: 'p', label: 'ok' },
        { nested: { otp: 'o', value: 42 } },
      ],
      deep: { deeper: { authorization: 'Bearer t', kept: 'yes' } },
    };
    const out = redact(input) as any;
    expect(out.list[0].password).toBe('[REDACTED]');
    expect(out.list[0].label).toBe('ok');
    expect(out.list[1].nested.otp).toBe('[REDACTED]');
    expect(out.list[1].nested.value).toBe(42);
    expect(out.deep.deeper.authorization).toBe('[REDACTED]');
    expect(out.deep.deeper.kept).toBe('yes');
  });

  it('redacts any email-address-looking string VALUE regardless of key', () => {
    const input = {
      contactNote: 'reach me at admin@merfy.ru please',
      author: 'plain-user@sub.example.co.uk',
      notAnEmail: 'user at example dot com',
      arr: ['first@example.com', 'no-email-here'],
    };
    const out = redact(input) as any;
    expect(out.contactNote).toBe('[REDACTED]');
    expect(out.author).toBe('[REDACTED]');
    expect(out.notAnEmail).toBe('user at example dot com');
    expect(out.arr[0]).toBe('[REDACTED]');
    expect(out.arr[1]).toBe('no-email-here');
  });

  it('does NOT redact legitimate design keys `tokens` / `colorSchemes`', () => {
    const input = {
      tokens: { '--radius-button': '8px', '--color-bg': '#fff' },
      colorSchemes: [{ name: 'scheme-1', token: '--color-bg' }],
      accessToken: 'secret',
    };
    const out = redact(input) as any;
    expect(out.tokens).toEqual({ '--radius-button': '8px', '--color-bg': '#fff' });
    expect(out.colorSchemes).toEqual([{ name: 'scheme-1', token: '--color-bg' }]);
    // still redacts the genuinely sensitive sibling
    expect(out.accessToken).toBe('[REDACTED]');
  });

  it('isEmailLikeValue classifies only true email strings', () => {
    expect(isEmailLikeValue('a@b.com')).toBe(true);
    expect(isEmailLikeValue('embedded a@b.com here')).toBe(true);
    expect(isEmailLikeValue('no email')).toBe(false);
    expect(isEmailLikeValue(42)).toBe(false);
    expect(isEmailLikeValue(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Deterministic sort
// ---------------------------------------------------------------------------

describe('deterministic sort', () => {
  it('sorts capabilities by id and returns a new array', () => {
    const rows = [cap('bloom.block.Z'), cap('bloom.block.A'), cap('bloom.block.M')];
    const sorted = sortCapabilities(rows);
    expect(sorted.map((r) => r.id)).toEqual([
      'bloom.block.A',
      'bloom.block.M',
      'bloom.block.Z',
    ]);
    expect(sorted).not.toBe(rows);
    expect(rows.map((r) => r.id)).toEqual([
      'bloom.block.Z',
      'bloom.block.A',
      'bloom.block.M',
    ]);
  });

  it('sorts each capability sources deterministically without mutating input', () => {
    const row = cap('bloom.block.A', {
      sources: [
        { kind: 'user', ref: 'z' },
        { kind: 'figma', ref: 'a' },
        { kind: 'figma', ref: 'a' },
      ],
    });
    const sorted = sortCapabilities([row]);
    expect(sorted[0].sources).toEqual([
      { kind: 'figma', ref: 'a' },
      { kind: 'user', ref: 'z' },
    ]);
    // input untouched (order + duplicate preserved)
    expect(row.sources).toHaveLength(3);
  });

  it('sorts structural issues and findings by id', () => {
    expect(
      sortStructuralIssues([issue('b'), issue('a')]).map((i) => i.id),
    ).toEqual(['a', 'b']);
    expect(
      sortFindings([f('b', '1'), f('a', '2')]).map((x) => x.id),
    ).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// Inventory serialization + digests
// ---------------------------------------------------------------------------

describe('inventory-artifact', () => {
  const baseInventory = {
    schemaVersion: 1 as const,
    generatorVersion: '1',
    theme: 'bloom',
    sourceDigest: sha('src'),
    capabilities: [cap('bloom.block.A'), cap('bloom.block.B')],
    structuralIssues: [issue('i1')],
    findings: [f('a', '1')],
    requirements: [f('req.a', '9')],
  };

  it('serializeInventory produces canonical, deterministically-sorted JSON bytes', () => {
    const a = serializeInventory({
      ...baseInventory,
      capabilities: [cap('bloom.block.B'), cap('bloom.block.A')],
      findings: [f('b', '2'), f('a', '1')],
    });
    const b = serializeInventory({
      ...baseInventory,
      capabilities: [cap('bloom.block.A'), cap('bloom.block.B')],
      findings: [f('a', '1'), f('b', '2')],
    });
    expect(a.toString('utf8')).toEqual(b.toString('utf8'));
    // key order inside the JSON is stable (sorted) — no timestamp key
    expect(a.toString('utf8')).not.toMatch(/timestamp|generatedAt|compiledAt/i);
  });

  it('computeInventoryDigest hashes the EXACT serialized bytes', () => {
    const bytes = serializeInventory(baseInventory);
    expect(computeInventoryDigest(bytes)).toEqual(digestBytes(bytes));
    expect(computeInventoryDigest(bytes)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('buildReviewEnvelope + computeReviewDigest are order-insensitive on lock/finding sets but sensitive to digests', () => {
    const env1 = buildReviewEnvelope({
      schemaVersion: 1,
      generatorVersion: '1',
      theme: 'bloom',
      sourceDigest: sha('src'),
      inventoryDigest: sha('inv'),
      requirements: [f('r.b', '2'), f('r.a', '1')],
      findings: [f('b', '2'), f('a', '1')],
      parentBaselineDigest: null,
    });
    const env2 = buildReviewEnvelope({
      schemaVersion: 1,
      generatorVersion: '1',
      theme: 'bloom',
      sourceDigest: sha('src'),
      inventoryDigest: sha('inv'),
      requirements: [f('r.a', '1'), f('r.b', '2')],
      findings: [f('a', '1'), f('b', '2')],
      parentBaselineDigest: null,
    });
    expect(computeReviewDigest(env1)).toEqual(computeReviewDigest(env2));

    const env3 = buildReviewEnvelope({
      schemaVersion: 1,
      generatorVersion: '1',
      theme: 'bloom',
      sourceDigest: sha('src'),
      inventoryDigest: sha('DIFFERENT'),
      requirements: [f('r.a', '1')],
      findings: [f('a', '1')],
      parentBaselineDigest: null,
    });
    expect(computeReviewDigest(env3)).not.toEqual(computeReviewDigest(env1));
  });

  it('recomputeReviewDigestFromBaseline reproduces the stored reviewDigest', () => {
    const inventoryBytes = serializeInventory(baseInventory);
    const inventoryDigest = computeInventoryDigest(inventoryBytes);
    const envelope = buildReviewEnvelope({
      schemaVersion: 1,
      generatorVersion: '1',
      theme: 'bloom',
      sourceDigest: baseInventory.sourceDigest,
      inventoryDigest,
      requirements: baseInventory.requirements,
      findings: baseInventory.findings,
      parentBaselineDigest: null,
    });
    const reviewDigest = computeReviewDigest(envelope);
    const baseline: StructuralBaseline = {
      schemaVersion: 1,
      theme: 'bloom',
      reviewDigest,
      inventoryDigest,
      sourceDigest: baseInventory.sourceDigest,
      parentBaselineDigest: null,
      requirements: baseInventory.requirements,
      findings: baseInventory.findings,
    };
    expect(
      recomputeReviewDigestFromBaseline(baseline, {
        schemaVersion: 1,
        generatorVersion: '1',
      }),
    ).toEqual(reviewDigest);

    // A tampered stored inventoryDigest breaks the recompute.
    expect(
      recomputeReviewDigestFromBaseline(
        { ...baseline, inventoryDigest: sha('tamper') },
        { schemaVersion: 1, generatorVersion: '1' },
      ),
    ).not.toEqual(reviewDigest);
  });
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

describe('buildConformanceReport', () => {
  const inputs = {
    theme: 'bloom',
    schemaVersion: 1 as const,
    generatorVersion: '1',
    sourceDigest: sha('src'),
    candidateInventoryDigest: sha('inv'),
    observedFindingsDigest: sha('finds'),
    reviewDigest: sha('rev'),
    parentBaselineDigest: null,
    capabilities: [cap('bloom.block.B'), cap('bloom.block.A')],
    structuralIssues: [issue('i2'), issue('i1')],
    findings: [f('b', '2'), f('a', '1')],
  };

  it('carries all five digests + parent link and NO timestamp', () => {
    const report = buildConformanceReport(inputs);
    expect(report.parentBaselineDigest).toBeNull();
    expect(report.sourceDigest).toEqual(inputs.sourceDigest);
    expect(report.candidateInventoryDigest).toEqual(inputs.candidateInventoryDigest);
    expect(report.observedFindingsDigest).toEqual(inputs.observedFindingsDigest);
    expect(report.reviewDigest).toEqual(inputs.reviewDigest);
    const json = JSON.stringify(report);
    expect(json).not.toMatch(/timestamp|generatedAt|"date"/i);
  });

  it('sorts embedded capabilities/issues/findings deterministically', () => {
    const report = buildConformanceReport(inputs);
    expect(report.capabilities.map((c) => c.id)).toEqual([
      'bloom.block.A',
      'bloom.block.B',
    ]);
    expect(report.structuralIssues.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(report.findings.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('redacts sensitive values embedded in capability sources/facts but preserves design tokens', () => {
    const report = buildConformanceReport({
      ...inputs,
      capabilities: [
        cap('bloom.theme-setting.token.--color-bg', {
          defaultValue: { tokens: { '--color-bg': '#000' } },
          sources: [{ kind: 'user', ref: 'contact admin@merfy.ru' }],
        }),
      ],
      structuralIssues: [
        issue('i', {
          canonicalFacts: { password: 'p', tokens: { '--radius-button': '8px' } },
        }),
      ],
    });
    const c = report.capabilities[0] as any;
    expect(c.defaultValue.tokens['--color-bg']).toBe('#000');
    expect(c.sources[0].ref).toBe('[REDACTED]');
    const i = report.structuralIssues[0] as any;
    expect(i.canonicalFacts.password).toBe('[REDACTED]');
    expect(i.canonicalFacts.tokens['--radius-button']).toBe('8px');
  });

  it('two unchanged runs produce byte-identical JSON', () => {
    const a = JSON.stringify(buildConformanceReport(inputs));
    const b = JSON.stringify(buildConformanceReport(inputs));
    expect(a).toEqual(b);
  });

  it('renders a deterministic Markdown summary with no timestamp', () => {
    const report = buildConformanceReport(inputs);
    expect(typeof report.markdown).toBe('string');
    expect(report.markdown).toContain('bloom');
    expect(report.markdown).not.toMatch(/timestamp|generatedAt/i);
    const again = buildConformanceReport(inputs);
    expect(again.markdown).toEqual(report.markdown);
  });
});
