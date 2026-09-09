/**
 * Stable capability-ID construction and deterministic aggregation helpers.
 *
 * IDs are dot-joined canonical paths, e.g.
 *   bloom.theme-setting.token.--radius-button
 *   bloom.block.Slideshow.slides[].heading
 *
 * A "segment" is one dot-joined piece. Segments may embed dots (a dotted field
 * path such as `productCard.nextPhoto`) and the array marker `[]`, but must
 * never be empty, whitespace-only or path-like (contain `/`). Arbitrary
 * storefront values (routes, `:id` params, colon event/storage keys, Unicode)
 * are turned into safe segments with `encodeOpaqueSegment`, a lossless base64url
 * encoding — never lossy slugification. The raw value is preserved separately in
 * the capability's data/source; the ID only needs to be stable and distinct.
 */

import type { CapabilityStatus } from './types';

const OPAQUE_PREFIX = 'b64_';

function assertNonEmptyToken(value: string, what: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`makeCapabilityId: ${what} must be a non-empty string`);
  }
}

/**
 * Reject empty/whitespace-only or path-like ("/"-containing) segments. Dots and
 * the `[]` array marker are allowed so that dotted field paths and array fields
 * remain human-readable. Everything else must be routed through
 * `encodeOpaqueSegment` before it becomes a segment.
 */
function assertValidSegment(segment: string, index: number): void {
  if (typeof segment !== 'string' || segment.trim() === '') {
    throw new Error(
      `makeCapabilityId: segment[${index}] must be a non-empty, non-whitespace string`,
    );
  }
  if (segment.includes('/')) {
    throw new Error(
      `makeCapabilityId: segment[${index}] is path-like ("/"); encode it with encodeOpaqueSegment first`,
    );
  }
}

/**
 * Build a canonical capability ID from a theme, a surface and one or more
 * trailing segments. Throws on any empty/whitespace/path-like part.
 */
export function makeCapabilityId(
  theme: string,
  surface: string,
  ...segments: string[]
): string {
  assertNonEmptyToken(theme, 'theme');
  assertNonEmptyToken(surface, 'surface');
  if (segments.length === 0) {
    throw new Error(
      'makeCapabilityId: at least one trailing segment is required (theme+surface alone is not a capability)',
    );
  }
  segments.forEach(assertValidSegment);
  return [theme, surface, ...segments].join('.');
}

/**
 * Losslessly encode an arbitrary raw string into a single safe capability
 * segment: `b64_<UTF-8 base64url>`. base64url uses only `A-Za-z0-9-_`, so the
 * result never contains `.`, `/` or padding, making it a valid segment and
 * unambiguous under dot joining.
 */
export function encodeOpaqueSegment(raw: string): string {
  const b64 = Buffer.from(raw, 'utf8').toString('base64url');
  return `${OPAQUE_PREFIX}${b64}`;
}

/**
 * Inverse of {@link encodeOpaqueSegment}. Throws when the value is not a
 * `b64_`-prefixed opaque segment.
 */
export function decodeOpaqueSegment(segment: string): string {
  if (typeof segment !== 'string' || !segment.startsWith(OPAQUE_PREFIX)) {
    throw new Error(
      `decodeOpaqueSegment: value is not an opaque segment (missing "${OPAQUE_PREFIX}" prefix)`,
    );
  }
  const body = segment.slice(OPAQUE_PREFIX.length);
  return Buffer.from(body, 'base64url').toString('utf8');
}

/**
 * Build a stable endpoint capability ID: the uppercased HTTP method occupies its
 * own segment and the raw route is preserved verbatim inside an opaque segment,
 * so `/a-b` vs `/a/b` and `:id` vs literal `id` always produce distinct IDs.
 */
export function makeEndpointId(
  theme: string,
  method: string,
  rawRoute: string,
): string {
  assertNonEmptyToken(method, 'method');
  assertNonEmptyToken(rawRoute, 'rawRoute');
  return makeCapabilityId(
    theme,
    'flow',
    method.toUpperCase(),
    encodeOpaqueSegment(rawRoute),
  );
}

/**
 * Return a NEW array sorted deterministically by `id` using byte-wise ordering
 * (not locale-dependent `localeCompare`). Never mutates the input; the caller's
 * source insertion order (captured elsewhere as `order`) is preserved on the
 * original rows.
 */
export function sortById<T extends { id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}

// Priority: GAP > NEEDS_DECISION > UNKNOWN > PASS (higher number wins).
const STATUS_PRIORITY: Record<CapabilityStatus, number> = {
  GAP: 3,
  NEEDS_DECISION: 2,
  UNKNOWN: 1,
  PASS: 0,
};

/**
 * Aggregate a capability's overall status from its per-scenario case results and
 * any structural failure IDs. Any structural failure forces `GAP`. Otherwise the
 * highest-priority case status wins. An editable row with no cases yet (Plan 2
 * has not supplied effect evidence) is `UNKNOWN`, never a false `PASS`.
 */
export function aggregateCapabilityStatus(
  caseResults: ReadonlyArray<{ status: CapabilityStatus }>,
  structuralFailureIds: readonly string[],
): CapabilityStatus {
  if (structuralFailureIds.length > 0) {
    return 'GAP';
  }
  if (caseResults.length === 0) {
    return 'UNKNOWN';
  }
  let winner: CapabilityStatus = 'PASS';
  for (const { status } of caseResults) {
    if (STATUS_PRIORITY[status] > STATUS_PRIORITY[winner]) {
      winner = status;
    }
  }
  return winner;
}
