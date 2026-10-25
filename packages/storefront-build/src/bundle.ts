import { brotliCompressSync } from 'node:zlib';
import { build, type BuildFailure, type Message, type OnResolveResult, type Plugin } from 'esbuild';
import { sha256 } from './canonical';
import type { BuildFile } from './client-files';
import { StorefrontBuildError } from './errors';

// Бандл страницы (design.md блока 5, раздел 3.10; 13г Д): ядро секций @merfy/shell/core и модули секций страницы —
// один ES-модуль, его собирает esbuild при сборке магазина. Код секций здесь не выполняется: esbuild только читает
// текст модулей. Аргументы сборки — строка bundleEntry: части ядра по списку, модули секций по sha256 и вызов
// start({ parts, sections }) — договор с ядром части 5а (SectionEntry). Имя файла — sha256 содержимого: тот же набор
// секций и то же ядро — тот же файл на всех страницах магазина. До 4096 Б — прямо в HTML, как у Astro
// (build.assetsInlineLimit у Vite), если в тексте нет «</script» и «<!--»; иначе — файл _merfy/b/<sha256>.js.
export const BUNDLE_DIR = '_merfy/b';
export const BUNDLE_INLINE_MAX_BYTES = 4096;
// Бандл тяжелее — предупреждение page-script-heavy в журнале сборки (число — допущение плана, раздел 3.10).
export const PAGE_SCRIPT_WARN_BYTES = 100 * 1024;
const CORE_IMPORTS = new Set(['@merfy/shell', '@merfy/shell/core']);
// Спецификатор ядра в строке аргументов esbuild — в одинарных кавычках, как в сгенерированном модуле.
const CORE_SPECIFIER = "'@merfy/shell/core'";
const SECTION_IMPORT = 'merfy-section:';
const CORE_NAMESPACE = 'merfy-core';
const SECTION_NAMESPACE = 'merfy-section';
// Файлы dist/behaviors (блок 6, часть 6б): merfy-kit:<файл> — из строки входа, ./<файл> — из самих файлов (куски esbuild
// называются chunk-<ХЕШ>.js, хеш — прописные буквы и цифры). Имя поведения идёт в код как идентификатор — kebab-case.
const KIT_IMPORT = 'merfy-kit:';
const KIT_NAMESPACE = 'merfy-kit';
const KIT_FILE = /^[A-Za-z0-9_-]+\.js$/;
const KIT_NAME = /^[a-z][a-z-]*$/;
const SECTION_FILE = `${SECTION_NAMESPACE}:`;
const HEX64 = /^[0-9a-f]{64}$/;
const UNSAFE_INLINE = /<\/script|<!--/i;
const HASH_PREFIX = 'sha256:';
const ESBUILD_OPTIONS = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  logLevel: 'silent',
} as const;

// Строка списка секций бандла: имя, вид, sha256 модуля (64 знака hex) и модули SDK для ctx.
export interface BundleSection {
  name: string;
  kind: 'section' | 'global';
  script: string;
  uses: readonly string[];
}

export interface BundleSource {
  core: string; // текст dist/core.js
  parts: readonly string[]; // экспорты ядра — части страницы, по порядку
  sections: readonly BundleSection[];
  modules: ReadonlyMap<string, string>; // текст модуля секции по 64 знакам hex
  kit?: BundleKit; // поведения и анимации страницы (блок 6, часть 6б); нет — страница без них
  preview?: boolean; // бандл превью (блок 5, часть 5г): start получает preview: watchPreviewReplace
}

// Предупреждение сборки бандла — строка журнала сборщика; сборка идёт дальше.
export interface CodeNotice {
  code: 'section-script-skipped' | 'page-script-heavy';
  message: string;
  section: string | null;
  bytes: number | null;
}

export type CodeNoticed = (pageId: string, notice: CodeNotice) => void;

// tag — в <head> после стилей секций; file — null, если бандл встроен в HTML.
export interface PageBundle {
  tag: string;
  file: BuildFile | null;
  brotliBytes: number;
  notices: CodeNotice[];
}

// Аргументы esbuild — модуль из одной строки. Имена частей сверены схемой входов (partNameSchema): это имена
// экспортов ядра, они идут в код как есть; остальное — через JSON.stringify.
// Что из SDK поведений нужно странице (блок 6, часть 6б): имена поведений каталога, появления data-animate и провайдер
// для ctx.animate. Все три пусты — часть behaviors в бандл не идёт.
export interface KitPlan {
  behaviors: readonly string[];
  reveal: boolean;
  animate: boolean;
}

// Файлы dist/behaviors (имя файла → текст) и что из них нужно; собирает их тот же esbuild, что и бандл страницы.
export interface BundleKit {
  files: ReadonlyMap<string, string>;
  plan: KitPlan;
}

const exportOf = (name: string): string => name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
const kitSpecifier = (file: string): string => JSON.stringify(`${KIT_IMPORT}${file}`);

