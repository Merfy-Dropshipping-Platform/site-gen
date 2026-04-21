#!/usr/bin/env node
/**
 * Precompile all .astro blocks from @merfy/theme-base (and theme-<name> packages)
 * into dist/astro-blocks/*.mjs — standard Node ESM that Astro Container can import.
 *
 * Usage: node scripts/compile-astro-blocks.mjs  (or: pnpm build:blocks)
 */

import { transform } from '@astrojs/compiler';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(SITES_ROOT, 'packages');
const DIST_DIR = path.join(SITES_ROOT, 'dist', 'astro-blocks');

async function findAstroBlocks() {
  const entries = [];
  // Scan theme-base and any theme-<name> package
  const pkgs = await fs.readdir(PACKAGES_DIR, { withFileTypes: true });
  for (const pkg of pkgs) {
    if (!pkg.isDirectory()) continue;
    // Only packages starting with "theme-" (theme-base, theme-rose, etc.)
    if (!pkg.name.startsWith('theme-')) continue;

    const blocksDir = path.join(PACKAGES_DIR, pkg.name, 'blocks');
    try {
      const blockDirs = await fs.readdir(blocksDir, { withFileTypes: true });
      for (const blockDir of blockDirs) {
        if (!blockDir.isDirectory()) continue;
        const blockFiles = await fs.readdir(path.join(blocksDir, blockDir.name));
        for (const f of blockFiles) {
          if (f.endsWith('.astro')) {
            entries.push({
              pkg: pkg.name,
              blockName: blockDir.name,
              fileName: f,
              fullPath: path.join(blocksDir, blockDir.name, f),
            });
          }
        }
      }
    } catch {
      // Package has no blocks/ dir — skip
    }
  }
  return entries;
}

async function compileOne(entry) {
  const source = await fs.readFile(entry.fullPath, 'utf-8');
  const result = await transform(source, {
    filename: entry.fullPath,
    sourcemap: 'external',
    internalURL: 'astro/runtime/server/index.js',
    resolvePath: (specifier) => specifier,
  });

  // Output filename: <pkg>__<blockName>__<fileName>.mjs
  // Flat to avoid deep paths in dist/
  const outName = `${entry.pkg}__${entry.blockName}__${entry.fileName.replace(/\.astro$/, '')}.mjs`;
  const outPath = path.join(DIST_DIR, outName);
  await fs.mkdir(DIST_DIR, { recursive: true });
  await fs.writeFile(outPath, result.code, 'utf-8');
  return { entry, outPath, byteLength: result.code.length };
}

async function main() {
  const entries = await findAstroBlocks();
  if (entries.length === 0) {
    console.error('No .astro blocks found under packages/theme-*/blocks/');
    process.exit(1);
  }

  console.log(`Compiling ${entries.length} .astro block(s)...`);
  const results = [];
  for (const entry of entries) {
    try {
      const r = await compileOne(entry);
      console.log(`  ✓ ${entry.pkg}/${entry.blockName}/${entry.fileName} → ${path.basename(r.outPath)} (${r.byteLength}B)`);
      results.push(r);
    } catch (err) {
      console.error(`  ✗ ${entry.pkg}/${entry.blockName}/${entry.fileName}: ${err.message}`);
      process.exit(1);
    }
  }

  // Write manifest JSON for PreviewService to look up compiled modules
  const manifest = {
    compiledAt: new Date().toISOString(),
    blocks: results.map(r => ({
      pkg: r.entry.pkg,
      blockName: r.entry.blockName,
      fileName: r.entry.fileName,
      outputName: path.basename(r.outPath),
    })),
  };
  await fs.writeFile(path.join(DIST_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`Manifest: ${path.join(DIST_DIR, 'manifest.json')} (${results.length} blocks)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
