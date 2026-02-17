import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { runValidate, type ValidateResult } from '../cli/validate.js';

let tmpDir: string;

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

describe('cli/validate', () => {
  it('returns success for a valid theme', async () => {
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

  it('returns failure with error messages for an invalid theme', async () => {
    const themesDir = path.join(tmpDir, 'themes-2');
    await createThemeDir(themesDir, 'broken', {
      'theme.json': { description: 'No name or version' },
    });

    const result = await runValidate({ theme: 'broken', themesDir });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.output).toBeTruthy();
  });

  it('throws error if theme directory does not exist', async () => {
    const themesDir = path.join(tmpDir, 'themes-3');
    await fs.mkdir(themesDir, { recursive: true });

    await expect(
      runValidate({ theme: 'nonexistent', themesDir })
    ).rejects.toThrow();
  });
});
