import { z } from 'zod';
import type { Position } from './position';

// Отказы и предупреждения приёма секции (design.md блока 7, С7-16 А, п. 17, 18, 21). Один вид у всех авторов: код
// правила, файл, строка и колонка, текст по-русски — так ответ читают автор, ИИ и журнал. Предупреждение секцию не
// останавливает, отказ — да.
export const PROBLEM_CODES = [
  'manifest-missing',
  'manifest-invalid',
  'sdk-unsupported',
  'setting-invalid',
  'file-unknown',
  'file-too-large',
  'source-too-large',
  'kind-mismatch',
  'template-forbidden',
  'template-too-deep',
  'template-compile',
  'render-failed',
  'script-invalid',
  'import-forbidden',
  'script-heavy',
  'script-too-heavy',
  'build-timeout',
  'build-crashed',
  'release-changed',
  'block-select-unavailable',
] as const;
export type ProblemCode = (typeof PROBLEM_CODES)[number];

// block-select-unavailable — подпункт выбирается только слева (часть 3, Р57): секция сохраняется.
const WARNING_CODES: ReadonlySet<ProblemCode> = new Set(['script-heavy', 'block-select-unavailable']);

export const sectionProblemSchema = z.strictObject({
  code: z.enum(PROBLEM_CODES),
  file: z.string(),
  line: z.number().int().positive().nullable(),
  column: z.number().int().positive().nullable(),
  message: z.string().min(1),
});
export type SectionProblem = z.infer<typeof sectionProblemSchema>;

// Проверка: прошла или нет; не прошла — все найденные проблемы разом, чтобы автор чинил за один заход.
export type Checked<T> = { ok: true; value: T } | { ok: false; problems: SectionProblem[] };

export function problem(code: ProblemCode, file: string, message: string, at?: Position): SectionProblem {
  return { code, file, line: at?.line ?? null, column: at?.column ?? null, message };
}

// Проблема, если условие верно, — для таблиц проверок без if.
export const when = (condition: boolean, make: () => SectionProblem): SectionProblem[] => (condition ? [make()] : []);

export const isWarning = (item: SectionProblem): boolean => WARNING_CODES.has(item.code);

// «template.astro:3:5 — обработчик onclick: события — только в script.ts».
export function problemText(item: SectionProblem): string {
  const place = [item.file, item.line, item.column].filter((part) => part !== null && part !== '').join(':');
  return place === '' ? item.message : `${place} — ${item.message}`;
}
