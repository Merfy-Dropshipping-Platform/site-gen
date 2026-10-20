import { z } from 'zod';
import {
  TEMPLATE_FILE,
  fileProblems,
  kindProblems,
  readManifest,
  scriptEntryOf,
  sectionIdSchema,
  sectionManifestSchema,
} from './format';
import { isWarning, sectionProblemSchema, type Checked, type SectionProblem } from './problems';
import { buildScript } from './script';
import { templateProblems } from './template';

// Одна функция приёма (design.md блока 7, С7-11 А, п. 21): разбор section.json, проверка, сборка — одинаково для
// платформы, темы, своей секции и расширения. Автора функция не знает: приставку имени даёт дверь (п. 22), запись в
// реестр — accept.ts. Базы и сети здесь нет: функция идёт в отдельном процессе с пределами (sandbox.ts), поэтому вход и
// ответ — схемы zod: они переходят границу процесса строкой JSON.
export const prepareInputSchema = z.strictObject({
  prefix: sectionIdSchema,
  files: z.record(z.string(), z.string()),
});
export type PrepareInput = z.infer<typeof prepareInputSchema>;

export const preparedSectionSchema = z.strictObject({
  name: z.string(),
  manifest: sectionManifestSchema,
  template: z.string(),
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
  const early = fileProblems(files);
  if (early.length > 0) return refuse(early);
  const manifest = readManifest(files);
  if (!manifest.ok) return refuse(manifest.problems);
  const kind = kindProblems(manifest.value, files);
  if (kind.length > 0) return refuse(kind);
  const name = `${input.prefix}:${manifest.value.name}`;
  const template = files[TEMPLATE_FILE] ?? '';
  const entry = scriptEntryOf(files);
  const script = entry === null ? null : await buildScript(files, entry);
  const problems = [...templateProblems(template), ...problemsOf(script)];
  if (problems.some((item) => !isWarning(item))) return refuse(problems);
  const code = script !== null && script.ok ? script.value.code : null;
  return { ok: true, section: { name, manifest: manifest.value, template, script: code, warnings: problems } };
}
