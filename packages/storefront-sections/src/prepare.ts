import { z } from 'zod';
// tailwind-system напрямую, не вход пакета: процесс проверки не тянет esbuild из bundle.ts (5б).
import { classSystem } from '@merfy/storefront-build/tailwind-system';
import { platformDictionary, sectionTailwindTheme } from '@merfy/tokens';
import { classProblems, type ClassField, type ClassFields } from './classes';
import { settingFieldsOf } from './fields';
import { fieldRuleProblems } from './field-rules';
import { dataProblems } from './section-data';
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
import { authorProblems } from './author-rules';
import { isWarning, sectionProblemSchema, type Checked, type SectionProblem } from './problems';
import { buildScript, type BuiltScript } from './script';
import { NO_FACTS, type ScriptFacts } from './script-facts';
import { scriptMetaOf, scriptMetaSchema } from './script-meta';
import { nameProblems } from './script-names';
import { NO_MARKUP } from './template-markup';
import { tasteProblems } from './taste-check';
import { sectionTokensOf, tokenProblems } from './token-rules';
import { NO_TEMPLATE_OPTIONS, checkTemplate, templateOptionsOf, type TemplateCheck } from './compile';

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
  // Что нужно скрипту секции (часть 5в блока 5, Р5в-7): модули SDK, части бандла, классы скрипта. План 2 пишет его
  // в storefront_section.script_meta.
  scriptMeta: scriptMetaSchema,
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
  // data секции (часть 8г блока 8): поля с записью и публичные поля.
  const text = files[MANIFEST_FILE] ?? '';
  return [
    ...kindProblems(manifest.value, files),
    ...fieldRuleProblems(manifest.value, text),
    ...dataProblems(manifest.value, text),
  ];
}

// Факты скрипта для сверки имён: секции без скрипта — null; скрипт не собрался — ключи actions не известны (NO_FACTS),
// свои действия шаблона не сверяются: отказ скрипта уже в списке.
function factsOf(script: Checked<BuiltScript> | null): ScriptFacts | null {
  if (script === null) return null;
  return script.ok ? script.value.facts : NO_FACTS;
}

// Сверка имён (часть 5в блока 5) — когда section.json прочитан.
function namesOf(
  manifest: Checked<SectionManifest>,
  checked: TemplateCheck | null,
  script: Checked<BuiltScript> | null,
  scriptEntry: string | null,
): SectionProblem[] {
  if (!manifest.ok) return [];
  const markup = checked?.markup ?? NO_MARKUP;
  return nameProblems({ manifest: manifest.value, markup, facts: factsOf(script), scriptEntry });
}

interface Checks {
  template: string | undefined;
  checked: TemplateCheck | null;
  script: Checked<BuiltScript> | null;
  warnings: SectionProblem[];
}

// Принятая секция: шаблон как есть, модули рендера и скрипта, предупреждения и script_meta (часть 5в блока 5).
function preparedOf(name: string, manifest: SectionManifest, checks: Checks): PreparedSection {
  const { template, checked, script, warnings } = checks;
  return {
    name,
    manifest,
    template: template ?? '',
    render: checked?.render ?? null,
    script: script !== null && script.ok ? script.value.code : null,
    warnings,
    scriptMeta: scriptMetaOf(manifest, checked?.markup ?? NO_MARKUP, factsOf(script)),
  };
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
  const [checked, script, styles, taste] = await Promise.all([
    template === undefined
      ? null
      : checkTemplate(template, manifest.ok ? templateOptionsOf(manifest.value) : NO_TEMPLATE_OPTIONS),
    entry === null ? null : buildScript(files, entry),
    manifest.ok && template !== undefined ? styleProblems(manifest.value, files, template) : [],
    // Предупреждения вкуса: кнопки от 44 px, прокрутка вбок, «уменьшить движение» (taste-check.ts) и код шаблона
    // (taste-code.ts).
    manifest.ok ? tasteProblems(files) : [],
  ]);
  const problems = [
    ...fileProblems(files),
    ...manifestProblems(manifest, files),
    ...(checked?.problems ?? []),
    ...problemsOf(script),
    ...namesOf(manifest, checked, script, entry),
    ...styles,
    ...taste,
    // Блок 12, часть 12а: роль и ctx.ext секции расширения — по префиксу имени от двери.
    ...(manifest.ok ? authorProblems(manifest.value, input.prefix) : []),
  ];
  if (!manifest.ok || problems.some((item) => !isWarning(item))) return refuse(problems);
  const name = `${input.prefix}:${manifest.value.name}`;
  return { ok: true, section: preparedOf(name, manifest.value, { template, checked, script, warnings: problems }) };
}
