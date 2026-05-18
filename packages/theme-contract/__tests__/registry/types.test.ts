import type { Block, Registry, ValidationError } from '../../registry/types';

describe('Registry types', () => {
  it('Block type covers all required fields', () => {
    const b: Block = {
      name: 'Hero',
      label: 'Главный экран',
      category: 'media',
      paletteOrder: 10,
      hasAstroRenderer: true,
      hasOverride: ['rose'],
      siblings: ['Hero.classes.ts', 'Hero.puckConfig.ts'],
      schemaJson: {},
      defaults: {},
    };
    expect(b.name).toBe('Hero');
  });
  it('ValidationError has narrow code union', () => {
    const e: ValidationError = { code: 'MISSING_ASTRO', message: 'x' };
    const codes: ValidationError['code'][] = [
      'MISSING_ASTRO', 'BROKEN_IMPORT', 'INVALID_SCHEMA', 'ASSET_ASYMMETRY', 'ORPHAN_OVERRIDE',
    ];
    expect(codes).toContain(e.code);
  });
});
