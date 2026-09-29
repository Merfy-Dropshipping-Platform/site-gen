/**
 * Инлайн-скрипты блоков `.astro` для jsdom-тестов — с учётом покрытия.
 *
 * Тесты чекаута исполняют тело `<script is:inline>` через `new Function(...)`.
 * Такой код jest не инструментирует, и в отчёте покрытия блоков не видно вовсе.
 * Здесь все инлайн-скрипты файла собираются в один исходник (каждый — функция
 * с параметрами из `define:vars`), он прогоняется через istanbul (тот же, что
 * внутри jest), а покрытие кладётся в `globalThis.__coverage__` под путём самого
 * `.astro`: jest забирает его оттуда вместе с остальным покрытием тест-файла.
 *
 * Номера строк совпадают с `.astro`: каждая функция начинается на той строке,
 * где кончается открывающий тег, поэтому «непокрытая строка 412» — это строка
 * 412 блока. Тело исполняется с `this === window`, как в браузере.
 */
import { readFileSync } from "fs";
import { createRequire } from "module";

export interface AstroScript {
  /** Номер строки, где начинается открывающий `<script` (с единицы). */
  line: number;
  /** Номер строки, где кончается открывающий тег и начинается тело. */
  bodyLine: number;
  /** Атрибуты тега как есть, например `is:inline define:vars={{ blockId: id }}`. */
  attrs: string;
  /** Тело скрипта без тегов. */
  body: string;
}

export interface AstroScriptRunner {
  line: number;
  /** Имена переменных из `define:vars` в порядке объявления. */
  params: string[];
  /** Исполнить тело скрипта с переменными `define:vars` (недостающие — undefined). */
  run(vars?: Record<string, unknown>): unknown;
}

const lineAt = (src: string, index: number): number =>
  src.slice(0, index).split("\n").length;

/**
 * Конец открывающего тега: первый `>` вне фигурных скобок и кавычек. Выражения
 * Astro в атрибутах (`define:vars={{ a: x > 1 }}`) могут содержать `>`.
 */
function openTagEnd(src: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote && src[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return i;
  }
  return -1;
}

// Тег считается скриптом, только если `<script` стоит первым на строке: так
// упоминания `<script>` внутри комментариев и строк разметки не ловятся.
const SCRIPT_START_RE = /^[ \t]*<script\b/gim;

/** Все `<script>` файла по порядку, с позицией и атрибутами. */
export function astroScripts(file: string): AstroScript[] {
  const src = readFileSync(file, "utf8");
  const scripts: AstroScript[] = [];
  for (const m of src.matchAll(SCRIPT_START_RE)) {
    const tagStart = (m.index ?? 0) + m[0].indexOf("<");
    const attrsStart = tagStart + "<script".length;
    const tagEnd = openTagEnd(src, attrsStart);
    if (tagEnd < 0) continue;
    const close = src.indexOf("</script>", tagEnd);
    if (close < 0) continue;
    scripts.push({
      line: lineAt(src, tagStart),
      bodyLine: lineAt(src, tagEnd),
      attrs: src.slice(attrsStart, tagEnd).trim(),
      body: src.slice(tagEnd + 1, close),
    });
  }
  return scripts;
}

/** Части строки, разделённые запятыми верхнего уровня (вне скобок и кавычек). */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;

/** `define:vars={{ a, b: f(x, y), c }}` → ['a', 'b', 'c']. */
export function defineVarsNames(attrs: string): string[] {
  const m = /define:vars=\{\{([\s\S]*)\}\}/.exec(attrs);
  if (!m) return [];
  return splitTopLevel(m[1])
    .map((part) => part.split(":")[0].trim())
    .filter((name) => IDENTIFIER_RE.test(name));
}

// istanbul-lib-instrument не объявлен в зависимостях пакета — берём тот же
// экземпляр, которым инструментирует сам jest (jest → @jest/core →
// @jest/transform → babel-plugin-istanbul → istanbul-lib-instrument). Работает
// с провайдером покрытия jest по умолчанию (babel); при `coverageProvider: 'v8'`
// покрытие `.astro` в отчёт не попадёт.
function loadInstrumenter(): {
  createInstrumenter(opts: Record<string, unknown>): {
    instrumentSync(code: string, filename: string): string;
  };
} {
  const chain = ["@jest/core", "@jest/transform", "babel-plugin-istanbul"];
  try {
    const req = chain.reduce(
      (current, pkg) => createRequire(current.resolve(`${pkg}/package.json`)),
      createRequire(require.resolve("jest/package.json")),
    );
    return req("istanbul-lib-instrument");
  } catch (error) {
    throw new Error(
      `astro-inline-script: не найден istanbul-lib-instrument по цепочке jest → ${chain.join(
        " → ",
      )}. Обновилось дерево зависимостей jest? Исходная ошибка: ${(error as Error).message}`,
    );
  }
}

const instrumenter = loadInstrumenter().createInstrumenter({
  coverageVariable: "__coverage__",
  esModules: false,
  compact: false,
  produceSourceMap: false,
});

const isRunnable = (s: AstroScript): boolean =>
  /\bis:inline\b/.test(s.attrs) &&
  !/\bset:html\b/.test(s.attrs) &&
  s.body.trim() !== "";

/**
 * Исходник, где каждое инлайн-тело — функция, начинающаяся на строке, где
 * кончается её открывающий тег. Между функциями — пустые строки.
 */
function buildVirtualSource(scripts: AstroScript[]): {
  source: string;
  names: string[];
} {
  let source = "";
  let line = 1;
  const names: string[] = [];
  for (const s of scripts) {
    source += "\n".repeat(Math.max(0, s.bodyLine - line));
    const name = `__astroScript_${s.bodyLine}`;
    names.push(name);
    source += `function ${name}(${defineVarsNames(s.attrs).join(", ")}) {${s.body}\n}`;
    line = Math.max(line, s.bodyLine) + s.body.split("\n").length;
  }
  return { source, names };
}

const cache = new Map<string, AstroScriptRunner[]>();

/**
 * Исполнители инлайн-скриптов `.astro` (только `is:inline` с телом). Покрытие
 * пишется под путём `file`. Вызов `run` каждый раз заново исполняет тело —
 * как браузер при монтировании блока.
 */
export function astroInlineRunners(file: string): AstroScriptRunner[] {
  const cached = cache.get(file);
  if (cached) return cached;

  const scripts = astroScripts(file).filter(isRunnable);
  const { source, names } = buildVirtualSource(scripts);
  const instrumented = instrumenter.instrumentSync(source, file);
  // eslint-disable-next-line no-new-func
  const fns = new Function(
    `${instrumented}\nreturn [${names.join(", ")}];`,
  )() as Array<(...args: unknown[]) => unknown>;

  const runners = scripts.map((s, i) => {
    const params = defineVarsNames(s.attrs);
    return {
      line: s.line,
      params,
      run: (vars: Record<string, unknown> = {}) =>
        fns[i].apply(
          globalThis,
          params.map((p) => vars[p]),
        ),
    };
  });
  cache.set(file, runners);
  return runners;
}
