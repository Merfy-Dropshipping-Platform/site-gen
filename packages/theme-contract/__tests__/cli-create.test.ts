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

describe('cli/create - theme scaffolding', () => {
  it('creates a minimal theme skeleton without --from', async () => {
    const themesDir = path.join(tmpDir, 'themes-1');
    await fs.mkdir(themesDir, { recursive: true });

    await createTheme({
      name: 'aurora',
      category: 'electronics',
      outputDir: themesDir,
    });

    const themeDir = path.join(themesDir, 'aurora');

    // theme.json exists and has correct fields
    const manifest = JSON.parse(
      await fs.readFile(path.join(themeDir, 'theme.json'), 'utf-8')
    );
    expect(manifest.name).toBe('aurora');
    expect(manifest.category).toBe('electronics');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.features).toBeDefined();
    expect(manifest.pages).toContain('index');

    // tokens.css exists
    const tokens = await fs.readFile(path.join(themeDir, 'tokens.css'), 'utf-8');
    expect(tokens).toContain(':root');

    // settings_schema.json exists
    const settingsSchema = JSON.parse(
      await fs.readFile(path.join(themeDir, 'settings_schema.json'), 'utf-8')
    );
    expect(Array.isArray(settingsSchema)).toBe(true);

    // registry.ts exists
    const registry = await fs.readFile(
      path.join(themeDir, 'components', 'registry.ts'), 'utf-8'
    );
    expect(registry).toBeTruthy();

    // layouts/default.astro exists
    const layout = await fs.readFile(
      path.join(themeDir, 'layouts', 'default.astro'), 'utf-8'
    );
    expect(layout).toContain('html');

    // pages/index.json exists
    const indexPage = JSON.parse(
      await fs.readFile(path.join(themeDir, 'pages', 'index.json'), 'utf-8')
    );
    expect(indexPage).toHaveProperty('content');
  });

  it('creates a theme from an existing template with --from', async () => {
    const themesDir = path.join(tmpDir, 'themes-2');
    await fs.mkdir(themesDir, { recursive: true });

    // First create a source theme
    const sourceDir = path.join(themesDir, 'rose');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'components', 'react'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'components', 'astro'), { recursive: true });
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
      JSON.stringify({ root: {}, content: [] }),
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

    // Create theme from source
    await createTheme({
      name: 'midnight',
      category: 'electronics',
      from: 'rose',
      outputDir: themesDir,
    });

    const newThemeDir = path.join(themesDir, 'midnight');

    // theme.json should have the new name
    const manifest = JSON.parse(
      await fs.readFile(path.join(newThemeDir, 'theme.json'), 'utf-8')
    );
    expect(manifest.name).toBe('midnight');
    expect(manifest.category).toBe('electronics');

    // Files from source should be copied
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
  });

  it('throws error if theme already exists', async () => {
    const themesDir = path.join(tmpDir, 'themes-3');
    const existingDir = path.join(themesDir, 'existing');
    await fs.mkdir(existingDir, { recursive: true });
    await fs.writeFile(path.join(existingDir, 'theme.json'), '{}');

    await expect(
      createTheme({
        name: 'existing',
        category: 'fashion',
        outputDir: themesDir,
      })
    ).rejects.toThrow();
  });

  it('throws error if source theme does not exist when using --from', async () => {
    const themesDir = path.join(tmpDir, 'themes-4');
    await fs.mkdir(themesDir, { recursive: true });

    await expect(
      createTheme({
        name: 'new-theme',
        category: 'fashion',
        from: 'nonexistent',
        outputDir: themesDir,
      })
    ).rejects.toThrow();
  });
});