// Импорты поведений и выражение части behaviors для parts. Имя поведения идёт в код идентификатором, поэтому не kebab-case
// — bundle-failed до esbuild.
function kitEntry(kit: KitPlan): { imports: string; part: string } | null {
  if (kit.behaviors.length === 0 && !kit.reveal && !kit.animate) return null;
  const bad = kit.behaviors.find((name) => !KIT_NAME.test(name));
  if (bad !== undefined)
    throw new StorefrontBuildError('bundle-failed', `имя поведения ${JSON.stringify(bad)}: нужен kebab-case`);
  const lines = [`import { behaviors as kitBehaviors } from ${kitSpecifier('part.js')};`];
  const list = kit.behaviors.map((name, index) => {
    lines.push(`import { ${exportOf(name)} as kit${index} } from ${kitSpecifier(`${name}.js`)};`);
    return `kit${index}`;
  });
  const options = [`list: [${list.join(', ')}]`];
  if (kit.reveal) {
    lines.push(`import { reveal as kitReveal } from ${kitSpecifier('reveal.js')};`);
    options.push('reveal: kitReveal');
  }
  if (kit.animate) {
    lines.push(`import { animate as kitAnimate } from ${kitSpecifier('animate.js')};`);
    options.push('animate: kitAnimate');
  }
  return { imports: `${lines.join('\n')}\n`, part: `kitBehaviors({ ${options.join(', ')} })` };
}

// preview — бандл превью конструктора (часть 5г): ядро отдаёт watchPreviewReplace, start получает её в preview.
export function bundleEntry(
  parts: readonly string[],
  sections: readonly BundleSection[],
  kit?: KitPlan,
  preview = false,
): string {
  const imports = sections.map(
    (section, index) => `import s${index} from ${JSON.stringify(SECTION_IMPORT + section.script)};\n`,
  );
  const entries = sections.map(
    (section, index) =>
      `{ name: ${JSON.stringify(section.name)}, kind: ${JSON.stringify(section.kind)}, script: ${JSON.stringify(section.script)}, uses: ${JSON.stringify(section.uses)}, definition: s${index} }`,
  );
  const names = ['start', ...parts, ...(preview ? ['watchPreviewReplace'] : [])].join(', ');
  const tail = preview ? ', preview: watchPreviewReplace' : '';
  const kitCode = kit === undefined ? null : kitEntry(kit);
  const partList = [...parts, ...(kitCode === null ? [] : [kitCode.part])].join(', ');
  return `import { ${names} } from ${CORE_SPECIFIER};\n${kitCode?.imports ?? ''}${imports.join('')}start({ parts: [${partList}], sections: [${entries.join(', ')}]${tail} });\n`;
}

