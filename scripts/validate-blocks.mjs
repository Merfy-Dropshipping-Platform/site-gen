#!/usr/bin/env node
/**
 * Local pre-deploy validator. Spec 092 FR-005 (defense layer #0 — dev side).
 *
 * Usage: pnpm validate:blocks
 *
 * Exit code 1 if errors. Warnings shown but не fail. Same logic as startup
 * validation (sites main.ts) — катастрофические проблемы поймает раньше
 * чем код доедет до Coolify build.
 */
import { scanBlockRegistry, validateRegistry } from '../packages/theme-contract/registry/index.ts';
import path from 'node:path';

const packagesDir = path.resolve(import.meta.dirname, '..', 'packages');

console.log(`[validate:blocks] scanning ${path.relative(process.cwd(), packagesDir)}...`);
const registry = await scanBlockRegistry(packagesDir);
console.log(`[validate:blocks] ${registry.blocks.length} blocks discovered`);

const { errors, warnings } = await validateRegistry(registry, packagesDir);

if (warnings.length > 0) {
  console.warn(`\n⚠️  ${warnings.length} warning(s):`);
  for (const w of warnings) {
    console.warn(`  - ${w.code} ${w.block ?? ''}: ${w.message}${w.file ? ` (${w.file})` : ''}`);
  }
}

if (errors.length > 0) {
  console.error(`\n❌ ${errors.length} error(s) — deploy will be blocked:`);
  for (const e of errors) {
    console.error(`  - ${e.code} ${e.block ?? ''}: ${e.message}${e.file ? ` (${e.file})` : ''}`);
  }
  process.exit(1);
}

console.log(`\n✅ ${registry.blocks.length} blocks, 0 errors, ${warnings.length} warning(s)`);
