import * as path from 'node:path';
import * as fs from 'node:fs/promises';

export interface AddComponentOptions {
  theme: string;
  name: string;
  island?: boolean;
  features?: string[];
  themesDir: string;
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
 * Converts PascalCase to camelCase for variant file names.
 * ProductComparison -> productComparison
 */
function toCamelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * Generates a React component skeleton.
 */
function generateReactSkeleton(name: string): string {
  return `import React from 'react';

export interface ${name}Props {
  className?: string;
}

export default function ${name}({ className }: ${name}Props) {
  return (
    <div className={className}>
      <p>${name} component</p>
    </div>
  );
}
`;
}

/**
 * Generates an Astro component skeleton.
 */
function generateAstroSkeleton(name: string): string {
  return `---
// ${name} component
interface Props {
  class?: string;
}

const { class: className } = Astro.props;
---

<div class={className}>
  <p>${name} component</p>
</div>
`;
}

/**
 * Generates a CVA variants skeleton.
 */
function generateVariantsSkeleton(name: string): string {
  const camelName = toCamelCase(name);
  return `import { cva, type VariantProps } from 'class-variance-authority';

export const ${camelName}Variants = cva('', {
  variants: {
    variant: {
      default: '',
    },
    size: {
      default: '',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export type ${name}VariantProps = VariantProps<typeof ${camelName}Variants>;
`;
}

/**
 * Generates a registry entry string to append to registry.ts.
 */
function generateRegistryEntry(options: AddComponentOptions): string {
  const { name, island, features } = options;
  const camelName = toCamelCase(name);

  const lines: string[] = [
    `  {`,
    `    name: '${name}',`,
    `    label: '${name.replace(/([A-Z])/g, ' $1').trim()}',`,
    `    category: 'content',`,
    `    puckConfig: {},`,
    `    astroTemplate: '${name}.astro',`,
    `    schema: {},`,
  ];

  if (island) {
    lines.push(`    island: true,`);
    lines.push(`    islandDirective: 'visible',`);
  }

  if (features && features.length > 0) {
    const featuresStr = features.map((f) => `'${f}'`).join(', ');
    lines.push(`    requiredFeatures: [${featuresStr}],`);
  }

  lines.push(`  },`);
  return lines.join('\n');
}

/**
 * Adds a new component to an existing theme.
 *
 * Creates:
 * - components/react/{Name}.tsx (React skeleton)
 * - components/astro/{Name}.astro (Astro skeleton)
 * - components/variants/{camelName}.ts (CVA skeleton)
 * And adds an entry to components/registry.ts
 *
 * @param options - Component creation options
 * @throws Error if theme doesn't exist or component already exists
 */
export async function addComponent(options: AddComponentOptions): Promise<void> {
  const { theme, name, themesDir } = options;
  const themeDir = path.join(themesDir, theme);

  // Verify theme exists
  if (!(await exists(themeDir))) {
    throw new Error(`Theme '${theme}' not found at ${themeDir}`);
  }

  const manifestPath = path.join(themeDir, 'theme.json');
  if (!(await exists(manifestPath))) {
    throw new Error(`Theme '${theme}' has no theme.json manifest`);
  }

  // Check if component already exists
  const reactPath = path.join(themeDir, 'components', 'react', `${name}.tsx`);
  if (await exists(reactPath)) {
    throw new Error(`Component '${name}' already exists at ${reactPath}`);
  }

  // Create directories if they don't exist
  await fs.mkdir(path.join(themeDir, 'components', 'react'), { recursive: true });
  await fs.mkdir(path.join(themeDir, 'components', 'astro'), { recursive: true });
  await fs.mkdir(path.join(themeDir, 'components', 'variants'), { recursive: true });

  // Create React skeleton
  await fs.writeFile(reactPath, generateReactSkeleton(name), 'utf-8');

  // Create Astro skeleton
  const astroPath = path.join(themeDir, 'components', 'astro', `${name}.astro`);
  await fs.writeFile(astroPath, generateAstroSkeleton(name), 'utf-8');

  // Create variants skeleton
  const camelName = toCamelCase(name);
  const variantsPath = path.join(themeDir, 'components', 'variants', `${camelName}.ts`);
  await fs.writeFile(variantsPath, generateVariantsSkeleton(name), 'utf-8');

  // Update registry.ts
  const registryPath = path.join(themeDir, 'components', 'registry.ts');
  if (await exists(registryPath)) {
    let registryContent = await fs.readFile(registryPath, 'utf-8');
    const entry = generateRegistryEntry(options);

    // Find the array and insert the entry
    // Pattern: "const registry: ComponentRegistryEntry[] = [" ... "];"
    const emptyArrayPattern = /\[\s*\]/;
    const arrayEndPattern = /\];\s*$/m;

    if (emptyArrayPattern.test(registryContent)) {
      // Empty array - replace with array containing the entry
      registryContent = registryContent.replace(emptyArrayPattern, `[\n${entry}\n]`);
    } else if (arrayEndPattern.test(registryContent)) {
      // Non-empty array - insert before closing bracket
      registryContent = registryContent.replace(arrayEndPattern, `${entry}\n];\n`);
    } else {
      // Fallback - append entry comment
      registryContent += `\n// Added component: ${name}\n`;
    }

    await fs.writeFile(registryPath, registryContent, 'utf-8');
  }
}

/**
 * CLI entry point for theme:add-component command.
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  let theme = '';
  let name = '';
  let island = false;
  let features: string[] = [];
  let themesDir = path.resolve('themes');

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--theme':
        theme = argv[++i];
        break;
      case '--name':
        name = argv[++i];
        break;
      case '--island':
        island = true;
        break;
      case '--features':
        features = argv[++i].split(',');
        break;
      case '--themes-dir':
        themesDir = path.resolve(argv[++i]);
        break;
    }
  }

  if (!theme || !name) {
    console.error(
      'Usage: theme:add-component --theme <theme> --name <name> [--island] [--features feat1,feat2]',
    );
    process.exit(1);
  }

  try {
    await addComponent({ theme, name, island, features, themesDir });
    console.log(`Component '${name}' added to theme '${theme}' successfully`);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
