import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import type * as EsbuildApi from 'esbuild-wasm';
import type { Message, OnResolveArgs, OnResolveResult, Plugin } from 'esbuild-wasm';
import type { SectionFiles } from './format';
import { isWarning, problem, when, type Checked, type SectionProblem } from './problems';

// Скрипт секции (design.md блока 7, С7-11 А, п. 12, 18, 20) — одна сборка esbuild для всех авторов. Импорт — только
// @merfy/shell (внешний: копия SDK на странице одна, её подставляет import map) и свои файлы .ts/.js, в том числе через
// import(); любой другой пакет и require — отказ import-forbidden. Нужен export default — определение секции для ядра.
// Вес — brotli: больше 10 КБ — предупреждение (п. 18), больше 50 КБ — отказ (жёсткий предел — допущение плана).
export const SHELL_MODULE = '@merfy/shell';
export const SCRIPT_LIMITS = { warnBytes: 10 * 1024, maxBytes: 50 * 1024 } as const;
const NAMESPACE = 'merfy-section';
const FORBIDDEN_MARK = 'import-forbidden: ';
const RELATIVE = /^\.\.?\//;

// esbuild — сборка для браузера из esbuild-wasm (блок 2 «Секций и SDK», «Решил сам» п. 5): обычный esbuild и основной
// модуль esbuild-wasm запускают дочерний процесс, а у процесса проверки дочерних процессов нет. Сборке для браузера нужен
// глобальный self; модуль WebAssembly компилируется один раз на процесс, worker: false — без потоков.
type Esbuild = Pick<typeof EsbuildApi, 'build' | 'initialize'>;
let esbuild: Promise<Esbuild> | null = null;

const isEsbuild = (value: unknown): value is Esbuild =>
  typeof Reflect.get(Object(value), 'build') === 'function' &&
  typeof Reflect.get(Object(value), 'initialize') === 'function';

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
      minify: true,
      write: false,
      metafile: true,
      logLevel: 'silent',
    });
    const exports = Object.values(result.metafile.outputs).flatMap((output) => output.exports);
    return { ok: true, value: { code: result.outputFiles.map((file) => file.text).join(''), exports } };
  } catch (error) {
    if (!isBuildFailure(error)) throw error;
    return { ok: false, problems: error.errors.map(messageProblem) };
  }
}

export async function buildScript(files: SectionFiles, entry: string): Promise<Checked<BuiltScript>> {
  const bundled = await bundle(files, entry);
  if (!bundled.ok) return bundled;
  const { code, exports } = bundled.value;
  const brotliBytes = brotliCompressSync(code).length;
  const { warnBytes, maxBytes } = SCRIPT_LIMITS;
  const problems = [
    ...when(!exports.includes('default'), () =>
      problem('script-invalid', entry, 'нет export default: секции нужен export default defineSection({ mount })'),
    ),
    ...when(brotliBytes > maxBytes, () =>
      problem('script-too-heavy', entry, `скрипт весит ${brotliBytes} Б brotli, предел ${maxBytes} Б`),
    ),
    ...when(brotliBytes > warnBytes && brotliBytes <= maxBytes, () =>
      problem('script-heavy', entry, `скрипт весит ${brotliBytes} Б brotli — больше ${warnBytes} Б, страница тяжелее`),
    ),
  ];
  if (problems.some((item) => !isWarning(item))) return { ok: false, problems };
  return { ok: true, value: { code, brotliBytes, warnings: problems } };
}
