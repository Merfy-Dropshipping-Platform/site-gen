import { z } from 'zod';
import { blockFormatProblems } from './blocks';
import { sectionFieldShape } from './fields';
import { problem, when, type Checked, type SectionProblem } from './problems';
import { settingsTexts } from './settings';

// Формат секции SDK 1 (блок 1 «Секций и SDK»; design.md блока 7, п. 20) — один у всех авторов (С7-11 А): папка с
// section.json, template.astro и скриптом, если он есть (п. 16), — script.ts или script.js и его файлы .ts/.js. Своего
// CSS у секции нет: классы Tailwind из словаря темы (7 Г). Поля настроек — settings: поле настройки блока 8
// (settingFieldShape из @merfy/tokens) или richtext (fields.ts, часть 3). Блоки — blocks и defaultBlocks (часть 3).
export const MANIFEST_FILE = 'section.json';
export const TEMPLATE_FILE = 'template.astro';
export const SECTION_SDK = 1;
export const SCRIPT_ENTRIES = ['script.ts', 'script.js'] as const;
// Пределы исходника — допущение плана: число файлов, байты UTF-8 одного файла и всех вместе.
export const SOURCE_LIMITS = { files: 50, fileBytes: 64 * 1024, totalBytes: 256 * 1024 } as const;
// Имя секции без приставки и id темы или расширения: строчные латинские буквы и цифры через одиночный дефис. Полное
// имя «приставка:имя» проходит список модулей ядра (@merfy/shell, src/modules.ts).
export const SECTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCRIPT_PATH = /^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.(?:ts|js)$/;
const FIXED_FILES: ReadonlySet<string> = new Set([MANIFEST_FILE, TEMPLATE_FILE]);
// Файлы формата блока 7 — отказ с подсказкой, что теперь вместо них.
const OLD_FILES: ReadonlyMap<string, string> = new Map([
  ['template.html', 'шаблон теперь template.astro'],
  ['styles.css', 'своего CSS у секции нет: классы Tailwind из словаря (7 Г)'],
]);
const UNKNOWN_FILE = 'в формате секции: section.json, template.astro, .ts/.js';
const JSON_PLACE = /line (\d+) column (\d+)/;

export const sectionIdSchema = z
  .string()
  .regex(SECTION_ID, { error: 'нужны строчные латинские буквы и цифры через одиночный дефис' });
export const SECTION_KINDS = ['section', 'global'] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

// Тип блока секции (часть 3, design.md 3.16, Р53): подпись в конструкторе, сколько блоков типа в секции, поля. Имя типа
// и значения блоков по умолчанию проверяет blocks.ts.
const blockTypeSchema = z.strictObject({
  title: z.string().min(1).max(80),
  limit: z.int().min(1).max(50),
  settings: z.array(sectionFieldShape).default([]),
});
const defaultBlockSchema = z.strictObject({
  type: z.string(),
  settings: z.record(z.string(), z.unknown()).default({}),
});

// Место секции и что шаблон читает (часть 4, design.md 3.21–3.22, Р1-4-2): groups — группы страницы, куда секцию можно
// поставить (нет ключа — только страницы, ['page']); limit — сколько экземпляров в одном списке (шапка, подвал или
// страница; скрытые считаются); removable: false — секцию нельзя удалить, её ошибка рендера — ошибка сборки; uses —
// что шаблон читает сверх settings и blocks: theme — настройки темы, shop — публичные данные магазина; newPage — id
// настройки вида string: секция ставится на новую страницу, в эту настройку пишется имя страницы.
export const SECTION_GROUPS = ['header', 'page', 'footer'] as const;
export type SectionGroup = (typeof SECTION_GROUPS)[number];
export const SECTION_USES = ['theme', 'shop'] as const;
export type SectionUse = (typeof SECTION_USES)[number];
const unique = (list: readonly string[]): boolean => new Set(list).size === list.length;

