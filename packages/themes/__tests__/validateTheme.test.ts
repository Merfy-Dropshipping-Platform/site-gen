import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { validateTheme } from '../lib/validateTheme.js';

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

function minimalManifest(overrides: Record<string, unknown> = {}): object {
  return {
    name: 'Test Theme',
    version: '1.0.0',
    description: 'A test theme',
    category: 'fashion',
    author: 'Test',
    features: {},
    pages: ['index'],
    settings_schema: [],
    ...overrides,
  };
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'merfy-theme-test-'));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('validateTheme', () => {
  it('validates a correct minimal theme directory', async () => {
    const themeDir = await createThemeDir({
      'theme.json': minimalManifest(),
      'tokens.css': ':root { --color-primary: #e11d48; }',
      'pages/index.json': { root: {}, content: [] },
      'components/registry.ts': 'export default [];',
    });

    const result = await validateTheme(themeDir);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports error when theme.json is missing', async () => {
    const themeDir = await createThemeDir({
      'tokens.css': ':root {}',
    });

    const result = await validateTheme(themeDir);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing theme.json manifest');
  });

  it('reports error when theme.json is invalid JSON', async () => {
    const themeDir = await createThemeDir({
      'theme.json': '{ invalid json }}}',
      'tokens.css': ':root {}',
    });

    const result = await validateTheme(themeDir);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('theme.json'))).toBe(true);
  });

  it('reports error when required manifest fields are missing', async () => {
    const themeDir = await createThemeDir({
      'theme.json': { description: 'Missing name and version' },
      'tokens.css': ':root {}',
    });

    const result = await validateTheme(themeDir);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('name'))).toBe(true);
    expect(result.errors.some(e => e.includes('version'))).toBe(true);
  });

  it('reports error when tokens.css is missing', async () => {
    const themeDir = await createThemeDir({
      'theme.json': minimalManifest(),
      'pages/index.json': { root: {}, content: [] },
    });

    const result = await validateTheme(themeDir);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('tokens.css'))).toBe(true);
  });

  it('reports error when a referenced page JSON file is missing', async () => {
    const themeDir = await createThemeDir({
      'theme.json': minimalManifest({ pages: ['index', 'product', 'collection'] }),
      'tokens.css': ':root {}',
      'pages/index.json': { root: {}, content: [] },
      // Missing product.json and collection.json
    });

    const result = await validateTheme(themeDir);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('product'))).toBe(true);
    expect(result.errors.some(e => e.includes('collection'))).toBe(true);
  });

  it('reports error when registry component is missing React template', async () => {
    const themeDir = await createThemeDir({
      'theme.json': minimalManifest(),
      'tokens.css': ':root {}',
      'pages/index.json': { root: {}, content: [] },
      'components/registry.json': JSON.stringify([
        {
          name: 'ProductGrid',
          label: 'Product Grid',
          category: 'products',
          astroTemplate: 'ProductGrid.astro',
          schema: {},
        },
      ]),
      'components/astro/ProductGrid.astro': '<div>Grid</div>',
      // Missing components/react/ProductGrid.tsx
    });

    const result = await validateTheme(themeDir);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e =>
      e.includes('ProductGrid') && e.includes('react') || e.includes('React')
    )).toBe(true);
  });

  it('reports error when registry component is missing Astro template', async () => {
    const themeDir = await createThemeDir({
      'theme.json': minimalManifest(),
      'tokens.css': ':root {}',
      'pages/index.json': { root: {}, content: [] },
      'components/registry.json': JSON.stringify([
        {
          name: 'ProductGrid',
          label: 'Product Grid',
          category: 'products',
          astroTemplate: 'ProductGrid.astro',
          schema: {},
        },
      ]),
      'components/react/ProductGrid.tsx': 'export default function ProductGrid() { return <div/>; }',
      // Missing components/astro/ProductGrid.astro
    });

    const result = await validateTheme(themeDir);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e =>
      e.includes('ProductGrid') && (e.includes('astro') || e.includes('Astro'))
    )).toBe(true);
  });

  it('returns warnings for recommended files', async () => {
    const themeDir = await createThemeDir({
      'theme.json': minimalManifest(),
      'tokens.css': ':root {}',
      'pages/index.json': { root: {}, content: [] },
      // No layouts/ directory
    });

    const result = await validateTheme(themeDir);

    // Should still be valid but may have warnings
    expect(result.valid).toBe(true);
    // Warnings about missing layouts are informational
  });

  it('validates a complete theme with components', async () => {
    const themeDir = await createThemeDir({
      'theme.json': minimalManifest({ pages: ['index'] }),
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
        {
          name: 'Footer',
          label: 'Footer',
          category: 'navigation',
          astroTemplate: 'Footer.astro',
          schema: {},
        },
      ]),
      'components/react/HeroBanner.tsx': 'export default function HeroBanner() { return null; }',
      'components/astro/HeroBanner.astro': '<div>Hero</div>',
      'components/react/Footer.tsx': 'export default function Footer() { return null; }',
      'components/astro/Footer.astro': '<footer>Footer</footer>',
      'layouts/default.astro': '<html><body><slot/></body></html>',
    });

    const result = await validateTheme(themeDir);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('provides human-readable error messages', async () => {
    const themeDir = await createThemeDir({
      'theme.json': minimalManifest({ pages: ['index', 'product'] }),
      'tokens.css': ':root {}',
      'pages/index.json': { root: {}, content: [] },
      'components/registry.json': JSON.stringify([
        {
          name: 'ProductGrid',
          label: 'Product Grid',
          category: 'products',
          astroTemplate: 'ProductGrid.astro',
          schema: {},
        },
      ]),
    });

    const result = await validateTheme(themeDir);

    expect(result.valid).toBe(false);
    // Each error should be a human-readable sentence
    for (const error of result.errors) {
      expect(typeof error).toBe('string');
      expect(error.length).toBeGreaterThan(10);
    }
  });
});
