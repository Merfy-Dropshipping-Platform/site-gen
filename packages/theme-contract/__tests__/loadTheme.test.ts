import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { loadTheme, loadThemeWithValidation } from '../lib/loadTheme.js';

let tmpDir: string;

async function createThemeDir(structure: Record<string, string | object>): Promise<string> {
  const themeDir = path.join(tmpDir, `theme-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(themeDir, { recursive: true });

  for (const [filePath, content] of Object.entries(structure)) {
    const fullPath = path.join(themeDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await fs.writeFile(fullPath, data, 'utf-8');
  }

  return themeDir;
}

function validManifest(overrides: Record<string, unknown> = {}): object {
  return {
    id: 'test-theme',
    name: 'Test Theme',
    version: '1.0.0',
    description: 'A test theme',
    category: 'fashion',
    author: 'Test',
    features: { search: true, variants: true },
    pages: ['index', 'product'],
    settings_schema: [],
    ...overrides,
  };
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'merfy-load-theme-'));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('loadTheme', () => {
  it('loads a valid theme and returns ThemeExport', async () => {
    const themeDir = await createThemeDir({
      'theme.json': validManifest(),
      'tokens.css': ':root { --color-primary: #e11d48; }',
      'pages/index.json': { root: {}, content: [{ type: 'HeroBanner' }] },
      'pages/product.json': { root: {}, content: [{ type: 'ProductDetail' }] },
      'components/registry.json': JSON.stringify([
        {
          name: 'HeroBanner',
          label: 'Hero Banner',
          category: 'hero',
          astroTemplate: 'HeroBanner.astro',
          schema: {},
        },
      ]),
      'components/react/HeroBanner.tsx': 'export default function HeroBanner() {}',
      'components/astro/HeroBanner.astro': '<div>Hero</div>',
      'layouts/default.astro': '<html><body><slot/></body></html>',
    });

    const theme = await loadTheme(themeDir);

    // Manifest
    expect(theme.manifest).toBeDefined();
    expect(theme.manifest.name).toBe('Test Theme');
    expect(theme.manifest.version).toBe('1.0.0');
    expect(theme.manifest.features).toEqual({ search: true, variants: true });

    // Registry
    expect(theme.registry).toBeDefined();
    expect(Array.isArray(theme.registry)).toBe(true);
    expect(theme.registry).toHaveLength(1);
    expect(theme.registry[0].name).toBe('HeroBanner');

    // Tokens
    expect(theme.tokens).toBeDefined();
    expect(typeof theme.tokens).toBe('string');
    expect(theme.tokens).toContain('--color-primary');

    // Pages (lazy imports)
    expect(theme.pages).toBeDefined();
    expect(theme.pages).toHaveProperty('index');
    expect(theme.pages).toHaveProperty('product');
    expect(typeof theme.pages.index).toBe('function');
    expect(typeof theme.pages.product).toBe('function');

    // Layouts (lazy imports)
    expect(theme.layouts).toBeDefined();
    expect(typeof theme.layouts.default).toBe('function');
  });

  it('throws error when theme directory does not exist', async () => {
    await expect(loadTheme('/nonexistent/path')).rejects.toThrow();
  });

  it('throws error when theme.json is missing', async () => {
    const themeDir = await createThemeDir({
      'tokens.css': ':root {}',
    });

    await expect(loadTheme(themeDir)).rejects.toThrow();
  });

  it('reads tokens.css as string content', async () => {
    const cssContent = ':root {\n  --color-primary: #e11d48;\n  --font-body: Inter;\n}';
    const themeDir = await createThemeDir({
      'theme.json': validManifest({ pages: [] }),
      'tokens.css': cssContent,
      'components/registry.json': '[]',
    });

    const theme = await loadTheme(themeDir);

    expect(theme.tokens).toBe(cssContent);
  });

  it('handles theme with no pages', async () => {
    const themeDir = await createThemeDir({
      'theme.json': validManifest({ pages: [] }),
      'tokens.css': ':root {}',
      'components/registry.json': '[]',
    });

    const theme = await loadTheme(themeDir);

    expect(theme.pages).toEqual({});
  });

  it('handles theme with no layouts', async () => {
    const themeDir = await createThemeDir({
      'theme.json': validManifest({ pages: [] }),
      'tokens.css': ':root {}',
      'components/registry.json': '[]',
    });

    const theme = await loadTheme(themeDir);

    expect(theme.layouts).toEqual({});
  });

  it('loads multiple layouts', async () => {
    const themeDir = await createThemeDir({
      'theme.json': validManifest({ pages: [] }),
      'tokens.css': ':root {}',
      'components/registry.json': '[]',
      'layouts/default.astro': '<html><body><slot/></body></html>',
      'layouts/store.astro': '<html><body><header/><slot/></body></html>',
    });

    const theme = await loadTheme(themeDir);

    expect(theme.layouts).toHaveProperty('default');
    expect(theme.layouts).toHaveProperty('store');
  });
});

describe('loadThemeWithValidation', () => {
  it('returns theme and valid validation for a valid theme', async () => {
    const themeDir = await createThemeDir({
      'theme.json': validManifest({ pages: ['index'] }),
      'tokens.css': ':root { --color-primary: #e11d48; }',
      'pages/index.json': { root: {}, content: [] },
      'components/registry.json': '[]',
      'layouts/default.astro': '<html><body><slot/></body></html>',
    });

    const result = await loadThemeWithValidation(themeDir);

    expect(result.validation.valid).toBe(true);
    expect(result.validation.errors).toHaveLength(0);
    expect(result.theme).not.toBeNull();
    expect(result.theme!.manifest.name).toBe('Test Theme');
    expect(result.theme!.manifest.version).toBe('1.0.0');
    expect(typeof result.theme!.tokens).toBe('string');
  });

  it('returns null theme and invalid validation when required fields are missing', async () => {
    const themeDir = await createThemeDir({
      'theme.json': { description: 'Missing name and version' },
      'tokens.css': ':root {}',
    });

    const result = await loadThemeWithValidation(themeDir);

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.length).toBeGreaterThan(0);
    expect(result.theme).toBeNull();
  });

  it('returns valid theme with tokens containing :root and color-scheme classes', async () => {
    const themeDir = await createThemeDir({
      'theme.json': validManifest({
        pages: [],
        settings: {
          colorSchemes: [
            { name: 'Light', background: '#ffffff', foreground: '#000000' },
            { name: 'Dark', background: '#121212', foreground: '#ffffff' },
          ],
        },
      }),
      'tokens.css': ':root { --base: 1; }',
      'components/registry.json': '[]',
    });

    const result = await loadThemeWithValidation(themeDir);

    expect(result.validation.valid).toBe(true);
    expect(result.theme).not.toBeNull();
    expect(typeof result.theme!.tokens).toBe('string');
    expect(result.theme!.tokens).toContain(':root');
  });

  it('returns ThemeExport with manifest, registry, tokens, layouts, pages', async () => {
    const themeDir = await createThemeDir({
      'theme.json': validManifest({ pages: ['index'] }),
      'tokens.css': ':root { --color-primary: #e11d48; }',
      'pages/index.json': { root: {}, content: [] },
      'components/registry.json': JSON.stringify([
        {
          name: 'HeroBanner',
          label: 'Hero Banner',
          category: 'hero',
          astroTemplate: 'HeroBanner.astro',
          schema: {},
        },
      ]),
      'components/react/HeroBanner.tsx': 'export default function HeroBanner() {}',
      'components/astro/HeroBanner.astro': '<div>Hero</div>',
      'layouts/default.astro': '<html><body><slot/></body></html>',
    });

    const result = await loadThemeWithValidation(themeDir);

    expect(result.theme).not.toBeNull();
    const theme = result.theme!;

    // Has all required fields
    expect(theme.manifest).toBeDefined();
    expect(theme.registry).toBeDefined();
    expect(theme.tokens).toBeDefined();
    expect(theme.layouts).toBeDefined();
    expect(theme.pages).toBeDefined();

    // Correct types
    expect(Array.isArray(theme.registry)).toBe(true);
    expect(typeof theme.tokens).toBe('string');
    expect(typeof theme.layouts).toBe('object');
    expect(typeof theme.pages).toBe('object');
  });

  it('returns null theme when theme.json is missing entirely', async () => {
    const themeDir = await createThemeDir({
      'tokens.css': ':root {}',
    });

    const result = await loadThemeWithValidation(themeDir);

    expect(result.validation.valid).toBe(false);
    expect(result.theme).toBeNull();
  });
});
