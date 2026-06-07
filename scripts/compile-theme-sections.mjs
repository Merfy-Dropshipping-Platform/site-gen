/**
 * Compile v2 theme sections (themes/<theme>/src/components/sections/*.astro) +
 * their import graph (relative .astro/.ts deps + design-system .astro from
 * node_modules) into flat .mjs renderable via Astro Container API.
 *
 * Output: dist/theme-sections/<theme>/<flatName>.mjs
 * Entry per section: dist/theme-sections/<theme>/section__<Name>.mjs
 *
 * Generalizes the proven _rose-render-probe approach. Run:
 *   node scripts/compile-theme-sections.mjs <theme>   (default: rose)
 */
import { transform } from '@astrojs/compiler';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const SITES = resolve(dirname(new URL(import.meta.url).pathname), '..');
const DS = resolve(SITES, 'node_modules/@merfy-dropshipping-platform/design-systems-theme');
const DS_PREFIX = '@merfy-dropshipping-platform/design-systems-theme/';

const theme = process.argv[2] || 'rose';
const THEME_ROOT = resolve(SITES, 'themes', theme);
const SECTIONS_DIR = resolve(THEME_ROOT, 'src/components/sections');
const OUT = resolve(SITES, 'dist/theme-sections', theme);

// ---- per-file compile (from proven probe) ----
function stripTypes(code) {
  return ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve, isolatedModules: true },
  }).outputText;
}
function inlineStyles(code, css) {
  let out = code.replace(/import\s+["'][^"']*\?astro&type=style[^"']*["'];?\r?\n?/g, '');
  const s = (css || []).join('').trim();
  if (s) {
    const lit = s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    out = out.replace(/return\s+\$\$render`/, (m) => `${m}<style>${lit}</style>`);
  }
  return out;
}
const patchCreateAstro = (s) => s.replace(/createAstro\(\$\$props,\s*\$\$slots\)/g, 'createAstro($$$$Astro, $$$$props, $$$$slots)');
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

// resolve an import specifier (from `fromFile`) to an abs path of a compilable
// .astro/.ts, or null (leave import as-is: runtime/react/css/json/unresolved).
function resolveSpec(spec, fromFile) {
  const tryExt = (base) => {
    for (const e of ['', '.astro', '.ts', '.tsx', '/index.ts', '/index.astro']) if (isFile(base + e)) return base + e;
    return null;
  };
  if (spec.startsWith('.')) return tryExt(resolve(dirname(fromFile), spec));
  if (spec.startsWith(DS_PREFIX)) return tryExt(resolve(DS, 'src', spec.slice(DS_PREFIX.length))); // exports ./* → src/*
  return null;
}

// stable flat name from abs path (unique per source file)
function flatName(abs) {
  return abs.replace(SITES + '/', '').replace(/[^a-zA-Z0-9]/g, '_');
}

const compiled = new Set();
async function compileFile(abs) {
  if (compiled.has(abs)) return;
  compiled.add(abs);
  const src = await readFile(abs, 'utf-8');
  let code;
  if (abs.endsWith('.astro')) {
    const r = await transform(src, { filename: abs, sourcemap: 'external', internalURL: 'astro/runtime/server/index.js', resolvePath: async (s) => s });
    code = patchCreateAstro(stripTypes(inlineStyles(r.code, r.css)));
  } else {
    code = stripTypes(src);
  }
  // rewrite compilable imports → flat sibling .mjs, enqueue deps
  const specs = new Set();
  for (const re of [/from\s+["']([^"']+)["']/g, /import\s+["']([^"']+)["']/g]) {
    let m; while ((m = re.exec(code))) specs.add(m[1]);
  }
  const deps = [];
  for (const spec of specs) {
    const dep = resolveSpec(spec, abs);
    if (!dep) continue;
    deps.push(dep);
    code = code.split(`"${spec}"`).join(`"./${flatName(dep)}.mjs"`).split(`'${spec}'`).join(`'./${flatName(dep)}.mjs'`);
  }
  await writeFile(resolve(OUT, `${flatName(abs)}.mjs`), code, 'utf-8');
  for (const dep of deps) await compileFile(dep);
}

// ---- run ----
await mkdir(OUT, { recursive: true });
const sectionFiles = (await readdir(SECTIONS_DIR)).filter((f) => f.endsWith('.astro') && f !== 'Puk.astro');
const manifest = {};
for (const f of sectionFiles) {
  const abs = resolve(SECTIONS_DIR, f);
  await compileFile(abs);
  const name = f.replace('.astro', '');
  manifest[name] = `${flatName(abs)}.mjs`;
}
await writeFile(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`✓ ${theme}: ${sectionFiles.length} sections, ${compiled.size} files compiled → dist/theme-sections/${theme}/`);
console.log('sections:', Object.keys(manifest).join(', '));
