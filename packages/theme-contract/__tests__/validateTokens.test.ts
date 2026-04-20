import { validateTokens } from '../validators/validateTokens';

describe('validateTokens', () => {
  it('passes for registry-known keys', () => {
    const r = validateTokens({ '--radius-button': '8px', '--font-heading': "'Bitter'" });
    expect(r.ok).toBe(true);
  });

  it('fails for unknown key', () => {
    const r = validateTokens({ '--unknown-key': 'x' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/--unknown-key/);
  });

  it('enforces min/max on radius tokens', () => {
    const r = validateTokens({ '--radius-button': '100px' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/max 48/);
  });

  it('enforces enum values on variant tokens', () => {
    const r = validateTokens({ '--button-style': 'bouncy' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/outline|solid/);
  });

  it('accepts valid enum value', () => {
    const r = validateTokens({ '--button-style': 'outline' });
    expect(r.ok).toBe(true);
  });
});
