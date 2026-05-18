#!/usr/bin/env node
/**
 * Scaffold new block в theme-base. Spec 092 FR-009.
 *
 * Usage: pnpm new:block <Name>
 *
 * Создаёт `packages/theme-base/blocks/<Name>/` со всеми 5 файлами per
 * @merfy/theme-base CLAUDE.md anatomy:
 *   - <Name>.astro
 *   - <Name>.puckConfig.ts
 *   - <Name>.classes.ts
 *   - <Name>.tokens.ts
 *   - index.ts
 *
 * После: edit defaults / fields под нужный design, run `pnpm validate:blocks`,
 * commit. Block автоматически появится в палитре конструктора через
 * registry scan (или /api/themes/:id/puck-config).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const name = process.argv[2];
if (!name) {
  console.error('Usage: pnpm new:block <Name>');
  console.error('Example: pnpm new:block Testimonial');
  process.exit(1);
}
if (!/^[A-Z][A-Za-z0-9]+$/.test(name)) {
  console.error(`Invalid block name: ${name}`);
  console.error('Must be PascalCase: starts with uppercase letter, alphanumeric only');
  process.exit(1);
}

const blocksRoot = path.resolve(import.meta.dirname, '..', 'packages/theme-base/blocks');
const dir = path.join(blocksRoot, name);

try {
  await fs.access(dir);
  console.error(`Block ${name} already exists at ${dir}`);
  process.exit(1);
} catch {
  // good, doesn't exist
}

await fs.mkdir(dir, { recursive: true });

await fs.writeFile(
  path.join(dir, `${name}.astro`),
  `---
import type { ${name}Props } from './${name}.puckConfig';
import { ${name}Classes as C } from './${name}.classes';

const raw = Astro.props as Record<string, unknown>;
const { id } = raw as ${name}Props & { id?: string };
---
<section class={C.root} data-puck-component-id={id} data-block="${name.toLowerCase()}">
  <div class={C.container}>
    {/* TODO: implement ${name} render */}
  </div>
</section>
`,
);

await fs.writeFile(
  path.join(dir, `${name}.puckConfig.ts`),
  `import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const ${name}Schema = z.object({
  // TODO: add fields
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }).optional(),
});

export type ${name}Props = z.infer<typeof ${name}Schema>;

export const ${name}PuckConfig: BlockPuckConfig<${name}Props> = {
  label: '${name}',
  category: 'content',
  paletteOrder: 100,
  fields: {
    // TODO: add Puck fields
  },
  defaultProps: {
    padding: { top: 0, bottom: 0 },
  },
};
`,
);

await fs.writeFile(
  path.join(dir, `${name}.classes.ts`),
  `export const ${name}Classes = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
} as const;
`,
);

await fs.writeFile(
  path.join(dir, `${name}.tokens.ts`),
  `export const ${name}Tokens = {
  colors: ['--color-bg', '--color-text'],
  fonts: [],
  radii: [],
  spacing: ['--container-max-width'],
} as const;
`,
);

await fs.writeFile(
  path.join(dir, 'index.ts'),
  `export { ${name}PuckConfig, ${name}Schema } from './${name}.puckConfig';
export type { ${name}Props } from './${name}.puckConfig';
export { ${name}Classes } from './${name}.classes';
export { ${name}Tokens } from './${name}.tokens';
`,
);

console.log(`✅ Block ${name} scaffolded at ${path.relative(process.cwd(), dir)}`);
console.log('');
console.log('Next steps:');
console.log(`  1. Edit ${name}.astro + ${name}.puckConfig.ts under design`);
console.log(`  2. Run: pnpm validate:blocks`);
console.log(`  3. Run: node scripts/compile-astro-blocks.mjs`);
console.log(`  4. Commit + push → block появится в палитре after deploy`);
