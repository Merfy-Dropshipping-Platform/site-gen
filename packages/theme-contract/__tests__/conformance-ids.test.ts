import {
  makeCapabilityId,
  encodeOpaqueSegment,
  decodeOpaqueSegment,
  makeEndpointId,
  sortById,
  aggregateCapabilityStatus,
} from '../conformance/ids';
import type {
  CapabilityCaseResult,
  CapabilityStatus,
  CapabilityRecord,
} from '../conformance/types';

// A minimal case-result factory: only fields the aggregator reads matter.
function caseResult(status: CapabilityStatus): CapabilityCaseResult {
  return {
    scenarioId: 's',
    value: null,
    mode: 'live',
    viewport: 'desktop',
    expectedEffect: {
      kind: 'custom',
      target: 't',
      comparator: 'equals',
      expected: null,
    },
    status,
    evidenceRefs: [],
    artifactRefs: [],
    failureIds: [],
  };
}

describe('makeCapabilityId — canonical segments', () => {
  it('joins theme, surface and plain segments with a dot', () => {
    expect(makeCapabilityId('bloom', 'theme-setting', 'token', '--radius-button')).toBe(
      'bloom.theme-setting.token.--radius-button',
    );
  });

  it('accepts a dotted field path as a single segment', () => {
    expect(makeCapabilityId('bloom', 'block', 'ProductCard', 'productCard.nextPhoto')).toBe(
      'bloom.block.ProductCard.productCard.nextPhoto',
    );
  });

  it('accepts a canonical block name and an array marker []', () => {
    expect(makeCapabilityId('bloom', 'block', 'Slideshow', 'slides[]', 'heading')).toBe(
      'bloom.block.Slideshow.slides[].heading',
    );
  });

  it('produces unique IDs for distinct segment tuples', () => {
    const a = makeCapabilityId('bloom', 'block', 'Publications', 'normalization', 'cards');
    const b = makeCapabilityId('bloom', 'block', 'Publications', 'normalization', 'columns');
    expect(a).not.toBe(b);
    expect(new Set([a, b]).size).toBe(2);
  });
});

describe('makeCapabilityId — segment rejection', () => {
  it('rejects an empty segment', () => {
    expect(() => makeCapabilityId('bloom', 'block', '')).toThrow();
  });

  it('rejects a whitespace-only segment', () => {
    expect(() => makeCapabilityId('bloom', 'block', '   ')).toThrow();
  });

  it('rejects a path-like segment containing a slash', () => {
    expect(() => makeCapabilityId('bloom', 'flow', '/checkout')).toThrow();
    expect(() => makeCapabilityId('bloom', 'flow', 'a/b')).toThrow();
  });

  it('rejects an empty theme or surface', () => {
    expect(() => makeCapabilityId('', 'block', 'X')).toThrow();
    expect(() => makeCapabilityId('bloom', '', 'X')).toThrow();
  });

  it('rejects zero trailing segments', () => {
    // theme + surface only is not a capability id
    expect(() => makeCapabilityId('bloom', 'block')).toThrow();
  });
});

describe('encodeOpaqueSegment / decodeOpaqueSegment — lossless round trip', () => {
  it('prefixes with b64_ and uses base64url (no + / = padding chars)', () => {
    const enc = encodeOpaqueSegment('/a/b');
    expect(enc.startsWith('b64_')).toBe(true);
    const body = enc.slice('b64_'.length);
    expect(body).not.toMatch(/[+/=]/);
  });

  it('round-trips arbitrary storefront values exactly', () => {
    for (const raw of ['/a/b', '/a-b', ':id', 'id', 'bloom:cart:updated', 'Тест 🎯', '']) {
      expect(decodeOpaqueSegment(encodeOpaqueSegment(raw))).toBe(raw);
    }
  });

  it('is a valid capability segment (no slash) and survives makeCapabilityId', () => {
    const seg = encodeOpaqueSegment('/a/b');
    expect(() => makeCapabilityId('bloom', 'flow', seg)).not.toThrow();
  });

  it('rejects decoding a value without the b64_ prefix', () => {
    expect(() => decodeOpaqueSegment('plain')).toThrow();
  });
});

