#!/usr/bin/env node
/**
 * Precompile all .astro blocks from @merfy/theme-base (and theme-<name> packages)
 * into dist/astro-blocks/*.mjs — standard Node ESM that Astro Container can import.
 *
 * Pipeline:
 *   1. Compile each .astro to .mjs via @astrojs/compiler (retains TS in frontmatter)
 *   2. Strip TypeScript syntax with ts.transpileModule (interfaces, types, as casts)
 *   3. Compile sibling .ts files (Hero.classes.ts, Hero.tokens.ts, etc.) to .mjs
 *   4. Rewrite relative imports like './Hero.classes' to './Hero.classes.mjs'
 *      (so Node's ESM resolver can find them)
 *
 * Usage: node scripts/compile-astro-blocks.mjs  (or: pnpm build:blocks)
 */

import { transform } from '@astrojs/compiler';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

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
        const blockDirPath = path.join(blocksDir, blockDir.name);
        const blockFiles = await fs.readdir(blockDirPath);
        for (const f of blockFiles) {
          if (f.endsWith('.astro')) {
            entries.push({
              pkg: pkg.name,
              blockName: blockDir.name,
              fileName: f,
              blockDirPath,
              fullPath: path.join(blockDirPath, f),
              kind: 'block',
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

/**
 * Find non-block .astro entries — theme-base/layouts/*.astro and theme-base/seo/*.astro
 * (plus nested CoreWebVitals/*.astro). These do not live in blocks/ dirs, so they do not
 * have a per-block folder containing sibling .ts files — any TS they need is imported
 * by file path (e.g. SEO astros import ../SomeBuilder.ts via relative path).
 *
 * Naming convention for output: <pkg>__<category>__<relPath>.mjs (where relPath uses
 * '__' as path separator so the file stays flat in dist/astro-blocks/).
 * Example: theme-base__layouts__BaseLayout.mjs
 *          theme-base__seo__MetaTags.mjs
 *          theme-base__seo__CoreWebVitals__FontPreload.mjs
 */
async function findAstroNonBlocks() {
  const entries = [];
  const basePkg = 'theme-base';
  const basePath = path.join(PACKAGES_DIR, basePkg);

  const locations = [
    { subdir: 'layouts', category: 'layouts' },
    { subdir: 'seo', category: 'seo' },
  ];

  for (const loc of locations) {
    const dir = path.join(basePath, loc.subdir);
    try {
      await walkAstroFiles(dir, basePkg, loc.category, entries, '');
    } catch {
      // skip missing dir
    }
  }

  return entries;
}

async function walkAstroFiles(dir, pkg, category, entries, prefix) {
  const items = await fs.readdir(dir, { withFileTypes: true });
  for (const item of items) {
    const itemPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      await walkAstroFiles(itemPath, pkg, category, entries, `${prefix}${item.name}__`);
    } else if (item.name.endsWith('.astro')) {
      const baseName = item.name.replace(/\.astro$/, '');
      // blockName here is used purely for output naming + manifest identity.
      const blockName = `${category}__${prefix}${baseName}`;
      entries.push({
        pkg,
        blockName,
        fileName: item.name,
        blockDirPath: path.dirname(itemPath),
        fullPath: itemPath,
        kind: category,
      });
    }
  }
}

/**
 * Strip TypeScript syntax from a JS-with-TS-in-it source. Uses
 * ts.transpileModule which erases types/interfaces/as-casts but leaves
 * runtime code intact.
 */
function stripTypes(source, filename) {
  const out = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      // Verbatim: keep everything as-is, just drop the types.
      isolatedModules: true,
    },
    fileName: filename,
  });
  return out.outputText;
}

/**
 * Rewrite relative imports that lack an extension (or end in .ts) to point
 * to sibling .mjs files in the flat dist/astro-blocks/ layout.
 *
 * `./Hero.classes` or `./Hero.classes.ts` → `./<pkg>__<blockName>__Hero.classes.mjs`
 *
 * For non-block entries (layouts, seo), we keep the simple `<pkg>__<blockName>__<mod>.mjs`
 * flattening, but these entries may import `.astro` sibling files and `../` grandparent
 * paths (e.g. StoreLayout.astro imports `./BaseLayout.astro` and `../blocks/Header/Header.astro`).
 * These cross-file .astro imports can't be trivially resolved in the flat dist/ layout,
 * so such astros will fail to render via the Container and will surface in verify:astro.
 * That's acceptable in Phase 1b — Phase 1c wires the real integration.
 */
