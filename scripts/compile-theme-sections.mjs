/**
 * Compile v2 theme sections + their import graph (relative .astro/.ts deps +
 * design-system .astro from node_modules) into flat .mjs renderable via
 * Astro Container API.
 *
 * Source map: themes/<theme>/sections.map.json
 *   canonical-block-name → relative path to .astro file (any path within theme root)
 * Output: dist/theme-sections/<theme>/<flatName>.mjs + manifest.json
 *   manifest.json: { "<canonName>": "<flatName>.mjs" }
 *
 * Generalizes the proven _rose-render-probe approach. Run:
 *   node scripts/compile-theme-sections.mjs <theme>   (default: rose)
 */
import { transform } from '@astrojs/compiler';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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

// Vite define-инлайны, которые astro build делает сам, а bare-Node Container — нет.
// Без этого `import.meta.env.BASE_URL` (themes/*/src/lib/with-base.ts) в рантайме
// undefined.BASE_URL → TypeError при рендере секции через Container API.
function inlineViteEnv(code) {
  return code.split('import.meta.env.BASE_URL').join('"/"');
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
  code = inlineViteEnv(code);
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
const mapPath = resolve(THEME_ROOT, 'sections.map.json');
if (!existsSync(mapPath)) {
  console.error(`✗ ${theme}: themes/${theme}/sections.map.json not found — theme is not sliced, nothing to compile`);
  process.exit(1);
}
let sectionMap;
try {
  sectionMap = JSON.parse(await readFile(mapPath, 'utf-8'));
} catch {
  console.error(`✗ ${theme}: themes/${theme}/sections.map.json is not valid JSON`);
  process.exit(1);
}
if (Object.keys(sectionMap).length === 0) {
  console.error(`✗ ${theme}: sections.map.json is empty — nothing to compile`);
  process.exit(1);
}
await mkdir(OUT, { recursive: true });
const manifest = {};
for (const [canonName, relPath] of Object.entries(sectionMap)) {
  const abs = resolve(THEME_ROOT, relPath);
  if (!isFile(abs)) {
    console.error(`✗ ${theme}: section "${canonName}" → ${relPath} does not exist`);
    process.exit(1);
  }
  await compileFile(abs);
  manifest[canonName] = `${flatName(abs)}.mjs`;
}
await writeFile(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`✓ ${theme}: ${Object.keys(manifest).length} sections, ${compiled.size} files compiled → dist/theme-sections/${theme}/`);
console.log('sections:', Object.keys(manifest).join(', '));
