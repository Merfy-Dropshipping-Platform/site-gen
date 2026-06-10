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

// ---- hoisted <script> inlining ----
// Astro компилирует hoisted <script> компонента в
//   ${$$renderScript($$result, "<abs>?astro&type=script&index=N&lang.ts")}
// В dev этот виртуальный модуль отдаёт Vite, в `astro build` он бандлится в
// _astro/*.js. У Container API нет ни того ни другого — src уходил в HTML как
// есть и давал 404 на live/превью (гидрация секций композитных страниц
// мёртвая). Инлайним аналогично <style>: код скрипта бандлим esbuild'ом
// (imports вида ../../lib/storefront-hydrate становятся самодостаточным
// кодом) и кладём <script type="module"> прямо в render-шаблон. window-гард
// повторяет семантику Astro «hoisted-модуль выполняется один раз на
// страницу»: дубль секции или повторный hot-replace не плодит document-level
// обработчики (Header); ре-инициализация после hot-replace — стандартный
// сигнал astro:page-load (его шлёт превью-агент, как ClientRouter после
// навигации; hydratePopular/header-sync верстальщика на него подписаны).
// `<script is:inline>` сюда не попадают — они остаются литералами шаблона.
// esbuild берём из дерева зависимостей astro (прямого dep нет — рантайму
// сервиса он не нужен, скрипт работает на стадии сборки образа).
const esbuild = createRequire(require.resolve('astro/package.json'))('esbuild');

async function bundleHoistedScript(tsCode, fromFile) {
  const r = await esbuild.build({
    stdin: { contents: tsCode, resolveDir: dirname(fromFile), sourcefile: fromFile, loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'browser', logLevel: 'silent',
  });
  return r.outputFiles[0].text;
}

async function inlineScripts(code, scripts, fromFile) {
  const re = /\$\{\$\$renderScript\(\$\$result,\s*"[^"]*\?astro&type=script&index=(\d+)[^"]*"\)\}/g;
  for (const m of [...code.matchAll(re)]) {
    const hoisted = (scripts || [])[Number(m[1])];
    let tag = '';
    if (hoisted && hoisted.code) {
      const key = `__merfy_hoisted_${flatName(fromFile)}_${m[1]}`;
      const js = (await bundleHoistedScript(hoisted.code, fromFile))
        // </script> внутри JS-строк закрыл бы инлайн-тег при HTML-парсинге
        .replace(/<\/script/gi, '<\\/script');
      const guarded = `if(!window[${JSON.stringify(key)}]){window[${JSON.stringify(key)}]=1;\n${js}}`;
      const lit = guarded.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
      tag = `<script type="module">${lit}</script>`;
    } else {
      console.warn(`! hoisted script без code (external src?) — выпилен: ${fromFile} index=${m[1]}`);
    }
    code = code.replace(m[0], () => tag);
  }
  return code;
}

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
    const withAssets = await inlineScripts(inlineStyles(r.code, r.css), r.scripts, abs);
    code = patchCreateAstro(stripTypes(withAssets));
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
