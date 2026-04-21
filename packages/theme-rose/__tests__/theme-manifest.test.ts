import fs from 'node:fs';
import path from 'node:path';
import { ThemeManifestSchema } from '../../theme-contract/validators/ThemeManifestSchema';

describe('@merfy/theme-rose theme.json', () => {
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

  it('has id "rose"', () => {
    expect(manifest.id).toBe('rose');
  });

  it('extends @merfy/theme-base', () => {
    expect(manifest.extends).toMatch(/^@merfy\/theme-base@/);
  });

  it('has at least one colorScheme with required color tokens', () => {
    expect(manifest.colorSchemes.length).toBeGreaterThanOrEqual(1);
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
});
