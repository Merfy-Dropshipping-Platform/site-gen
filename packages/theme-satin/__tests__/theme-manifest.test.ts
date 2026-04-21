import fs from 'node:fs';
import path from 'node:path';
import { ThemeManifestSchema } from '../../theme-contract/validators/ThemeManifestSchema';

describe('@merfy/theme-satin theme.json', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', 'theme.json'), 'utf-8'),
  );

  it('matches ThemeManifestSchema', () => {
    const result = ThemeManifestSchema.safeParse(manifest);
    if (!result.success) {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it('has id "satin"', () => {
    expect(manifest.id).toBe('satin');
  });

  it('extends @merfy/theme-base', () => {
    expect(manifest.extends).toMatch(/^@merfy\/theme-base@/);
  });

  it('has exactly 4 monochrome color schemes', () => {
    expect(manifest.colorSchemes.length).toBe(4);
    const names = manifest.colorSchemes.map((s: { name: string }) => s.name);
    expect(names).toEqual(['Black', 'White', 'Light Gray', 'Dark Gray']);
  });

  it('first scheme has required color tokens', () => {
    const first = manifest.colorSchemes[0];
    const required = [
      '--color-bg',
      '--color-surface',
      '--color-heading',
      '--color-text',
      '--color-muted',
      '--color-primary',
      '--color-accent',
      '--color-button-bg',
      '--color-button-text',
      '--color-button-border',
      '--color-button-2-bg',
      '--color-button-2-text',
      '--color-button-2-border',
    ];
    for (const key of required) {
      expect(first.tokens[key]).toBeDefined();
    }
  });

  it('defaults express satin signature: 1320px container + flat (0px) radii', () => {
    expect(manifest.defaults['--container-max-width']).toBe('1320px');
    expect(manifest.defaults['--radius-button']).toBe('0px');
    expect(manifest.defaults['--radius-card']).toBe('0px');
    expect(manifest.defaults['--radius-input']).toBe('0px');
  });

  it('declares Kelly Slab + Arsenal + Manrope fonts', () => {
    const families = manifest.fonts.map((f: { family: string }) => f.family);
    expect(families).toContain('Kelly Slab');
    expect(families).toContain('Arsenal');
    expect(families).toContain('Manrope');
  });

  it('overrides Header and Footer with rationale', () => {
    expect(manifest.blocks.Header.override).toBeDefined();
    expect(manifest.blocks.Header.override.path).toBe('./blocks/Header');
    expect(manifest.blocks.Footer.override).toBeDefined();
    expect(manifest.blocks.Footer.override.path).toBe('./blocks/Footer');
  });
});
