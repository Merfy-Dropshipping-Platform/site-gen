/**
 * Parity: assembleFromPackages uses the SAME tokens generator as the preview
 * endpoint. When called with the same themeSettings + themeName, the output
 * tokens.css is byte-for-byte identical.
 *
 * Replaces an earlier `customTokens` API (W3C merge) with the themeSettings
 * flow from revision.data — the canonical source of merchant customizations.
 */
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assembleFromPackages } from '../assemble-from-packages';
import { buildTokensCss } from '../../themes/tokens-css';

async function setupPackages(themeId: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'merfy-assemble-'));
  await mkdir(join(root, 'theme-base'), { recursive: true });
  await writeFile(
    join(root, 'theme-base', 'package.json'),
    JSON.stringify({ name: '@merfy/theme-base' }),
  );
  await mkdir(join(root, `theme-${themeId}`), { recursive: true });
  await writeFile(
    join(root, `theme-${themeId}`, 'package.json'),
    JSON.stringify({ name: `@merfy/theme-${themeId}` }),
  );
  // tokens.json is optional now — buildTokensCss reads manifest instead,
  // but the theme package dir still needs to exist for themeCopied=true.
  return root;
}

describe('assembleFromPackages — themeSettings-based tokens (preview↔live parity)', () => {
  it('emits tokens.css that matches buildTokensCss output for the same inputs', async () => {
    const packagesRoot = await setupPackages('rose');
    const outputDir = await mkdtemp(join(tmpdir(), 'merfy-out-'));

    const themeSettings = {
      buttonRadius: 12,
      headingFont: 'inter',
      colorSchemes: [
        { id: '1', background: '#ffffff', text: '#000000' },
      ],
    };

    const result = await assembleFromPackages({
      themeName: 'rose',
      outputDir,
      packagesRoot,
      themeSettings,
    });

    expect(result.tokensCssGenerated).toBe(true);
    const cssPath = join(outputDir, 'src', 'styles', 'tokens.css');
    expect(existsSync(cssPath)).toBe(true);

    const actual = await readFile(cssPath, 'utf8');
    const expected = buildTokensCss(themeSettings, 'rose');
    // The file may contain copyStyles prelude; ensure the generator's output
    // is present byte-for-byte.
    expect(actual).toContain(expected.trim());
  });

  it('falls back to manifest defaults when no themeSettings supplied', async () => {
    const packagesRoot = await setupPackages('rose');
    const outputDir = await mkdtemp(join(tmpdir(), 'merfy-out-'));

    await assembleFromPackages({
      themeName: 'rose',
      outputDir,
      packagesRoot,
    });

    const css = await readFile(join(outputDir, 'src', 'styles', 'tokens.css'), 'utf8');
    // Manifest-driven rose defaults include --font-heading (Bitter).
    expect(css).toMatch(/--font-heading:/);
    expect(css).toMatch(/--radius-button:/);
  });

  it('reflects themeSettings color scheme choices in emitted CSS', async () => {
    const packagesRoot = await setupPackages('rose');
    const outputDir = await mkdtemp(join(tmpdir(), 'merfy-out-'));

    const themeSettings = {
      colorSchemes: [
        { id: 'scheme-7', background: '#112233', text: '#ffffff' },
      ],
    };

    await assembleFromPackages({
      themeName: 'rose',
      outputDir,
      packagesRoot,
      themeSettings,
    });

    const css = await readFile(join(outputDir, 'src', 'styles', 'tokens.css'), 'utf8');
    expect(css).toContain('.color-scheme-7');
    // 0x11 0x22 0x33 → "17 34 51"
    expect(css).toMatch(/--color-bg:\s*17 34 51/);
  });
});
