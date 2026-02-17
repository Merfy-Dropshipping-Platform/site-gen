import * as path from 'node:path';
import * as fs from 'node:fs/promises';

export interface CreateThemeOptions {
  name: string;
  category: string;
  from?: string;
  outputDir: string;
}

/**
 * Checks if a path exists.
 */
async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively copies a directory.
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Creates a minimal theme manifest.
 */
function createManifest(name: string, category: string): object {
  return {
    name,
    version: '1.0.0',
    description: `${name} theme for ${category} stores`,
    category,
    author: 'Merfy',
    features: {
      variants: true,
      collections: true,
      search: true,
    },
    pages: ['index'],
    settings_schema: [],
  };
}

/**
 * Creates default settings_schema.
 */
function createDefaultSettingsSchema(): object[] {
  return [
    {
      name: 'Colors',
      settings: [
        { id: 'color_primary', type: 'color', label: 'Primary Color', default: '#e11d48' },
        { id: 'color_background', type: 'color', label: 'Background', default: '#ffffff' },
        { id: 'color_foreground', type: 'color', label: 'Text Color', default: '#121212' },
      ],
    },
    {
      name: 'Typography',
      settings: [
        { id: 'font_heading', type: 'font', label: 'Heading Font', default: 'Inter' },
        { id: 'font_body', type: 'font', label: 'Body Font', default: 'Inter' },
      ],
    },
    {
      name: 'Layout',
      settings: [
        { id: 'page_width', type: 'range', label: 'Page Width', min: 1000, max: 1600, default: 1280, unit: 'px' },
        { id: 'radius_base', type: 'range', label: 'Border Radius', min: 0, max: 24, default: 8, unit: 'px' },
      ],
    },
  ];
}

/**
 * Creates default tokens.css content.
 */
function createDefaultTokensCss(): string {
  return `:root {
  --color-primary: #e11d48;
  --color-primary-rgb: 225, 29, 72;
  --color-background: #ffffff;
  --color-background-rgb: 255, 255, 255;
  --color-foreground: #121212;
  --color-foreground-rgb: 18, 18, 18;
  --color-border: #e5e7eb;
  --color-border-rgb: 229, 231, 235;
  --color-button-text: #ffffff;
  --color-button-text-rgb: 255, 255, 255;
  --font-heading: 'Inter', sans-serif;
  --font-body: 'Inter', sans-serif;
  --radius-base: 0.5rem;
  --radius-button: 9999px;
  --radius-card: 1rem;
  --radius-input: 0.5rem;
  --page-width: 1280px;
  --spacing-section: 4rem;
}
`;
}

/**
 * Creates a minimal registry.ts file.
 */
function createRegistryFile(): string {
  return `import type { ComponentRegistryEntry } from '@merfy/themes/types';

const registry: ComponentRegistryEntry[] = [];

export default registry;
`;
}

/**
 * Creates a minimal layout file.
 */
function createDefaultLayout(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Store</title>
  </head>
  <body>
    <slot />
  </body>
</html>
`;
}

/**
 * Creates a minimal page template.
 */
function createDefaultPageJson(): object {
  return {
    root: {},
    content: [],
    zones: {},
  };
}

/**
 * Creates a new theme, either from scratch or from an existing template.
 *
 * Without --from: Creates a minimal theme skeleton with required files.
 * With --from: Copies an existing theme directory and updates the manifest.
 *
 * @param options - Theme creation options
 * @throws Error if theme already exists or source theme not found
 */
export async function createTheme(options: CreateThemeOptions): Promise<void> {
  const { name, category, from, outputDir } = options;
  const themeDir = path.join(outputDir, name);

  // Check if theme already exists
  if (await exists(themeDir)) {
    const hasManifest = await exists(path.join(themeDir, 'theme.json'));
    if (hasManifest) {
      throw new Error(`Theme '${name}' already exists at ${themeDir}`);
    }
  }

  if (from) {
    // Copy from existing theme
    const sourceDir = path.join(outputDir, from);
    if (!(await exists(sourceDir))) {
      throw new Error(`Source theme '${from}' not found at ${sourceDir}`);
    }

    await copyDir(sourceDir, themeDir);

    // Update theme.json with new name and category
    const manifestPath = path.join(themeDir, 'theme.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    manifest.name = name;
    manifest.category = category;
    manifest.description = `${name} theme for ${category} stores`;
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  } else {
    // Create minimal skeleton
    await fs.mkdir(themeDir, { recursive: true });
    await fs.mkdir(path.join(themeDir, 'components', 'react'), { recursive: true });
    await fs.mkdir(path.join(themeDir, 'components', 'astro'), { recursive: true });
    await fs.mkdir(path.join(themeDir, 'components', 'variants'), { recursive: true });
    await fs.mkdir(path.join(themeDir, 'layouts'), { recursive: true });
    await fs.mkdir(path.join(themeDir, 'pages'), { recursive: true });
    await fs.mkdir(path.join(themeDir, 'assets'), { recursive: true });

    // theme.json
    await fs.writeFile(
      path.join(themeDir, 'theme.json'),
      JSON.stringify(createManifest(name, category), null, 2),
      'utf-8',
    );

    // settings_schema.json
    await fs.writeFile(
      path.join(themeDir, 'settings_schema.json'),
      JSON.stringify(createDefaultSettingsSchema(), null, 2),
      'utf-8',
    );

    // tokens.css
    await fs.writeFile(
      path.join(themeDir, 'tokens.css'),
      createDefaultTokensCss(),
      'utf-8',
    );

    // components/registry.ts
    await fs.writeFile(
      path.join(themeDir, 'components', 'registry.ts'),
      createRegistryFile(),
      'utf-8',
    );

    // layouts/default.astro
    await fs.writeFile(
      path.join(themeDir, 'layouts', 'default.astro'),
      createDefaultLayout(),
      'utf-8',
    );

    // pages/index.json
    await fs.writeFile(
      path.join(themeDir, 'pages', 'index.json'),
      JSON.stringify(createDefaultPageJson(), null, 2),
      'utf-8',
    );
  }
}

/**
 * CLI entry point for theme:create command.
 * Parses process.argv and calls createTheme().
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  let name = '';
  let category = 'general';
  let from: string | undefined;
  let outputDir = path.resolve('themes');

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--name':
        name = argv[++i];
        break;
      case '--category':
        category = argv[++i];
        break;
      case '--from':
        from = argv[++i];
        break;
      case '--output':
        outputDir = path.resolve(argv[++i]);
        break;
    }
  }

  if (!name) {
    console.error('Usage: theme:create --name <name> --category <category> [--from <theme>] [--output <dir>]');
    process.exit(1);
  }

  try {
    await createTheme({ name, category, from, outputDir });
    console.log(`Theme '${name}' created successfully at ${path.join(outputDir, name)}`);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
