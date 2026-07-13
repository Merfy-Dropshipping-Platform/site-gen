import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runValidate, type ValidateResult } from '../cli/validate.js';

const execFileAsync = promisify(execFile);

let tmpDir: string;

// __dirname is available under ts-jest ESM preset; resolve repo paths from it.
const packageRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(packageRoot, 'cli', 'validate.ts');
// The `sites` root that owns `packages/theme-bloom` and node_modules/.bin/tsx.
const sitesRoot = path.resolve(packageRoot, '..', '..');
const packagesDir = path.join(sitesRoot, 'packages');
const v2Fixtures = path.join(packageRoot, '__tests__', 'fixtures', 'themes');

async function createThemeDir(
  themesDir: string,
  name: string,
  structure: Record<string, string | object>,
): Promise<string> {
  const themeDir = path.join(themesDir, name);
  await fs.mkdir(themeDir, { recursive: true });

  for (const [filePath, content] of Object.entries(structure)) {
    const fullPath = path.join(themeDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await fs.writeFile(fullPath, data, 'utf-8');
  }

  return themeDir;
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'merfy-cli-validate-'));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('cli/validate — legacy fallback (old theme directories)', () => {
  it('returns success for a valid legacy theme', async () => {
    const themesDir = path.join(tmpDir, 'themes-1');
    await createThemeDir(themesDir, 'rose', {
      'theme.json': {
        name: 'Rose',
        version: '1.0.0',
        description: 'A fashion theme',
        category: 'fashion',
        author: 'Merfy',
        features: {},
        pages: ['index'],
        settings_schema: [],
      },
      'tokens.css': ':root { --color-primary: #e11d48; }',
      'pages/index.json': { root: {}, content: [] },
    });

    const result = await runValidate({ theme: 'rose', themesDir });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.output).toContain('valid');
  });

  it('returns failure with legacy error messages for an invalid legacy theme', async () => {
    const themesDir = path.join(tmpDir, 'themes-2');
    await createThemeDir(themesDir, 'broken', {
      'theme.json': { description: 'No name or version' },
    });

    const result = await runValidate({ theme: 'broken', themesDir });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Legacy validator reports the missing required field explicitly.
    expect(result.errors.some((e) => /Missing required field 'name'/.test(e))).toBe(true);
    expect(result.output).toBeTruthy();
  });

  it('throws error if theme directory does not exist', async () => {
    const themesDir = path.join(tmpDir, 'themes-3');
    await fs.mkdir(themesDir, { recursive: true });

    await expect(runValidate({ theme: 'nonexistent', themesDir })).rejects.toThrow();
  });
});

describe('cli/validate — new-style manifests delegate to validateThemeV2', () => {
  it('passes a valid new-style theme via validateThemeV2 (no tokens.css needed)', async () => {
    // The minimal-theme fixture is a valid v2 manifest with a Hero override but
    // NO tokens.css — the legacy validator would fail it. Success proves that
    // runValidate delegated to validateThemeV2.
    const result = await runValidate({ theme: 'minimal-theme', themesDir: v2Fixtures });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.output).toContain('valid');
  });

  it('reports v2-formatted token errors for an over-max radius in a new-style theme', async () => {
    const themesDir = path.join(tmpDir, 'themes-v2-bad');
    await createThemeDir(themesDir, 'theme-overmax', {
      'theme.json': {
        id: 'overmax',
        name: 'Over Max',
        version: '1.0.0',
        extends: '@merfy/theme-base@workspace:*',
        defaults: { '--radius-button': '100px' },
        colorSchemes: [
          {
            id: 'scheme-1',
            name: 'Light',
            tokens: { '--color-bg': '255 255 255', '--color-heading': '17 17 17' },
          },
        ],
        blocks: {},
        features: { newsletter: false },
        fonts: [{ family: 'Inter', weights: [400], source: 'google' }],
      },
    });

    const result = await runValidate({ theme: 'theme-overmax', themesDir });

    expect(result.valid).toBe(false);
    // v2 error format is `[tokens.defaults] ...` — legacy never produces this.
    expect(result.errors).toContain('[tokens.defaults] Token "--radius-button" = 100 exceeds max 48');
    // A legacy-only signal (missing tokens.css) must NOT appear.
    expect(result.errors.some((e) => /Missing tokens\.css/.test(e))).toBe(false);
  });
});

describe('cli/validate — ESM direct-execution guard invokes main()', () => {
  it('running the CLI against packages/theme-bloom validates via v2 and exits 1 on --radius-button', async () => {
    // The current file only exports main(); with the guard it must actually
    // run, use validateThemeV2 (new-style detection) and surface F-043.
    let stdout = '';
    let code: number | null = 0;
    try {
      const res = await execFileAsync(
        'tsx',
        [cliEntry, '--theme', 'bloom', '--themes-dir', packagesDir],
        { cwd: sitesRoot },
      );
      stdout = res.stdout;
    } catch (err) {
      const e = err as { code?: number | null; stdout?: string };
      code = typeof e.code === 'number' ? e.code : 1;
      stdout = e.stdout ?? '';
    }

    expect(code).toBe(1);
    expect(stdout).toContain('Token "--radius-button" = 100 exceeds max 48');
  }, 60_000);
});
