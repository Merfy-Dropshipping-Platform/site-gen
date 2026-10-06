import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedFiles } from '../src/generated-files';

// pnpm generate — пишет generated/* из схем zod. Руками эти файлы не правят.
const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const [path, text] of Object.entries(generatedFiles())) {
  const target = join(PACKAGE_DIR, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  process.stdout.write(`записан ${target}\n`);
}
