import { z } from 'zod';
// tailwind-system напрямую, не вход пакета: процесс проверки не тянет esbuild из bundle.ts (5б).
import { classSystem } from '@merfy/storefront-build/tailwind-system';
import { platformDictionary, sectionTailwindTheme } from '@merfy/tokens';
import { classProblems, type ClassField, type ClassFields } from './classes';
import { settingFieldsOf } from './fields';
import { fieldRuleProblems } from './field-rules';
import type { SectionField } from './fields';
import {
  MANIFEST_FILE,
  TEMPLATE_FILE,
  fileProblems,
  limitProblems,
  kindProblems,
  readManifest,
  scriptEntryOf,
  sectionIdSchema,
  sectionManifestSchema,
  type SectionFiles,
  type SectionManifest,
} from './format';
import { isWarning, sectionProblemSchema, type Checked, type SectionProblem } from './problems';
import { buildScript } from './script';
import { sectionTokensOf, tokenProblems } from './token-rules';
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

// Проблемы section.json: разбор, вид секции и файлы, правила полей (блок 3 «Секций и SDK») — когда файл разобран.
function manifestProblems(manifest: Checked<SectionManifest>, files: SectionFiles): SectionProblem[] {
  if (!manifest.ok) return manifest.problems;
  return [...kindProblems(manifest.value, files), ...fieldRuleProblems(manifest.value, files[MANIFEST_FILE] ?? '')];
}

function problemsOf(checked: Checked<{ warnings: SectionProblem[] }> | null): SectionProblem[] {
  if (checked === null) return [];
  return checked.ok ? checked.value.warnings : checked.problems;
}

// Поля для подстановки значений в классах (Р4-6, Р1-5-10): настройки секции и поля всех типов блоков подряд.
// select и radio несут варианты, range — min, max и step: конечные наборы значений для подстановки.
function classFieldsOf(manifest: SectionManifest): ClassFields {
  const toClassField = (field: SectionField): ClassField => {
    const base = { id: field.id, label: field.label };
    if (field.setting.kind === 'select' || field.setting.kind === 'radio')
      return { ...base, setting: { kind: field.setting.kind, options: field.setting.options } };
    if (field.setting.kind === 'range')
      return {
        ...base,
        setting: { kind: field.setting.kind, min: field.setting.min, max: field.setting.max, step: field.setting.step },
      };
    return { ...base, setting: { kind: field.setting.kind } };
  };
  const blockFields = Object.values(manifest.blocks ?? {}).flatMap((type) => type.settings.map(toClassField));
  return { settings: settingFieldsOf(manifest.settings).map(toClassField), blocks: blockFields };
}

// Шаг «Классы» и токены секции (блок 4 «Секций и SDK», Р4-2): когда section.json прочитан и шаблон есть.
async function styleProblems(
  manifest: SectionManifest,
  files: SectionFiles,
  template: string,
): Promise<SectionProblem[]> {
  const tokens = sectionTokensOf(manifest);
  const system = await classSystem(platformDictionary, sectionTailwindTheme(tokens));
  const classes = await classProblems(template, classFieldsOf(manifest), system, platformDictionary);
  return [...tokenProblems(manifest, files[MANIFEST_FILE] ?? ''), ...classes];
}

export async function prepareSection(input: PrepareInput): Promise<PrepareResult> {
  const { files } = input;
  // Больше пределов — сразу отказ: такие файлы не разбираем. Дальше проблемы собираются все разом.
  const limits = limitProblems(files);
  if (limits.length > 0) return refuse(limits);
  const manifest = readManifest(files);
  const template = files[TEMPLATE_FILE];
  const entry = scriptEntryOf(files);
  const [checked, script, styles] = await Promise.all([
    template === undefined
      ? null
      : checkTemplate(template, manifest.ok ? templateOptionsOf(manifest.value) : NO_TEMPLATE_OPTIONS),
    entry === null ? null : buildScript(files, entry),
    manifest.ok && template !== undefined ? styleProblems(manifest.value, files, template) : [],
  ]);
  const problems = [
    ...fileProblems(files),
    ...manifestProblems(manifest, files),
    ...(checked?.problems ?? []),
    ...problemsOf(script),
    ...styles,
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
