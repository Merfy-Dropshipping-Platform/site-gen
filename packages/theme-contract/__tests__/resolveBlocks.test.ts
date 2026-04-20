import { resolveBlocks } from '../resolver/resolveBlocks';

describe('resolveBlocks', () => {
  const baseBlocks = {
    Hero:   { source: 'base' as const, path: '@merfy/theme-base/blocks/Hero' },
    Footer: { source: 'base' as const, path: '@merfy/theme-base/blocks/Footer' },
    Header: { source: 'base' as const, path: '@merfy/theme-base/blocks/Header' },
  };

  it('uses base when theme does not override', () => {
    const r = resolveBlocks(baseBlocks, { blocks: {}, features: {}, customBlocks: {} });
    expect(r.Hero.source).toBe('base');
    expect(r.Footer.source).toBe('base');
  });

  it('overrides with theme when theme.blocks[X].override present', () => {
    const r = resolveBlocks(baseBlocks, {
      blocks: { Hero: { override: { path: './blocks/Hero', reason: 'ok' } } },
      features: {},
      customBlocks: {},
    });
    expect(r.Hero.source).toBe('theme');
    expect(r.Hero.path).toBe('./blocks/Hero');
    expect(r.Footer.source).toBe('base');
  });

  it('passes through variant-only configs (still uses base block)', () => {
    const r = resolveBlocks(baseBlocks, {
      blocks: { Header: { variant: 'minimal' } },
      features: {},
      customBlocks: {},
    });
    expect(r.Header.source).toBe('base');
    expect(r.Header.variant).toBe('minimal');
  });

  it('includes custom blocks when their feature is enabled', () => {
    const r = resolveBlocks(baseBlocks, {
      blocks: {},
      features: { 'flower-catalog': true },
      customBlocks: {
        BouquetShowcase: { path: './customBlocks/BouquetShowcase', requiredFeatures: ['flower-catalog'] },
      },
    });
    expect(r.BouquetShowcase.source).toBe('custom');
  });

  it('excludes custom blocks when feature disabled', () => {
    const r = resolveBlocks(baseBlocks, {
      blocks: {},
      features: { 'flower-catalog': false },
      customBlocks: {
        BouquetShowcase: { path: './customBlocks/BouquetShowcase', requiredFeatures: ['flower-catalog'] },
      },
    });
    expect(r.BouquetShowcase).toBeUndefined();
  });

  it('includes custom blocks with no required features', () => {
    const r = resolveBlocks(baseBlocks, {
      blocks: {},
      features: {},
      customBlocks: { SpecialBlock: { path: './x' } },
    });
    expect(r.SpecialBlock.source).toBe('custom');
  });
});
