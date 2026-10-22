import { z } from 'zod';
import {
  TEMPLATE_FILE,
  fileProblems,
  limitProblems,
  kindProblems,
  readManifest,
  scriptEntryOf,
  sectionIdSchema,
  sectionManifestSchema,
} from './format';
import { isWarning, sectionProblemSchema, type Checked, type SectionProblem } from './problems';
import { buildScript } from './script';
import { NO_TEMPLATE_OPTIONS, checkTemplate, templateOptionsOf } from './compile';

// Одна функция приёма (design.md блока 7, С7-11 А, п. 21): разбор section.json, проверка, сборка — одинаково для
// платформы, темы, своей секции и расширения. Автора функция не знает: приставку имени даёт дверь (п. 22), запись в
// реестр — accept.ts. Базы и сети здесь нет: функция идёт в отдельном процессе с пределами (sandbox.ts), поэтому вход и
// ответ — схемы zod: они переходят границу процесса строкой JSON. Пробного рендера здесь нет: модуль шаблона рендерит
// процесс рендера после этой функции (sandbox.ts, trial.ts; блок 2 «Секций и SDK», «Решил сам» п. 5).
export const prepareInputSchema = z.strictObject({
  prefix: sectionIdSchema,
  files: z.record(z.string(), z.string()),
});
export type PrepareInput = z.infer<typeof prepareInputSchema>;

export const preparedSectionSchema = z.strictObject({
  name: z.string(),
  manifest: sectionManifestSchema,
  template: z.string(),
  render: z.string().nullable(),
  script: z.string().nullable(),
  warnings: z.array(sectionProblemSchema),
});
export type PreparedSection = z.infer<typeof preparedSectionSchema>;

export const prepareResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), section: preparedSectionSchema }),
  z.strictObject({ ok: z.literal(false), problems: z.array(sectionProblemSchema).min(1) }),
]);
export type PrepareResult = z.infer<typeof prepareResultSchema>;

const refuse = (problems: SectionProblem[]): PrepareResult => ({ ok: false, problems });

function problemsOf(checked: Checked<{ warnings: SectionProblem[] }> | null): SectionProblem[] {
  if (checked === null) return [];
  return checked.ok ? checked.value.warnings : checked.problems;
}

export async function prepareSection(input: PrepareInput): Promise<PrepareResult> {
  const { files } = input;
  // Больше пределов — сразу отказ: такие файлы не разбираем. Дальше проблемы собираются все разом.
  const limits = limitProblems(files);
  if (limits.length > 0) return refuse(limits);
  const manifest = readManifest(files);
  const template = files[TEMPLATE_FILE];
  const entry = scriptEntryOf(files);
  const [checked, script] = await Promise.all([
    template === undefined
      ? null
      : checkTemplate(template, manifest.ok ? templateOptionsOf(manifest.value) : NO_TEMPLATE_OPTIONS),
    entry === null ? null : buildScript(files, entry),
  ]);
  const problems = [
    ...fileProblems(files),
    ...(manifest.ok ? kindProblems(manifest.value, files) : manifest.problems),
    ...(checked?.problems ?? []),
    ...problemsOf(script),
  ];
  if (!manifest.ok || problems.some((item) => !isWarning(item))) return refuse(problems);
  const name = `${input.prefix}:${manifest.value.name}`;
  const code = script !== null && script.ok ? script.value.code : null;
  const render = checked?.render ?? null;
  return {
    ok: true,
    section: { name, manifest: manifest.value, template: template ?? '', render, script: code, warnings: problems },
  };
}
