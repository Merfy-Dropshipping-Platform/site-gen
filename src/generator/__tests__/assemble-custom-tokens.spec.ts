/**
 * Phase 2e: assemble-from-packages respects opts.customTokens, merging them
 * over the per-theme `packages/theme-<name>/tokens.json` before emitting
 * `src/styles/tokens.css`.
 */
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assembleFromPackages } from '../assemble-from-packages';

async function setupPackages(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'merfy-assemble-'));
  // theme-base (minimal — just enough for assembler to find it)
  await mkdir(join(root, 'theme-base'), { recursive: true });
  await writeFile(
    join(root, 'theme-base', 'package.json'),
    JSON.stringify({ name: '@merfy/theme-base' }),
  );
  // theme-test with real tokens.json
  await mkdir(join(root, 'theme-test'), { recursive: true });
  await writeFile(
    join(root, 'theme-test', 'package.json'),
    JSON.stringify({ name: '@merfy/theme-test' }),
  );
  const baseTokens = {
    color: {
      bg: { $value: '#ffffff', $type: 'color' },
      primary: { $value: '#000000', $type: 'color' },
    },
    radius: {
      button: { $value: '8px', $type: 'dimension' },
      card: { $value: '10px', $type: 'dimension' },
    },
  };
  await writeFile(join(root, 'theme-test', 'tokens.json'), JSON.stringify(baseTokens));
  return root;
}

describe('assembleFromPackages — customTokens merge', () => {
  it('overrides per-category token values', async () => {
    const packagesRoot = await setupPackages();
    const outputDir = await mkdtemp(join(tmpdir(), 'merfy-out-'));

    const result = await assembleFromPackages({
      themeName: 'test',
      outputDir,
      packagesRoot,
      customTokens: {
        radius: {
          button: { $value: '100px', $type: 'dimension' }, // override
          // card stays as base (10px)
        },
      },
    });

    expect(result.tokensCssGenerated).toBe(true);
    const cssPath = join(outputDir, 'src', 'styles', 'tokens.css');
    expect(existsSync(cssPath)).toBe(true);
    const css = await readFile(cssPath, 'utf8');

    // Overridden — pill radius
    expect(css).toMatch(/--radius-button:\s*100px/);
    // Non-overridden — base value preserved
    expect(css).toMatch(/--radius-card:\s*10px/);
  });

  it('falls back to package tokens when no override given', async () => {
    const packagesRoot = await setupPackages();
    const outputDir = await mkdtemp(join(tmpdir(), 'merfy-out-'));

    await assembleFromPackages({
      themeName: 'test',
      outputDir,
      packagesRoot,
    });

    const css = await readFile(join(outputDir, 'src', 'styles', 'tokens.css'), 'utf8');
    expect(css).toMatch(/--radius-button:\s*8px/);
  });

  it('adds categories that exist only in custom tokens', async () => {
    const packagesRoot = await setupPackages();
    const outputDir = await mkdtemp(join(tmpdir(), 'merfy-out-'));

    await assembleFromPackages({
      themeName: 'test',
      outputDir,
      packagesRoot,
      customTokens: {
        font: {
          heading: { $value: "'Bitter', serif", $type: 'fontFamily' },
        },
      },
    });

    const css = await readFile(join(outputDir, 'src', 'styles', 'tokens.css'), 'utf8');
    expect(css).toContain('--font-heading');
  });
});