describe('makeCapabilityId — distinct opaque encodings', () => {
  it('distinguishes /a-b from /a/b once encoded', () => {
    const ab = makeCapabilityId('bloom', 'flow', encodeOpaqueSegment('/a-b'));
    const aSlashB = makeCapabilityId('bloom', 'flow', encodeOpaqueSegment('/a/b'));
    expect(ab).not.toBe(aSlashB);
  });

  it('distinguishes :id from a literal id once encoded', () => {
    const colon = makeCapabilityId('bloom', 'flow', encodeOpaqueSegment(':id'));
    const literal = makeCapabilityId('bloom', 'flow', encodeOpaqueSegment('id'));
    expect(colon).not.toBe(literal);
  });

  it('encodes colon event/storage keys distinctly and reversibly', () => {
    const evt = encodeOpaqueSegment('bloom:cart:updated');
    const store = encodeOpaqueSegment('bloom:cart:v1');
    expect(evt).not.toBe(store);
    expect(decodeOpaqueSegment(evt)).toBe('bloom:cart:updated');
    expect(decodeOpaqueSegment(store)).toBe('bloom:cart:v1');
  });

  it('encodes Unicode segments reversibly and distinctly', () => {
    const a = encodeOpaqueSegment('Тест');
    const b = encodeOpaqueSegment('Test');
    expect(a).not.toBe(b);
    expect(decodeOpaqueSegment(a)).toBe('Тест');
  });
});

describe('makeEndpointId — method segment plus encoded route', () => {
  it('puts uppercase method in its own segment and the raw route in an encoded segment', () => {
    const id = makeEndpointId('bloom', 'get', '/api/sites/:id/storefront-data');
    expect(id.split('.').slice(0, 3)).toEqual(['bloom', 'flow', 'GET']);
    // last segment must be the opaque-encoded raw route, decodable back to the exact route
    const last = id.split('.').pop() as string;
    expect(decodeOpaqueSegment(last)).toBe('/api/sites/:id/storefront-data');
  });

  it('distinguishes /a-b from /a/b and :id from literal id', () => {
    expect(makeEndpointId('bloom', 'GET', '/a-b')).not.toBe(
      makeEndpointId('bloom', 'GET', '/a/b'),
    );
    expect(makeEndpointId('bloom', 'GET', '/x/:id')).not.toBe(
      makeEndpointId('bloom', 'GET', '/x/id'),
    );
  });

  it('normalizes method case but preserves the raw route verbatim in data', () => {
    const lower = makeEndpointId('bloom', 'post', '/checkout');
    const upper = makeEndpointId('bloom', 'POST', '/checkout');
    expect(lower).toBe(upper);
  });
});

describe('sortById — deterministic, non-mutating', () => {
  it('returns a new array sorted by id and leaves the input untouched', () => {
    const input = [
      { id: 'bloom.b.c' },
      { id: 'bloom.a.z' },
      { id: 'bloom.a.a' },
    ];
    const snapshot = input.map((r) => r.id);
    const sorted = sortById(input);
    expect(sorted).not.toBe(input);
    expect(sorted.map((r) => r.id)).toEqual(['bloom.a.a', 'bloom.a.z', 'bloom.b.c']);
    // input order preserved (non-mutating)
    expect(input.map((r) => r.id)).toEqual(snapshot);
  });

  it('is stable and idempotent', () => {
    const input = [{ id: 'x.2' }, { id: 'x.1' }];
    const once = sortById(input);
    const twice = sortById(once);
    expect(twice.map((r) => r.id)).toEqual(once.map((r) => r.id));
  });

  it('sorts full CapabilityRecord-shaped rows by id', () => {
    const rows: Array<Pick<CapabilityRecord, 'id'>> = [{ id: 'b' }, { id: 'a' }];
    expect(sortById(rows).map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('aggregateCapabilityStatus — priority GAP > NEEDS_DECISION > UNKNOWN > PASS', () => {
  it('a structural failure forces GAP regardless of case results', () => {
    expect(aggregateCapabilityStatus([caseResult('PASS')], ['some.failure'])).toBe('GAP');
  });

  it('returns GAP when any case is GAP', () => {
    expect(
      aggregateCapabilityStatus([caseResult('PASS'), caseResult('GAP')], []),
    ).toBe('GAP');
  });

  it('GAP outranks NEEDS_DECISION', () => {
    expect(
      aggregateCapabilityStatus([caseResult('NEEDS_DECISION'), caseResult('GAP')], []),
    ).toBe('GAP');
  });

  it('NEEDS_DECISION outranks UNKNOWN', () => {
    expect(
      aggregateCapabilityStatus([caseResult('UNKNOWN'), caseResult('NEEDS_DECISION')], []),
    ).toBe('NEEDS_DECISION');
  });

  it('UNKNOWN outranks PASS', () => {
    expect(
      aggregateCapabilityStatus([caseResult('PASS'), caseResult('UNKNOWN')], []),
    ).toBe('UNKNOWN');
  });

  it('all PASS with no structural failures is PASS', () => {
    expect(
      aggregateCapabilityStatus([caseResult('PASS'), caseResult('PASS')], []),
    ).toBe('PASS');
  });

  it('an editable row with no cases is UNKNOWN', () => {
    expect(aggregateCapabilityStatus([], [])).toBe('UNKNOWN');
  });
});
