/**
 * URL query collection filter — extracted logic test.
 *
 * Production behavior: PopularProducts.astro reads
 * Astro.url.searchParams.get('collection'). If present, it overrides the
 * block's collection prop. This unit-tests the pure helper extracted from
 * the .astro file (resolveActiveCollection).
 */
import { resolveActiveCollection } from '../blocks/PopularProducts/url-filter';

describe('PopularProducts URL query filter', () => {
  it('returns URL query collection when present', () => {
    expect(resolveActiveCollection('riviera', 'urban')).toBe('riviera');
  });

  it('falls back to block prop when URL query is null', () => {
    expect(resolveActiveCollection(null, 'urban')).toBe('urban');
  });

  it('falls back to block prop when URL query is undefined', () => {
    expect(resolveActiveCollection(undefined, 'urban')).toBe('urban');
  });

  it('falls back to block prop when URL query is empty string', () => {
    expect(resolveActiveCollection('', 'urban')).toBe('urban');
  });

  it('returns undefined when both are absent', () => {
    expect(resolveActiveCollection(null, undefined)).toBeUndefined();
    expect(resolveActiveCollection(null, '')).toBeUndefined();
  });

  it('trims whitespace from URL query', () => {
    expect(resolveActiveCollection('  riviera  ', undefined)).toBe('riviera');
  });

  it('trims whitespace from block prop', () => {
    expect(resolveActiveCollection(null, '  urban  ')).toBe('urban');
  });
});
