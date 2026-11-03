import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import type * as EsbuildApi from 'esbuild-wasm';
import type { Message, OnResolveArgs, OnResolveResult, Plugin } from 'esbuild-wasm';
import type { SectionFiles } from './format';
import { isWarning, problem, when, type Checked, type SectionProblem } from './problems';
import { DEFINE_STORE, checkScriptSource } from './script-check';
import type { ScriptFacts } from './script-facts';
import { rewriteChecked, type Leftover } from './script-rewrite';
import { SHELL_MODULE } from './script-tree';

// Скрипт секции (design.md блока 7, С7-11 А, п. 12, 18, 20; блок 5 «Секций и SDK», раздел 3.9) — одна сборка для всех
// авторов. Сначала проверка исходника (script-check.ts): «только SDK», вид defineSection, факты для сверки имён и
// script_meta. Потом esbuild склеивает свои файлы секции и убирает типы: импорт — только @merfy/shell (внешний) и свои
// файлы .ts/.js, любой другой пакет и require — import-forbidden. script-rewrite.ts снимает import и defineSection и
// переписывает a[k], esbuild сжимает: в модуле секции импортов нет. Нужен export default. Вес — brotli: больше 10 КБ —
// предупреждение (п. 18), больше 50 КБ — отказ (жёсткий предел — допущение плана).
export { SHELL_MODULE };
export const SCRIPT_LIMITS = { warnBytes: 10 * 1024, maxBytes: 50 * 1024 } as const;
const NAMESPACE = 'merfy-section';
const FORBIDDEN_MARK = 'import-forbidden: ';
const RELATIVE = /^\.\.?\//;

// esbuild — сборка для браузера из esbuild-wasm (блок 2 «Секций и SDK», «Решил сам» п. 5): обычный esbuild и основной
// модуль esbuild-wasm запускают дочерний процесс, а у процесса проверки дочерних процессов нет. Сборке для браузера нужен
// глобальный self; модуль WebAssembly компилируется один раз на процесс, worker: false — без потоков.
type Esbuild = Pick<typeof EsbuildApi, 'build' | 'initialize' | 'transform'>;
let esbuild: Promise<Esbuild> | null = null;

const isEsbuild = (value: unknown): value is Esbuild =>
  ['build', 'initialize', 'transform'].every((name) => typeof Reflect.get(Object(value), name) === 'function');

async function startEsbuild(): Promise<Esbuild> {
  const requireHere = createRequire(import.meta.url);
  if (!('self' in globalThis)) Reflect.set(globalThis, 'self', globalThis);
  const loaded: unknown = requireHere('esbuild-wasm/lib/browser.js');
  if (!isEsbuild(loaded)) throw new Error('в esbuild-wasm нет сборки для браузера');
  const wasmModule = await WebAssembly.compile(readFileSync(requireHere.resolve('esbuild-wasm/esbuild.wasm')));
  await loaded.initialize({ wasmModule, worker: false });
  return loaded;
}

const esbuildOf = (): Promise<Esbuild> => (esbuild ??= startEsbuild());

export interface BuiltScript {
  code: string;
  brotliBytes: number;
  warnings: SectionProblem[];
  // Факты исходника (script-facts.ts): ключи actions, ctx.listen, чтения ctx, классы из toggleClass.
  facts: ScriptFacts;
}

interface Bundled {
  code: string;
  exports: string[];
}

function resolveInSection(files: SectionFiles, args: OnResolveArgs): OnResolveResult {
  if (args.kind === 'entry-point') return { path: args.path, namespace: NAMESPACE };
  const target = posix.normalize(posix.join(posix.dirname(args.importer), args.path));
  const own = RELATIVE.test(args.path) && args.kind !== 'require-call' && Object.hasOwn(files, target);
  if (own) return { path: target, namespace: NAMESPACE };
  const text = `${FORBIDDEN_MARK}«${args.path}» — секция импортирует только ${SHELL_MODULE} и свои файлы .ts/.js`;
  return { errors: [{ text }] };
}

const sectionPlugin = (files: SectionFiles): Plugin => ({
  name: NAMESPACE,
  setup: (pluginBuild) => {
    pluginBuild.onResolve({ filter: /^@merfy\/shell$/ }, (args) => ({ path: args.path, external: true }));
    pluginBuild.onResolve({ filter: /.*/ }, (args) => resolveInSection(files, args));
    pluginBuild.onLoad({ filter: /.*/, namespace: NAMESPACE }, (args) => ({
      contents: files[args.path] ?? '',
      loader: args.path.endsWith('.ts') ? 'ts' : 'js',
    }));
  },
});

// Ошибка esbuild → проблема приёма: файл без пространства имён плагина, колонка с 1.
function messageProblem(message: Message): SectionProblem {
  const forbidden = message.text.startsWith(FORBIDDEN_MARK);
  const text = forbidden ? message.text.slice(FORBIDDEN_MARK.length) : message.text;
  const location = message.location;
  const file = location === null ? '' : location.file.replace(`${NAMESPACE}:`, '');
  const at = location === null ? undefined : { line: location.line, column: location.column + 1 };
  return problem(forbidden ? 'import-forbidden' : 'script-invalid', file, text, at);
}

const isBuildFailure = (error: unknown): error is Error & { errors: Message[] } =>
  error instanceof Error && Array.isArray(Reflect.get(error, 'errors'));