export const sectionManifestSchema = z.strictObject({
  // путь к generated/section.schema.json для редактора (блок 3 «Секций и SDK», Р3.12); проверка его не читает
  $schema: z.string().optional(),
  sdk: z.literal(SECTION_SDK),
  name: sectionIdSchema,
  kind: z.enum(SECTION_KINDS),
  title: z.string().min(1).max(80),
  settings: z.array(sectionFieldShape).default([]),
  blocks: z.record(z.string(), blockTypeSchema).optional(),
  defaultBlocks: z.array(defaultBlockSchema).max(50).optional(),
  groups: z.array(z.enum(SECTION_GROUPS)).min(1).max(3).refine(unique, { error: 'группа дважды' }).optional(),
  limit: z.int().min(1).max(50).optional(),
  removable: z.literal(false).optional(),
  uses: z.array(z.enum(SECTION_USES)).max(2).refine(unique, { error: 'значение дважды' }).optional(),
  newPage: z.string().min(1).optional(),
  // Свои токены секции (блок 4 «Секций и SDK», Р4-9): запись словаря; проверяет token-rules.ts.
  tokens: z.record(z.string(), z.unknown()).optional(),
});
export type SectionManifest = z.infer<typeof sectionManifestSchema>;
export type SectionFiles = Readonly<Record<string, string>>;

const RUSSIAN_ERRORS = { error: z.locales.ru().localeError };
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
const has = (files: SectionFiles, path: string): boolean => Object.hasOwn(files, path);
const isKnownFile = (path: string): boolean => FIXED_FILES.has(path) || SCRIPT_PATH.test(path);
const totalBytes = (files: SectionFiles): number => Object.values(files).reduce((sum, text) => sum + bytesOf(text), 0);

export const scriptEntryOf = (files: SectionFiles): string | null =>
  SCRIPT_ENTRIES.find((entry) => has(files, entry)) ?? null;

type FilesCheck = (files: SectionFiles) => SectionProblem[];

// Пределы исходника — первыми и отдельно: больше пределов файлы не разбираем (prepare.ts).
const LIMIT_CHECKS: readonly FilesCheck[] = [
  (files) =>
    when(Object.keys(files).length > SOURCE_LIMITS.files, () =>
      problem('source-too-large', '', `файлов ${Object.keys(files).length}, предел ${SOURCE_LIMITS.files}`),
    ),
  (files) =>
    when(totalBytes(files) > SOURCE_LIMITS.totalBytes, () =>
      problem('source-too-large', '', `исходник ${totalBytes(files)} Б, предел ${SOURCE_LIMITS.totalBytes} Б`),
    ),
  (files) =>
    Object.entries(files)
      .filter(([, text]) => bytesOf(text) > SOURCE_LIMITS.fileBytes)
      .map(([path]) => problem('file-too-large', path, `файл больше ${SOURCE_LIMITS.fileBytes} Б`)),
];

const FILE_CHECKS: readonly FilesCheck[] = [
  (files) =>
    Object.keys(files)
      .filter((path) => !isKnownFile(path))
      .map((path) => problem('file-unknown', path, OLD_FILES.get(path) ?? UNKNOWN_FILE)),
  (files) =>
    when(
      SCRIPT_ENTRIES.every((entry) => has(files, entry)),
      () => problem('script-invalid', 'script.js', 'вход скрипта один: script.ts или script.js'),
    ),
];

export const limitProblems = (files: SectionFiles): SectionProblem[] => LIMIT_CHECKS.flatMap((check) => check(files));

export const fileProblems = (files: SectionFiles): SectionProblem[] => [
  ...limitProblems(files),
  ...FILE_CHECKS.flatMap((check) => check(files)),
];

function jsonProblem(error: unknown): SectionProblem {
  const message = error instanceof Error ? error.message : String(error);
  const place = JSON_PLACE.exec(message);
  const at = place === null ? undefined : { line: Number(place[1]), column: Number(place[2]) };
  return problem('manifest-invalid', MANIFEST_FILE, `не JSON: ${message}`, at);
}

function parseJson(text: string): Checked<unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, problems: [jsonProblem(error)] };
  }
}

