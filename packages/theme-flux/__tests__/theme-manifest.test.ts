import fs from 'node:fs';
import path from 'node:path';
import { ThemeManifestSchema } from '../../theme-contract/validators/ThemeManifestSchema';

describe('@merfy/theme-flux theme.json', () => {
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

  it('has id "flux"', () => {
    expect(manifest.id).toBe('flux');
  });

  it('extends @merfy/theme-base', () => {
    expect(manifest.extends).toMatch(/^@merfy\/theme-base@/);
  });

  it('has exactly 4 color schemes (dark+orange accent)', () => {
    expect(manifest.colorSchemes.length).toBe(4);
    const names = manifest.colorSchemes.map((s: { name: string }) => s.name);
    expect(names).toEqual(['Black', 'White', 'Light Gray', 'Dark']);
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

  it('defaults express flux signature: 1320px container + 6px buttons + 12px cards', () => {
    expect(manifest.defaults['--container-max-width']).toBe('1320px');
    expect(manifest.defaults['--radius-button']).toBe('6px');
    expect(manifest.defaults['--radius-card']).toBe('12px');
    expect(manifest.defaults['--radius-input']).toBe('8px');
  });

  it('declares Roboto Flex + Barlow fonts', () => {
    const families = manifest.fonts.map((f: { family: string }) => f.family);
    expect(families).toContain('Roboto Flex');
    expect(families).toContain('Barlow');
  });

  it('overrides Header and Footer with rationale', () => {
    expect(manifest.blocks.Header.override).toBeDefined();
    expect(manifest.blocks.Header.override.path).toBe('./blocks/Header');
    expect(manifest.blocks.Footer.override).toBeDefined();
    expect(manifest.blocks.Footer.override.path).toBe('./blocks/Footer');
  });

  it('orange accent #fa5109 is present in first scheme', () => {
    const first = manifest.colorSchemes[0];
    expect(first.tokens['--color-accent']).toBe('250 81 9');
    expect(first.tokens['--color-button-bg']).toBe('250 81 9');
  });
});