// Склейка своих файлов без сжатия: текст идёт в script-rewrite.ts, сжатие — после него.
async function bundle(files: SectionFiles, entry: string): Promise<Checked<Bundled>> {
  try {
    const result = await (
      await esbuildOf()
    ).build({
      entryPoints: [entry],
      plugins: [sectionPlugin(files)],
      outfile: 'section.js',
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      minify: false,
      write: false,
      metafile: true,
      // Без комментариев: script-rewrite.ts ищет «[» и «=» по тексту между узлами.
      legalComments: 'none',
      logLevel: 'silent',
    });
    const exports = Object.values(result.metafile.outputs).flatMap((output) => output.exports);
    return { ok: true, value: { code: result.outputFiles.map((file) => file.text).join(''), exports } };
  } catch (error) {
    if (!isBuildFailure(error)) throw error;
    return { ok: false, problems: error.errors.map(messageProblem) };
  }
}

// esbuild подписывает куски склейки «// merfy-section:<файл>»: по ним место переписанного текста возвращается в файл автора.
const FILE_MARK = `// ${NAMESPACE}:`;

function fileAt(text: string, offset: number, entry: string): string {
  const at = text.lastIndexOf(FILE_MARK, offset);
  if (at < 0) return entry;
  const end = text.indexOf('\n', at);
  return text.slice(at + FILE_MARK.length, end < 0 ? undefined : end).trim();
}

// Строка и колонка первого упоминания в исходнике автора: переписанный текст строк автора не хранит.
function mentionIn(
  source: string | undefined,
  needles: readonly string[],
): { line: number; column: number } | undefined {
  const lines = (source ?? '').split('\n');
  for (const needle of needles) {
    const index = lines.findIndex((line) => line.includes(needle));
    const line = lines[index];
    if (line !== undefined) return { line: index + 1, column: line.indexOf(needle) + 1 };
  }
  return undefined;
}

const LEFTOVER_TEXT: Readonly<Record<Leftover['kind'], (name: string) => string>> = {
  import: (name) =>
    `после переписывания в скрипте остался import «${name}» — на витрине он уронил бы все скрипты страницы; секция берёт из ${SHELL_MODULE} только defineSection и типы`,
  name: (name) =>
    `после переписывания в скрипте остался вызов или значение «${name}» из ${SHELL_MODULE} — на витрине это ReferenceError на всю страницу; defineSection бывает только в export default defineSection({ … })`,
  syntax: (name) => `после переписывания скрипт не разбирается: ${name}`,
};

// Остаток переписывания → отказ при приёме: файл автора и место, а не ошибка в консоли витрины.
function leftoverProblem(files: SectionFiles, text: string, entry: string, item: Leftover): SectionProblem {
  const file = fileAt(text, item.offset, entry);
  const needles =
    item.kind === 'import' ? [item.name] : [item.name, item.name.replace(/\d+$/, ''), 'defineSection', 'defineStore'];
  const at = item.kind === 'syntax' ? undefined : mentionIn(files[file], needles);
  return problem('script-invalid', file, LEFTOVER_TEXT[item.kind](item.name), at);
}

async function finish(files: SectionFiles, entry: string, code: string): Promise<Checked<string>> {
  const options = {
    loader: 'js',
    format: 'esm',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    logLevel: 'silent',
  } as const;
  const { text, leftovers } = rewriteChecked(code);
  if (leftovers.length > 0)
    return { ok: false, problems: leftovers.map((item) => leftoverProblem(files, text, entry, item)) };
  return { ok: true, value: (await (await esbuildOf()).transform(text, options)).code };
}

function weightProblems(
  entry: string,
  exports: readonly string[],
  brotliBytes: number,
  define: string | null,
): SectionProblem[] {
  const { warnBytes, maxBytes } = SCRIPT_LIMITS;
  // У стора (свои сторы) — про defineStore.
  const noDefault =
    define === DEFINE_STORE
      ? 'нет export default: стору нужен export default defineStore({ value, start })'
      : 'нет export default: секции нужен export default defineSection({ mount })';
  return [
    ...when(!exports.includes('default'), () => problem('script-invalid', entry, noDefault)),
    ...when(brotliBytes > maxBytes, () =>
      problem('script-too-heavy', entry, `скрипт весит ${brotliBytes} Б brotli, предел ${maxBytes} Б`),
    ),
    ...when(brotliBytes > warnBytes && brotliBytes <= maxBytes, () =>
      problem('script-heavy', entry, `скрипт весит ${brotliBytes} Б brotli — больше ${warnBytes} Б, страница тяжелее`),
    ),
  ];
}

// Проверка исходника и сборка: не разобрался файл — только его ошибка; остальные проблемы — разом. define — определение
// по виду из section.json (defineSection или у стора defineStore); null — вид не известен.
export async function buildScript(
  files: SectionFiles,
  entry: string,
  define: string | null = null,
): Promise<Checked<BuiltScript>> {
  const source = checkScriptSource(files, entry, define);
  if (!source.parsed) return { ok: false, problems: source.problems };
  const bundled = await bundle(files, entry);
  const early = [...source.problems, ...(bundled.ok ? [] : bundled.problems)];
  if (!bundled.ok || early.length > 0) return { ok: false, problems: early };
  const finished = await finish(files, entry, bundled.value.code);
  if (!finished.ok) return finished;
  const code = finished.value;
  const brotliBytes = brotliCompressSync(code).length;
  const problems = weightProblems(entry, bundled.value.exports, brotliBytes, define);
  if (problems.some((item) => !isWarning(item))) return { ok: false, problems };
  return { ok: true, value: { code, brotliBytes, warnings: problems, facts: source.facts } };
}