const issueProblem = (issue: z.core.$ZodIssue): SectionProblem =>
  problem('manifest-invalid', MANIFEST_FILE, `${issue.path.map(String).join('.') || '(весь файл)'}: ${issue.message}`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Ключи формата блока 7 — с подсказкой нового имени, а не «лишний ключ».
const RENAMED_KEYS: ReadonlyMap<string, string> = new Map([
  ['v', 'теперь "sdk": 1'],
  ['fields', 'теперь settings'],
]);

function oldKeyProblems(value: unknown): SectionProblem[] {
  if (!isRecord(value)) return [];
  return [...RENAMED_KEYS]
    .filter(([key]) => Object.hasOwn(value, key))
    .map(([key, hint]) => problem('manifest-invalid', MANIFEST_FILE, `ключ ${key}: ${hint}`));
}

function sdkProblems(value: unknown): SectionProblem[] {
  if (!isRecord(value) || !Object.hasOwn(value, 'sdk') || value.sdk === SECTION_SDK) return [];
  const text = `версия SDK ${JSON.stringify(value.sdk)} не поддерживается, поддерживается только ${SECTION_SDK}`;
  return [problem('sdk-unsupported', MANIFEST_FILE, text)];
}

export function readManifest(files: SectionFiles): Checked<SectionManifest> {
  const text = files[MANIFEST_FILE];
  if (text === undefined)
    return { ok: false, problems: [problem('manifest-missing', MANIFEST_FILE, 'нет section.json')] };
  const json = parseJson(text);
  if (!json.ok) return json;
  const early = [...oldKeyProblems(json.value), ...sdkProblems(json.value)];
  if (early.length > 0) return { ok: false, problems: early };
  const parsed = sectionManifestSchema.safeParse(json.value, RUSSIAN_ERRORS);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map(issueProblem) };
  const blocks = blockFormatProblems(parsed.data);
  const problems = [
    ...settingsTexts(parsed.data.settings).map((message) => problem('setting-invalid', MANIFEST_FILE, message)),
    ...blocks.structure.map((message) => problem('manifest-invalid', MANIFEST_FILE, message)),
    ...blocks.settings.map((message) => problem('setting-invalid', MANIFEST_FILE, message)),
    ...placeProblems(parsed.data).map((message) => problem('manifest-invalid', MANIFEST_FILE, message)),
    ...blockMenuProblems(parsed.data).map((message) => problem('setting-invalid', MANIFEST_FILE, message)),
  ];
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: parsed.data };
}

// Секция — с шаблоном; глобальный скрипт (С7-21 А) — секция без места: без шаблона, со скриптом.
interface KindRule {
  broken: (files: SectionFiles) => boolean;
  file: string;
  message: string;
}

const KIND_RULES: Record<SectionKind, readonly KindRule[]> = {
  section: [
    { broken: (files) => !has(files, TEMPLATE_FILE), file: TEMPLATE_FILE, message: 'у секции нужен template.astro' },
  ],
  global: [
    {
      broken: (files) => has(files, TEMPLATE_FILE),
      file: TEMPLATE_FILE,
      message: 'у глобального скрипта нет места на странице: template.astro не нужен',
    },
    {
      broken: (files) => scriptEntryOf(files) === null,
      file: 'script.ts',
      message: 'у глобального скрипта нужен script.ts или script.js',
    },
  ],
};

export const kindProblems = (manifest: SectionManifest, files: SectionFiles): SectionProblem[] =>
  KIND_RULES[manifest.kind]
    .filter((rule) => rule.broken(files))
    .map((rule) => problem('kind-mismatch', rule.file, rule.message));

// Группы секции (часть 4, Р1-4-2): нет ключа groups — только страницы.
export const sectionGroupsOf = (manifest: SectionManifest): readonly SectionGroup[] => manifest.groups ?? ['page'];

const PLACE_KEYS = ['groups', 'limit', 'removable', 'uses', 'newPage'] as const;

// newPage — настройка вида string секции, которую ставят на страницу.
function newPageProblems(manifest: SectionManifest): string[] {
  const id = manifest.newPage;
  if (id === undefined) return [];
  const field = manifest.settings.find((item) => item.id === id);
  if (field === undefined || field.setting.kind !== 'string')
    return [`newPage: нужна настройка вида string, ${id} — не она`];
  return sectionGroupsOf(manifest).includes('page') ? [] : ['newPage: секция ставится на страницу — нужна группа page'];
}

// У глобального скрипта места на странице нет — ключи места ему не нужны.
function placeProblems(manifest: SectionManifest): string[] {
  if (manifest.kind === 'global')
    return PLACE_KEYS.filter((key) => manifest[key] !== undefined).map(
      (key) => `${key}: у глобального скрипта нет места на странице`,
    );
  return newPageProblems(manifest);
}

// Вид menu — только у настроек секции: меню блока конструктор не правит (окно меню — у поля секции).
const blockMenuProblems = (manifest: SectionManifest): string[] =>
  Object.entries(manifest.blocks ?? {}).flatMap(([type, block]) =>
    block.settings.flatMap((field, index) =>
      field.setting.kind === 'menu' ? [`blocks.${type}.settings.${index}: вид menu — только у настроек секции`] : [],
    ),
  );
