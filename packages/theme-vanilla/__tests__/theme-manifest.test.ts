import fs from 'node:fs';
import path from 'node:path';
import { ThemeManifestSchema } from '../../theme-contract/validators/ThemeManifestSchema';

describe('@merfy/theme-vanilla theme.json', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', 'theme.json'), 'utf-8'),
  );

  it('matches ThemeManifestSchema', () => {
    const result = ThemeManifestSchema.safeParse(manifest);
    if (!result.success) {
      // surface all zod issues for debugging
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it('has id "vanilla"', () => {
    expect(manifest.id).toBe('vanilla');
  });

  it('extends @merfy/theme-base', () => {
    expect(manifest.extends).toMatch(/^@merfy\/theme-base@/);
  });

  it('has exactly 4 olive color schemes', () => {
    expect(manifest.colorSchemes.length).toBe(4);
    const names = manifest.colorSchemes.map((s: { name: string }) => s.name);
    expect(names).toEqual(['1', '2', '3', '4']);
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

  it('defaults express vanilla signature: 1320px container + 0px radii', () => {
    expect(manifest.defaults['--container-max-width']).toBe('1320px');
    expect(manifest.defaults['--radius-button']).toBe('0px');
    expect(manifest.defaults['--radius-input']).toBe('0px');
    expect(manifest.defaults['--radius-card']).toBe('0px');
  });

  it('declares Bitter + Arsenal fonts (plus Exo 2 + Inter)', () => {
    const families = manifest.fonts.map((f: { family: string }) => f.family);
    expect(families).toContain('Bitter');
    expect(families).toContain('Arsenal');
    expect(families).toContain('Exo 2');
    expect(families).toContain('Inter');
  });

  it('does NOT override Header or Footer (no-overrides architecture, spec 084)', () => {
    // Spec 084 §2.2: vanilla отказался от override-блоков — все различия
    // выражаются через blockDefaults + additive variants в theme-base.
    expect(manifest.blocks?.Header?.override).toBeUndefined();
    expect(manifest.blocks?.Footer?.override).toBeUndefined();
  });

  it('blockDefaults configure universal blocks (Header logoPosition, Footer variant)', () => {
    expect(manifest.blockDefaults.Header.logoPosition).toBe('center-absolute');
    expect(manifest.blockDefaults.Footer.variant).toBe('2-part-asymmetric');
    expect(manifest.blockDefaults.Footer.bottomStrip.enabled).toBe(true);
  });
});
