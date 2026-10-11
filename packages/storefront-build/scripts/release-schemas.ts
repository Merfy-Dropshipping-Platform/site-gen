import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenMigrationsSchema } from '@merfy/tokens';
import { z } from 'zod';
import { changelogSchema } from '../src/changelog';

// pnpm exec tsx scripts/release-schemas.ts — JSON Schema журнала версий и шагов перевода (design.md блока 10, О-1:
// данные в JSON, схема рядом). Источник — схемы zod; файлы generated/ руками не правят.
const OUT_DIR = fileURLToPath(new URL('../generated/', import.meta.url));

export const RELEASE_SCHEMAS = [
  ['changelog.schema.json', changelogSchema],
  ['migrations.schema.json', tokenMigrationsSchema],
] as const;

export const schemaText = (schema: z.ZodType): string => `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`;

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [file, schema] of RELEASE_SCHEMAS) await writeFile(join(OUT_DIR, file), schemaText(schema));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
