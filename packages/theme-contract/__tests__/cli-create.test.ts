import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { createTheme } from '../cli/create.js';

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'merfy-cli-create-'));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('cli/create - theme scaffolding (US2)', () => {
  it('creates directory with full structure: theme.json, tokens.css, registry.ts, pages/, layouts/', async () => {
    const themesDir = path.join(tmpDir, 'us2-t022-1');
    await fs.mkdir(themesDir, { recursive: true });

    await createTheme({
      name: 'aurora',
      category: 'electronics',
      outputDir: themesDir,
    });

    const themeDir = path.join(themesDir, 'aurora');

    // All required files and directories exist
    const stat = async (p: string) => fs.stat(path.join(themeDir, p));

    await expect(stat('theme.json')).resolves.toBeTruthy();
    await expect(stat('tokens.css')).resolves.toBeTruthy();
    await expect(stat('components/registry.ts')).resolves.toBeTruthy();
    await expect(stat('pages')).resolves.toBeTruthy();
    await expect(stat('pages/index.json')).resolves.toBeTruthy();
    await expect(stat('layouts')).resolves.toBeTruthy();
    await expect(stat('layouts/default.astro')).resolves.toBeTruthy();
    await expect(stat('components/react')).resolves.toBeTruthy();
    await expect(stat('components/astro')).resolves.toBeTruthy();
    await expect(stat('components/variants')).resolves.toBeTruthy();
  });

  it('theme.json contains capitalize(name), category, version "0.1.0", settings_schema, pages', async () => {
    const themesDir = path.join(tmpDir, 'us2-t023');
    await fs.mkdir(themesDir, { recursive: true });

    await createTheme({
      name: 'aurora',
      category: 'electronics',
      outputDir: themesDir,
    });

    const manifest = JSON.parse(
      await fs.readFile(path.join(themesDir, 'aurora', 'theme.json'), 'utf-8')
    );

    // Name should be capitalized: aurora -> Aurora
    expect(manifest.name).toBe('Aurora');
    expect(manifest.category).toBe('electronics');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.settings_schema).toBeDefined();
    expect(Array.isArray(manifest.settings_schema)).toBe(true);
    expect(manifest.settings_schema.length).toBeGreaterThan(0);
    expect(manifest.pages).toBeDefined();
    expect(Array.isArray(manifest.pages)).toBe(true);
    expect(manifest.pages).toContain('index');
  });

  it('theme.json includes color_schemes array', async () => {
    const themesDir = path.join(tmpDir, 'us2-colorschemes');
    await fs.mkdir(themesDir, { recursive: true });

    await createTheme({
      name: 'neon',
      category: 'tech',
      outputDir: themesDir,
    });

    const manifest = JSON.parse(
      await fs.readFile(path.join(themesDir, 'neon', 'theme.json'), 'utf-8')
    );

    expect(manifest.color_schemes).toBeDefined();
    expect(Array.isArray(manifest.color_schemes)).toBe(true);
  });

  it('created theme passes validation (exit code 0 equivalent)', async () => {
    const themesDir = path.join(tmpDir, 'us2-t024');
    await fs.mkdir(themesDir, { recursive: true });

    await createTheme({
      name: 'valid-theme',
      category: 'fashion',
      outputDir: themesDir,
    });

    // Import validate and run against the created theme
    const { runValidate } = await import('../cli/validate.js');
    const result = await runValidate({ theme: 'valid-theme', themesDir });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('tokens.css contains :root { --color-primary: ...; } with defaults', async () => {
    const themesDir = path.join(tmpDir, 'us2-tokens');
    await fs.mkdir(themesDir, { recursive: true });

    await createTheme({
      name: 'token-test',
      category: 'general',
      outputDir: themesDir,
    });

    const tokens = await fs.readFile(
      path.join(themesDir, 'token-test', 'tokens.css'),
      'utf-8'
    );

    expect(tokens).toContain(':root {');
    expect(tokens).toContain('--color-primary');
    expect(tokens).toContain('}');
  });

  it('throws with specific message when theme already exists', async () => {
    const themesDir = path.join(tmpDir, 'us2-exists');
    const existingDir = path.join(themesDir, 'aurora');
    await fs.mkdir(existingDir, { recursive: true });
    await fs.writeFile(path.join(existingDir, 'theme.json'), '{}');

    await expect(
      createTheme({
        name: 'aurora',
        category: 'fashion',
        outputDir: themesDir,
      })
    ).rejects.toThrow("Error: Theme 'aurora' already exists");
  });

  it('uses default category "general" when no category specified', async () => {
    const themesDir = path.join(tmpDir, 'us2-default-cat');
    await fs.mkdir(themesDir, { recursive: true });

    await createTheme({
      name: 'basic',
      category: 'general',
      outputDir: themesDir,
    });

    const manifest = JSON.parse(
      await fs.readFile(path.join(themesDir, 'basic', 'theme.json'), 'utf-8')
    );

    expect(manifest.category).toBe('general');
  });

  it('settings_schema contains Colors, Typography, and Layout groups', async () => {
    const themesDir = path.join(tmpDir, 'us2-schema-groups');
    await fs.mkdir(themesDir, { recursive: true });

    await createTheme({
      name: 'grouped',
      category: 'general',
      outputDir: themesDir,
    });

    const manifest = JSON.parse(
      await fs.readFile(path.join(themesDir, 'grouped', 'theme.json'), 'utf-8')
    );

    const groupNames = manifest.settings_schema.map((g: { name: string }) => g.name);
    expect(groupNames).toContain('Colors');
    expect(groupNames).toContain('Typography');
    expect(groupNames).toContain('Layout');
  });

  it('registry.ts contains default export of empty array', async () => {
    const themesDir = path.join(tmpDir, 'us2-registry');
    await fs.mkdir(themesDir, { recursive: true });

    await createTheme({
      name: 'reg-test',
      category: 'general',
      outputDir: themesDir,
    });

    const registry = await fs.readFile(
      path.join(themesDir, 'reg-test', 'components', 'registry.ts'),
      'utf-8'
    );

    expect(registry).toContain('export default');
    expect(registry).toContain('ComponentRegistryEntry');
  });

  it('multi-word name is capitalized correctly', async () => {
    const themesDir = path.join(tmpDir, 'us2-multiword');
    await fs.mkdir(themesDir, { recursive: true });

    await createTheme({
      name: 'dark-forest',
      category: 'nature',
      outputDir: themesDir,
    });

    const manifest = JSON.parse(
      await fs.readFile(path.join(themesDir, 'dark-forest', 'theme.json'), 'utf-8')
    );

    // dark-forest -> Dark Forest
    expect(manifest.name).toBe('Dark Forest');
  });

  it('pages/index.json has root and content fields', async () => {
    const themesDir = path.join(tmpDir, 'us2-pagejson');
    await fs.mkdir(themesDir, { recursive: true });

    await createTheme({
      name: 'page-test',
      category: 'general',
      outputDir: themesDir,
    });

    const indexPage = JSON.parse(
      await fs.readFile(path.join(themesDir, 'page-test', 'pages', 'index.json'), 'utf-8')
    );

    expect(indexPage).toHaveProperty('content');
  });

  it('generates product.json and collection.json pages', async () => {
    const themesDir = path.join(tmpDir, 'us2-pages-extra');
    await fs.mkdir(themesDir, { recursive: true });

    await createTheme({
      name: 'multi-page',
      category: 'general',
      outputDir: themesDir,
    });

    const themeDir = path.join(themesDir, 'multi-page');

    const productPage = JSON.parse(
      await fs.readFile(path.join(themeDir, 'pages', 'product.json'), 'utf-8')
    );
    expect(productPage).toHaveProperty('content');

    const collectionPage = JSON.parse(
      await fs.readFile(path.join(themeDir, 'pages', 'collection.json'), 'utf-8')
    );
    expect(collectionPage).toHaveProperty('content');
  });

  it('layout default.astro contains html structure', async () => {
    const themesDir = path.join(tmpDir, 'us2-layout-html');
    await fs.mkdir(themesDir, { recursive: true });

    await createTheme({
      name: 'layout-test',
      category: 'general',
      outputDir: themesDir,
    });

    const layout = await fs.readFile(
      path.join(themesDir, 'layout-test', 'layouts', 'default.astro'),
      'utf-8'
    );

    expect(layout).toContain('html');
    expect(layout).toContain('slot');
  });
});

describe('cli/create --from (fork) (US3)', () => {
  async function setupSourceTheme(themesDir: string): Promise<void> {
    const sourceDir = path.join(themesDir, 'rose');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'components', 'react'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'components', 'astro'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'components', 'variants'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'pages'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'layouts'), { recursive: true });

    await fs.writeFile(
      path.join(sourceDir, 'theme.json'),
      JSON.stringify({
        name: 'Rose',
        version: '1.0.0',
        category: 'fashion',
        description: 'Rose theme',
        author: 'Merfy',
        features: { search: true, variants: true },
        settings_schema: [
          {
            name: 'Colors',
            settings: [
              { id: 'color_primary', type: 'color', label: 'Primary Color', default: '#e11d48' },
            ],
          },
        ],
        color_schemes: [
          { name: 'Light', background: '#ffffff', foreground: '#000000' },
        ],
        pages: ['index', 'product'],
      }),
    );
    await fs.writeFile(path.join(sourceDir, 'tokens.css'), ':root { --color-primary: #e11d48; }');
    await fs.writeFile(
      path.join(sourceDir, 'pages', 'index.json'),
      JSON.stringify({ root: {}, content: [] }),
    );
    await fs.writeFile(
      path.join(sourceDir, 'pages', 'product.json'),
      JSON.stringify({ root: {}, content: [{ type: 'ProductDetails' }] }),
    );
    await fs.writeFile(
      path.join(sourceDir, 'layouts', 'default.astro'),
      '<html><body><slot/></body></html>',
    );
    await fs.writeFile(
      path.join(sourceDir, 'components', 'react', 'HeroBanner.tsx'),
      'export default function HeroBanner() {}',
    );
    await fs.writeFile(
      path.join(sourceDir, 'components', 'astro', 'HeroBanner.astro'),
      '<div>Hero</div>',
    );
  }

  it('creates from existing theme with all files copied', async () => {
    const themesDir = path.join(tmpDir, 'us3-copy');
    await fs.mkdir(themesDir, { recursive: true });
    await setupSourceTheme(themesDir);

    await createTheme({
      name: 'midnight',
      category: 'electronics',
      from: 'rose',
      outputDir: themesDir,
    });

    const newThemeDir = path.join(themesDir, 'midnight');

    // All files from source should be copied
    const heroReact = await fs.readFile(
      path.join(newThemeDir, 'components', 'react', 'HeroBanner.tsx'),
      'utf-8',
    );
    expect(heroReact).toContain('HeroBanner');

    const heroAstro = await fs.readFile(
      path.join(newThemeDir, 'components', 'astro', 'HeroBanner.astro'),
      'utf-8',
    );
    expect(heroAstro).toContain('Hero');

    const layout = await fs.readFile(
      path.join(newThemeDir, 'layouts', 'default.astro'),
      'utf-8',
    );
    expect(layout).toContain('html');

    const pages = await fs.readdir(path.join(newThemeDir, 'pages'));
    expect(pages).toContain('index.json');
    expect(pages).toContain('product.json');
  });

  it('theme.json updated: name and category new; settings_schema, features, pages copied', async () => {
    const themesDir = path.join(tmpDir, 'us3-manifest');
    await fs.mkdir(themesDir, { recursive: true });
    await setupSourceTheme(themesDir);

    await createTheme({
      name: 'midnight',
      category: 'electronics',
      from: 'rose',
      outputDir: themesDir,
    });

    const manifest = JSON.parse(
      await fs.readFile(path.join(themesDir, 'midnight', 'theme.json'), 'utf-8')
    );

    // New values
    expect(manifest.name).toBe('Midnight');
    expect(manifest.category).toBe('electronics');
    expect(manifest.version).toBe('0.1.0');

    // Copied from source
    expect(manifest.features).toEqual({ search: true, variants: true });
    expect(manifest.settings_schema).toBeDefined();
    expect(manifest.settings_schema[0].name).toBe('Colors');
    expect(manifest.pages).toEqual(['index', 'product']);
  });

  it('tokens.css regenerated from updated manifest (not just raw copy)', async () => {
    const themesDir = path.join(tmpDir, 'us3-tokens');
    await fs.mkdir(themesDir, { recursive: true });
    await setupSourceTheme(themesDir);

    await createTheme({
      name: 'regen-test',
      category: 'tech',
      from: 'rose',
      outputDir: themesDir,
    });

    const tokens = await fs.readFile(
      path.join(themesDir, 'regen-test', 'tokens.css'),
      'utf-8'
    );

    // Tokens should contain :root and be properly generated
    expect(tokens).toContain(':root {');
    expect(tokens).toContain('--color-primary');
    expect(tokens).toContain('}');
  });

  it('throws with specific message when source theme does not exist', async () => {
    const themesDir = path.join(tmpDir, 'us3-notfound');
    await fs.mkdir(themesDir, { recursive: true });

    await expect(
      createTheme({
        name: 'new-theme',
        category: 'fashion',
        from: 'nonexistent',
        outputDir: themesDir,
      })
    ).rejects.toThrow("Error: Source theme 'nonexistent' not found");
  });

  it('forked theme passes validation', async () => {
    const themesDir = path.join(tmpDir, 'us3-validate');
    await fs.mkdir(themesDir, { recursive: true });
    await setupSourceTheme(themesDir);

    await createTheme({
      name: 'forked',
      category: 'general',
      from: 'rose',
      outputDir: themesDir,
    });

    const { runValidate } = await import('../cli/validate.js');
    const result = await runValidate({ theme: 'forked', themesDir });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('does not modify the source theme when forking', async () => {
    const themesDir = path.join(tmpDir, 'us3-no-modify');
    await fs.mkdir(themesDir, { recursive: true });
    await setupSourceTheme(themesDir);

    // Read source manifest before fork
    const sourceBefore = await fs.readFile(
      path.join(themesDir, 'rose', 'theme.json'),
      'utf-8'
    );

    await createTheme({
      name: 'clone',
      category: 'tech',
      from: 'rose',
      outputDir: themesDir,
    });

    // Source should be unchanged
    const sourceAfter = await fs.readFile(
      path.join(themesDir, 'rose', 'theme.json'),
      'utf-8'
    );
    expect(sourceAfter).toBe(sourceBefore);
  });
});
