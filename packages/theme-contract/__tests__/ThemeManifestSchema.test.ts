import { ThemeManifestSchema } from '../validators/ThemeManifestSchema';

describe('ThemeManifestSchema', () => {
  const validManifest = {
    id: 'rose',
    name: 'Rose',
    version: '1.0.0',
    extends: '@merfy/theme-base@workspace:*',
    defaults: { '--radius-button': '8px' },
    colorSchemes: [{
      id: 'scheme-1',
      name: 'Light',
      tokens: { '--color-bg': '255 255 255', '--color-heading': '17 17 17' },
    }],
    blocks: {},
    features: { 'newsletter': true },
    fonts: [{ family: 'Bitter', weights: [400], source: 'google' }],
  };

  it('accepts a valid manifest', () => {
    const result = ThemeManifestSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
  });

  it('rejects invalid id (non-kebab)', () => {
    const bad = { ...validManifest, id: 'Rose Fancy' };
    const result = ThemeManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects invalid semver version', () => {
    const bad = { ...validManifest, version: 'v1' };
    expect(ThemeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('requires reason when block has override', () => {
    const bad = {
      ...validManifest,
      blocks: { Hero: { override: { path: './blocks/Hero' /* no reason */ } } },
    };
    expect(ThemeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts block override with reason', () => {
    const ok = {
      ...validManifest,
      blocks: { Hero: { override: { path: './blocks/Hero', reason: 'dual image layout' } } },
    };
    expect(ThemeManifestSchema.safeParse(ok).success).toBe(true);
  });

  it('accepts block with variant only', () => {
    const ok = { ...validManifest, blocks: { Slideshow: { variant: 'fade' } } };
    expect(ThemeManifestSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects unknown token keys in defaults', () => {
    const bad = { ...validManifest, defaults: { '--bogus-token': '1px' } };
    expect(ThemeManifestSchema.safeParse(bad).success).toBe(false);
  });
});
