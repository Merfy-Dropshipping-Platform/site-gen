import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { addComponent } from '../cli/add-component.js';

let tmpDir: string;

async function createMinimalTheme(themesDir: string, themeName: string): Promise<string> {
  const themeDir = path.join(themesDir, themeName);
  await fs.mkdir(path.join(themeDir, 'components', 'react'), { recursive: true });
  await fs.mkdir(path.join(themeDir, 'components', 'astro'), { recursive: true });
  await fs.mkdir(path.join(themeDir, 'components', 'variants'), { recursive: true });

  await fs.writeFile(
    path.join(themeDir, 'theme.json'),
    JSON.stringify({
      name: themeName,
      version: '1.0.0',
      features: {},
      pages: ['index'],
    }),
  );
  await fs.writeFile(
    path.join(themeDir, 'components', 'registry.ts'),
    `import type { ComponentRegistryEntry } from '@merfy/themes/types';

const registry: ComponentRegistryEntry[] = [];

export default registry;
`,
  );

  return themeDir;
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'merfy-cli-add-'));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('cli/add-component', () => {
  it('creates React, Astro, and variants skeleton files', async () => {
    const themesDir = path.join(tmpDir, 'themes-1');
    await createMinimalTheme(themesDir, 'aurora');

    await addComponent({
      theme: 'aurora',
      name: 'ProductComparison',
      themesDir,
    });

    const themeDir = path.join(themesDir, 'aurora');

    // React file exists
    const reactContent = await fs.readFile(
      path.join(themeDir, 'components', 'react', 'ProductComparison.tsx'),
      'utf-8',
    );
    expect(reactContent).toContain('ProductComparison');

    // Astro file exists
    const astroContent = await fs.readFile(
      path.join(themeDir, 'components', 'astro', 'ProductComparison.astro'),
      'utf-8',
    );
    expect(astroContent).toContain('ProductComparison');

    // Variants file exists with kebab-case name
    const variantsContent = await fs.readFile(
      path.join(themeDir, 'components', 'variants', 'productComparison.ts'),
      'utf-8',
    );
    expect(variantsContent).toBeTruthy();
  });

  it('adds an entry to registry.ts', async () => {
    const themesDir = path.join(tmpDir, 'themes-2');
    await createMinimalTheme(themesDir, 'aurora');

    await addComponent({
      theme: 'aurora',
      name: 'HeroBanner',
      themesDir,
    });

    const registryContent = await fs.readFile(
      path.join(themesDir, 'aurora', 'components', 'registry.ts'),
      'utf-8',
    );
    expect(registryContent).toContain('HeroBanner');
    expect(registryContent).toContain("name: 'HeroBanner'");
  });

  it('sets island properties when --island flag is used', async () => {
    const themesDir = path.join(tmpDir, 'themes-3');
    await createMinimalTheme(themesDir, 'aurora');

    await addComponent({
      theme: 'aurora',
      name: 'CartWidget',
      island: true,
      themesDir,
    });

    const registryContent = await fs.readFile(
      path.join(themesDir, 'aurora', 'components', 'registry.ts'),
      'utf-8',
    );
    expect(registryContent).toContain('island: true');
    expect(registryContent).toContain("islandDirective: 'visible'");
  });

  it('sets requiredFeatures when --features is provided', async () => {
    const themesDir = path.join(tmpDir, 'themes-4');
    await createMinimalTheme(themesDir, 'aurora');

    await addComponent({
      theme: 'aurora',
      name: 'ProductComparison',
      features: ['compareProducts'],
      themesDir,
    });

    const registryContent = await fs.readFile(
      path.join(themesDir, 'aurora', 'components', 'registry.ts'),
      'utf-8',
    );
    expect(registryContent).toContain("'compareProducts'");
    expect(registryContent).toContain('requiredFeatures');
  });

  it('does not overwrite existing component files', async () => {
    const themesDir = path.join(tmpDir, 'themes-5');
    const themeDir = await createMinimalTheme(themesDir, 'aurora');

    // Create existing react component
    await fs.writeFile(
      path.join(themeDir, 'components', 'react', 'Existing.tsx'),
      'export default function Existing() { return <div>Original</div>; }',
    );

    await expect(
      addComponent({
        theme: 'aurora',
        name: 'Existing',
        themesDir,
      })
    ).rejects.toThrow();
  });

  it('throws error if theme does not exist', async () => {
    const themesDir = path.join(tmpDir, 'themes-6');
    await fs.mkdir(themesDir, { recursive: true });

    await expect(
      addComponent({
        theme: 'nonexistent',
        name: 'TestComponent',
        themesDir,
      })
    ).rejects.toThrow();
  });
});
