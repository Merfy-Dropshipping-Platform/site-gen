import {
  LEGACY_SEED_SCHEMES,
  isLegacySeed,
} from '../themes/legacy-seed-schemes';

describe('LEGACY_SEED_SCHEMES', () => {
  it('has 5 schemes with ids scheme-1 through scheme-5', () => {
    expect(LEGACY_SEED_SCHEMES.map((s) => s.id)).toEqual([
      'scheme-1',
      'scheme-2',
      'scheme-3',
      'scheme-4',
      'scheme-5',
    ]);
  });

  it('scheme-1 is dark (black bg, white text) per legacy seed', () => {
    expect(LEGACY_SEED_SCHEMES[0].background).toBe('#000000');
    expect(LEGACY_SEED_SCHEMES[0].text).toBe('#FFFFFF');
  });

  it('scheme-2 is light (white bg, black text)', () => {
    expect(LEGACY_SEED_SCHEMES[1].background).toBe('#FFFFFF');
    expect(LEGACY_SEED_SCHEMES[1].text).toBe('#000000');
  });

  it('isLegacySeed returns true for a literal structural copy', () => {
    const copy = JSON.parse(JSON.stringify(LEGACY_SEED_SCHEMES));
    expect(isLegacySeed(copy)).toBe(true);
  });

  it('returns false when any scheme colour differs', () => {
    const mutated = JSON.parse(JSON.stringify(LEGACY_SEED_SCHEMES));
    mutated[0].background = '#123456';
    expect(isLegacySeed(mutated)).toBe(false);
  });

  it('returns false for empty or shorter arrays', () => {
    expect(isLegacySeed([])).toBe(false);
    expect(isLegacySeed(LEGACY_SEED_SCHEMES.slice(0, 3))).toBe(false);
  });

  it('returns false for non-array input', () => {
    expect(isLegacySeed(null)).toBe(false);
    expect(isLegacySeed({})).toBe(false);
    expect(isLegacySeed('not an array')).toBe(false);
  });
});