// Импорт в бандле страницы: @merfy/shell и @merfy/shell/core — ядро, merfy-section:<hex> — модуль секции; иначе —
// ошибка с местом в модуле, который импортирует.
// Файл поведений по импорту: merfy-kit:<файл> из строки входа, ./<файл> из файла поведений; иначе null.
function kitFileOf(path: string, importer: string): string | null {
  if (importer === KIT_NAMESPACE) return path.replace(/^\.\//, '');
  return path.startsWith(KIT_IMPORT) ? path.slice(KIT_IMPORT.length) : null;
}

// Из модуля секции в kit ходить нельзя; имя файла — только из списка знаков KIT_FILE. Остальное — ошибка с местом в
// модуле, который импортирует.
function kitImport(path: string, importer: string): OnResolveResult | null {
  const file = kitFileOf(path, importer);
  if (file === null) return null;
  if (importer !== SECTION_NAMESPACE && KIT_FILE.test(file)) return { path: file, namespace: KIT_NAMESPACE };
  return { errors: [{ text: `импорт ${path} в бандле страницы запрещён: можно только @merfy/shell` }] };
}

function resolveImport(path: string, importer: string): OnResolveResult {
  const kit = kitImport(path, importer);
  if (kit !== null) return kit;
  if (CORE_IMPORTS.has(path)) return { path: 'core', namespace: CORE_NAMESPACE };
  const hex = path.startsWith(SECTION_IMPORT) ? path.slice(SECTION_IMPORT.length) : '';
  if (HEX64.test(hex)) return { path: hex, namespace: SECTION_NAMESPACE };
  return { errors: [{ text: `импорт ${path} в бандле страницы запрещён: можно только @merfy/shell` }] };
}

const pagePlugin = (source: BundleSource): Plugin => ({
  name: 'merfy-page',
  setup(bundler) {
    bundler.onResolve({ filter: /.*/ }, (args) => resolveImport(args.path, args.namespace));
    bundler.onLoad({ filter: /.*/, namespace: CORE_NAMESPACE }, () => ({ contents: source.core, loader: 'js' }));
    bundler.onLoad({ filter: /.*/, namespace: KIT_NAMESPACE }, (args) => {
      const contents = source.kit?.files.get(args.path);
      return contents === undefined
        ? { errors: [{ text: `в dist/behaviors нет файла ${args.path}` }] }
        : { contents, loader: 'js' };
    });
    bundler.onLoad({ filter: /.*/, namespace: SECTION_NAMESPACE }, (args) => ({
      contents: source.modules.get(args.path) ?? '',
      loader: 'js',
    }));
  },
});

async function bundleText(source: BundleSource): Promise<string> {
  const result = await build({
    ...ESBUILD_OPTIONS,
    stdin: {
      contents: bundleEntry(source.parts, source.sections, source.kit?.plan, source.preview === true),
      loader: 'js',
      sourcefile: 'merfy-page.js',
    },
    plugins: [pagePlugin(source)],
  });
  return result.outputFiles.map((file) => file.text).join('');
}

const isBuildFailure = (error: unknown): error is BuildFailure =>
  error instanceof Error && Array.isArray(Reflect.get(error, 'errors'));

// Модуль секции, в котором esbuild нашёл ошибку: место ошибки — файл merfy-section:<hex>. Ошибка в другом месте
// (аргументы сборки, ядро) — пустая строка.
function scriptOf(message: Message): string {
  const file = message.location?.file ?? '';
  return file.startsWith(SECTION_FILE) ? file.slice(SECTION_FILE.length) : '';
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const bundleFailed = (error: unknown): StorefrontBuildError =>
  new StorefrontBuildError('bundle-failed', `бандл страницы не собран: ${errorText(error)}`, { cause: error });

function skippedNotice(section: BundleSection, errors: readonly Message[]): CodeNotice {
  const text = errors.find((message) => scriptOf(message) === section.script)?.text ?? '';
  const message = `скрипт секции ${section.name} пропущен в бандле страницы: ${text}`;
  return { code: 'section-script-skipped', message, section: section.name, bytes: null };
}

// Сборка с пропуском секций, на которых esbuild упал (старый модуль с part, чужой импорт): секция остаётся HTML без
// скрипта, бандл собирается заново без неё. Ошибка не в модуле секции этой страницы — bundle-failed: сборки нет,
// опубликованный сайт не меняется.
async function bundleSkipping(source: BundleSource, notices: CodeNotice[]): Promise<string> {
  try {
    return await bundleText(source);
  } catch (error) {
    const errors = isBuildFailure(error) ? error.errors : [];
    const scripts = new Set(errors.map(scriptOf));
    const skipped = source.sections.filter((section) => scripts.has(section.script));
    const known = errors.every((message) => skipped.some((section) => section.script === scriptOf(message)));
    if (skipped.length === 0 || !known) throw bundleFailed(error);
    notices.push(...skipped.map((section) => skippedNotice(section, errors)));
    const sections = source.sections.filter((section) => !scripts.has(section.script));
    return bundleSkipping({ ...source, sections }, notices);
  }
}

const heavyNotice = (bytes: number): CodeNotice => ({
  code: 'page-script-heavy',
  message: `бандл страницы — ${bytes} Б brotli, предупреждение — больше ${PAGE_SCRIPT_WARN_BYTES} Б`,
  section: null,
  bytes,
});

export async function bundlePage(source: BundleSource): Promise<PageBundle> {
  const notices: CodeNotice[] = [];
  const text = await bundleSkipping(source, notices);
  const content = Buffer.from(text, 'utf8');
  const brotliBytes = brotliCompressSync(content).length;
  if (brotliBytes > PAGE_SCRIPT_WARN_BYTES) notices.push(heavyNotice(brotliBytes));
  if (content.length <= BUNDLE_INLINE_MAX_BYTES && !UNSAFE_INLINE.test(text))
    return { tag: `<script type="module">${text}</script>`, file: null, brotliBytes, notices };
  const hex = sha256(content).slice(HASH_PREFIX.length);
  const path = `${BUNDLE_DIR}/${hex}.js`;
  // integrity — тот же sha256 в base64: по нему файл проходит политику CSP магазина со «своим кодом» ('strict-dynamic',
  // блок 13 «Секций и SDK», часть 13б), а браузер сверяет байты файла.
  const integrity = `sha256-${Buffer.from(hex, 'hex').toString('base64')}`;
  const tag = `<script type="module" src="/${path}" integrity="${integrity}"></script>`;
  return { tag, file: { path, content }, brotliBytes, notices };
}

// Текст бандла без тега и файла — для превью конструктора (часть 5г, preview-bundle.ts): тот же esbuild и тот же
// пропуск секций, на которых он упал.
export async function bundleScript(source: BundleSource): Promise<{ text: string; notices: CodeNotice[] }> {
  const notices: CodeNotice[] = [];
  const text = await bundleSkipping(source, notices);
  return { text, notices };
}