function rewriteRelativeImports(source, pkg, blockName) {
  return source.replace(
    /(from\s+["'])(\.\/)([A-Za-z0-9_.-]+?)(\.ts)?(["'])/g,
    (match, prefix, dot, modName, _tsExt, suffix) => {
      // Don't touch .json, .css, etc.
      if (modName.endsWith('.json') || modName.endsWith('.css') || modName.endsWith('.mjs')) {
        return match;
      }
      // .astro sibling imports are rewritten to the flat dist naming as well.
      // This only resolves correctly when the referenced sibling .astro is itself
      // part of the same output dir with matching flat name — e.g. layouts/StoreLayout
      // importing `./BaseLayout.astro` → `./theme-base__layouts__BaseLayout.mjs`.
      if (modName.endsWith('.astro')) {
        const bare = modName.replace(/\.astro$/, '');
        // If entry is a non-block (layouts__X or seo__X), its siblings use the same category prefix.
        // E.g. StoreLayout blockName = 'layouts__StoreLayout' → prefix = 'layouts__'
        // Sibling './BaseLayout.astro' should resolve to 'theme-base__layouts__BaseLayout.mjs'.
        const catMatch = /^([a-z]+__)/i.exec(blockName);
        const category = catMatch ? catMatch[1] : '';
        return `${prefix}./${pkg}__${category}${bare}.mjs${suffix}`;
      }
      return `${prefix}./${pkg}__${blockName}__${modName}.mjs${suffix}`;
    },
  );
}

/**
 * Patch the createAstro call in compiled output.
 *
 * @astrojs/compiler@3.0.1 emits `$$result.createAstro($$props, $$slots)` — the
 * legacy 2-arg form. But astro@4.16 runtime's `renderContext.createAstro`
 * wrapper expects 3 args `(astroGlobal, props, slots)`.
 *
 * Without this patch `Astro.props` resolves empty (props gets treated as the
 * static astroGlobal). Astro's own vite pipeline doesn't hit this because it
 * post-processes via esbuild + result wrappers; here we use raw Node ESM.
 *
 * Rewrite `createAstro($$props, $$slots)` → `createAstro($$Astro, $$props, $$slots)`.
 */
function patchCreateAstroCall(source) {
  // NOTE: in String.replace replacement strings, `$$` means literal `$`. So to
  // produce `$$Astro` in the output we need `$$$$Astro` in the replacement.
  return source.replace(
    /createAstro\(\$\$props,\s*\$\$slots\)/g,
    'createAstro($$$$Astro, $$$$props, $$$$slots)',
  );
}

/**
 * Compile one sibling .ts file (Hero.classes.ts, Hero.puckConfig.ts, etc.)
 * to dist/astro-blocks/<pkg>__<blockName>__<name>.mjs.
 */
async function compileSiblingTs(pkg, blockName, blockDirPath, tsFileName) {
  const srcPath = path.join(blockDirPath, tsFileName);
  const source = await fs.readFile(srcPath, 'utf-8');
  const stripped = stripTypes(source, srcPath);
  const rewritten = rewriteRelativeImports(stripped, pkg, blockName);

  const baseName = tsFileName.replace(/\.ts$/, '');
  const outName = `${pkg}__${blockName}__${baseName}.mjs`;
  const outPath = path.join(DIST_DIR, outName);
  await fs.writeFile(outPath, rewritten, 'utf-8');
  return outPath;
}

async function compileOne(entry) {
  const source = await fs.readFile(entry.fullPath, 'utf-8');
  const result = await transform(source, {
    filename: entry.fullPath,
    sourcemap: 'external',
    internalURL: 'astro/runtime/server/index.js',
    resolvePath: (specifier) => specifier,
  });

  // The .astro compiler leaves TS in the frontmatter (interfaces, `as Props`,
  // `import type`, etc.). Strip all TS syntax via tsc in transpileModule mode.
  const stripped = stripTypes(result.code, entry.fullPath);

  // Rewrite relative imports so they point to our flat dist/ layout with .mjs.
  const imports_rewritten = rewriteRelativeImports(stripped, entry.pkg, entry.blockName);

  // Fix the compiler/runtime mismatch in createAstro call.
  const rewritten = patchCreateAstroCall(imports_rewritten);

  // Output filename: <pkg>__<blockName>__<fileName>.mjs
  // Flat to avoid deep paths in dist/
  // For non-block entries, blockName already contains the category (e.g. 'layouts__BaseLayout'),
  // so fileName is the same as blockName's trailing segment — to avoid double-suffix we still
  // append the bare file base just once.
  const baseName = entry.fileName.replace(/\.astro$/, '');
  const outName = entry.kind === 'block'
    ? `${entry.pkg}__${entry.blockName}__${baseName}.mjs`
    : `${entry.pkg}__${entry.blockName}.mjs`;
  const outPath = path.join(DIST_DIR, outName);
  await fs.mkdir(DIST_DIR, { recursive: true });
  await fs.writeFile(outPath, rewritten, 'utf-8');

  // Also compile all sibling .ts files (Hero.classes.ts, etc.) so the
  // rewritten relative imports resolve. Only for block entries — layouts/seo
  // share a flat directory where .ts files are not per-entry siblings.
  const siblingOutputs = [];
  if (entry.kind === 'block') {
    const siblings = await fs.readdir(entry.blockDirPath);
    for (const sib of siblings) {
      if (sib.endsWith('.ts') && !sib.endsWith('.d.ts')) {
        const sibOut = await compileSiblingTs(entry.pkg, entry.blockName, entry.blockDirPath, sib);
        siblingOutputs.push(sibOut);
      }
    }
  }

  return {
    entry,
    outPath,
    byteLength: rewritten.length,
    siblings: siblingOutputs,
  };
}

async function main() {
  const blockEntries = await findAstroBlocks();
  const nonBlockEntries = await findAstroNonBlocks();
  const entries = [...blockEntries, ...nonBlockEntries];
  if (entries.length === 0) {
    console.error('No .astro files found under packages/theme-*/');
    process.exit(1);
  }

  await fs.mkdir(DIST_DIR, { recursive: true });

  console.log(
    `Compiling ${blockEntries.length} block(s) + ${nonBlockEntries.length} non-block(s) — total ${entries.length}...`,
  );
  const results = [];
  for (const entry of entries) {
    try {
      const r = await compileOne(entry);
      const sibCount = r.siblings.length;
      console.log(
        `  ✓ ${entry.pkg}/${entry.blockName}/${entry.fileName} → ${path.basename(r.outPath)} (${r.byteLength}B) + ${sibCount} sibling .ts [${entry.kind}]`,
      );
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
      siblings: r.siblings.map(p => path.basename(p)),
      kind: r.entry.kind,
    })),
  };
  await fs.writeFile(path.join(DIST_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`Manifest: ${path.join(DIST_DIR, 'manifest.json')} (${results.length} entries)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
