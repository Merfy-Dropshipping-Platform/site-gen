import { z } from 'zod';
import { problem, when, type Checked, type SectionProblem } from './problems';

// Формат секции (design.md блока 7, п. 20) — один у всех авторов (С7-11 А): папка с section.json, template.html,
// styles.css и скриптом, если он есть (п. 16), — script.ts или script.js и его файлы .ts/.js. Поля настроек — по схеме
// блока 8 (п. 23); пока схема не утверждена, приём хранит их как есть — шов.
export const MANIFEST_FILE = 'section.json';
export const TEMPLATE_FILE = 'template.html';
export const STYLE_FILE = 'styles.css';
export const SCRIPT_ENTRIES = ['script.ts', 'script.js'] as const;
// Пределы исходника — допущение плана: число файлов, байты UTF-8 одного файла и всех вместе.
export const SOURCE_LIMITS = { files: 50, fileBytes: 64 * 1024, totalBytes: 256 * 1024 } as const;
// Имя секции без приставки и id темы или расширения: строчные латинские буквы и цифры через одиночный дефис. Полное
// имя «приставка:имя» проходит список модулей ядра (@merfy/shell, src/modules.ts).
export const SECTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCRIPT_PATH = /^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.(?:ts|js)$/;
const FIXED_FILES: ReadonlySet<string> = new Set([MANIFEST_FILE, TEMPLATE_FILE, STYLE_FILE]);
const JSON_PLACE = /line (\d+) column (\d+)/;

export const sectionIdSchema = z
  .string()
  .regex(SECTION_ID, { error: 'нужны строчные латинские буквы и цифры через одиночный дефис' });
export const SECTION_KINDS = ['section', 'global'] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const sectionManifestSchema = z.strictObject({
  v: z.literal(1),
  name: sectionIdSchema,
  kind: z.enum(SECTION_KINDS),
  title: z.string().min(1).max(80),
  fields: z.array(z.json()).default([]),
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

const FILE_CHECKS: readonly FilesCheck[] = [
  (files) =>
    when(Object.keys(files).length > SOURCE_LIMITS.files, () =>
      problem('source-too-large', '', `файлов ${Object.keys(files).length}, предел ${SOURCE_LIMITS.files}`),
    ),
  (files) =>
    when(totalBytes(files) > SOURCE_LIMITS.totalBytes, () =>
      problem('source-too-large', '', `исходник ${totalBytes(files)} Б, предел ${SOURCE_LIMITS.totalBytes} Б`),
    ),
  (files) =>
    Object.keys(files)
      .filter((path) => !isKnownFile(path))
      .map((path) =>
        problem('file-unknown', path, 'в формате секции: section.json, template.html, styles.css, .ts/.js'),
      ),
  (files) =>
    Object.entries(files)
      .filter(([, text]) => bytesOf(text) > SOURCE_LIMITS.fileBytes)
      .map(([path]) => problem('file-too-large', path, `файл больше ${SOURCE_LIMITS.fileBytes} Б`)),
  (files) =>
    when(
      SCRIPT_ENTRIES.every((entry) => has(files, entry)),
      () => problem('script-invalid', 'script.js', 'вход скрипта один: script.ts или script.js'),
    ),
];

export const fileProblems = (files: SectionFiles): SectionProblem[] => FILE_CHECKS.flatMap((check) => check(files));

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

export function readManifest(files: SectionFiles): Checked<SectionManifest> {
  const text = files[MANIFEST_FILE];
  if (text === undefined)
    return { ok: false, problems: [problem('manifest-missing', MANIFEST_FILE, 'нет section.json')] };
  const json = parseJson(text);
  if (!json.ok) return json;
  const parsed = sectionManifestSchema.safeParse(json.value, RUSSIAN_ERRORS);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, problems: parsed.error.issues.map(issueProblem) };
}

// Секция — с шаблоном; глобальный скрипт (С7-21 А) — секция без места: без шаблона и стилей, со скриптом.
interface KindRule {
  broken: (files: SectionFiles) => boolean;
  file: string;
  message: string;
}

const KIND_RULES: Record<SectionKind, readonly KindRule[]> = {
  section: [
    { broken: (files) => !has(files, TEMPLATE_FILE), file: TEMPLATE_FILE, message: 'у секции нужен template.html' },
  ],
  global: [
    {
      broken: (files) => has(files, TEMPLATE_FILE),
      file: TEMPLATE_FILE,
      message: 'у глобального скрипта нет места на странице: template.html не нужен',
    },
    {
      broken: (files) => has(files, STYLE_FILE),
      file: STYLE_FILE,
      message: 'у глобального скрипта нет разметки: styles.css не нужен',
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
