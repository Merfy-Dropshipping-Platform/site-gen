/**
 * Замыкание относительных импортов файла (spec 115, часть 3).
 *
 * Тёплый рендер держит модули секций загруженными: второй вызов их не читает,
 * поэтому «что прочитал вызов» по fs не узнать. Но собранный модуль секции
 * импортирует соседей только статически и только относительными путями
 * (`from "./x.mjs"`, изредка `import('../data/x.json')` литералом), так что
 * набор модулей вызова — ровно замыкание этих импортов от модуля блока.
 * Голые имена (`astro/runtime/...`) — это node_modules, их сторожит lockfile.
 *
 * Для CommonJS (`dist/src`) — `require("./x")` с поиском .js/.json/index.js.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ESM = [
  /(?:^|[\s;])(?:import|export)\b[^'"`;]*?\bfrom\s*["'](\.{1,2}\/[^"']+)["']/g,
  /(?:^|[\s;])import\s*["'](\.{1,2}\/[^"']+)["']/g,
];
const CJS = [/\brequire\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g];
// import(…): аргумент — литерал ('…', "…" или `…` без подстановок) или что-то вычисляемое.
const DYNAMIC_IMPORT = /\bimport\(\s*([^)]*?)\s*\)/g;
const LITERAL = /^(['"`])(\.{1,2}\/[^'"`$]+)\1$/;

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Относительный спецификатор → файл: как есть, затем .js/.json/.mjs/.cjs, затем index.js. */
function resolveSpecifier(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec.split('?')[0]);
  const candidates = [base, `${base}.js`, `${base}.json`, `${base}.mjs`, `${base}.cjs`, resolve(base, 'index.js')];
  return candidates.find(isFile) ?? null;
}

/** Прямые зависимости файла + есть ли в нём import() с вычисляемым путём. */
function specifiersOf(file) {
  let text;
  try {
    text = readFileSync(file, 'utf-8');
  } catch {
    return { specs: [], dynamic: false };
  }
  if (file.endsWith('.json')) return { specs: [], dynamic: false };
  const fixed = [...ESM, ...CJS].flatMap((re) => [...text.matchAll(re)].map((m) => m[1]));
  const imports = [...text.matchAll(DYNAMIC_IMPORT)].map((m) => m[1]);
  const literal = imports.map((a) => a.match(LITERAL)?.[2]).filter(Boolean);
  // Голое имя пакета (`import('astro/…')`) — node_modules, его сторожит lockfile.
  const computed = imports.filter((a) => !LITERAL.test(a) && !/^(['"`])[^./'"`][^'"`$]*\1$/.test(a));
  return { specs: [...fixed, ...literal], dynamic: computed.length > 0 };
}

/**
 * Замыкание от набора файлов. `memo` (Map файл → разбор) передаётся между
 * вызовами, чтобы не разбирать модуль заново на каждый рендер. Путь, которого
 * нет на диске, остаётся в замыкании: его отсутствие — тоже вход.
 * `closure.dynamic` — файлы с import() по вычисляемому пути: за ними может
 * стоять что угодно, и замыкание про них неполно.
 */
export function staticClosure(entries, memo = new Map()) {
  const seen = new Set();
  const dynamic = [];
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!existsSync(file)) continue;
    if (!memo.has(file)) {
      const { specs, dynamic: isDynamic } = specifiersOf(file);
      memo.set(file, { deps: specs.map((s) => resolveSpecifier(file, s)).filter(Boolean), dynamic: isDynamic });
    }
    const parsed = memo.get(file);
    if (parsed.dynamic) dynamic.push(file);
    queue.push(...parsed.deps);
  }
  return Object.assign(seen, { dynamic });
}
