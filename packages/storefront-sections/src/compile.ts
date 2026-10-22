import { init, parse as lexImports } from 'es-module-lexer';
import { z } from 'zod';
import { ASTRO_RUNTIME } from './astro-runtime';
import { MAX_TEMPLATE_DEPTH, templateDepth } from './depth';
import { TEMPLATE_FILE, type SectionManifest } from './format';
import { blockSelectProblems, markBlocks } from './marks';
import { isWarning, problem, type SectionProblem } from './problems';
import { NO_RICHTEXT, richtextIdsOf, type RichtextIds } from './set-html';
import { templateProblems } from './template';

// Компиляция шаблона секции (блок 1 «Секций и SDK»): template.astro → модуль JS, который рисует HTML через рантайм Astro.
// Модуль идёт в процесс рендера сборщика (1а-8), поэтому импорт в нём один — статический импорт рантайма; остальное —
// import-forbidden. Компилятор подключается динамически: в процессе сборщика его нет.
export { ASTRO_RUNTIME };

export type Compiled = { ok: true; code: string } | { ok: false; problems: SectionProblem[] };

export interface TemplateCheck {
  problems: SectionProblem[];
  // Модуль рендера; null — шаблон с проблемами.
  render: string | null;
}

const diagnosticSchema = z.object({
  severity: z.union([z.string(), z.number()]).optional(),
  text: z.string(),
  labels: z.array(z.object({ line: z.number(), column: z.number() })).default([]),
});
type Diagnostic = z.infer<typeof diagnosticSchema>;

const isError = (diagnostic: Diagnostic): boolean =>
  diagnostic.severity === undefined || diagnostic.severity === 'error' || diagnostic.severity === 1;

// Строка в диагностике — с 1, колонка — с 0; в проблеме обе с 1, как в редакторе.
function diagnosticProblem(diagnostic: Diagnostic): SectionProblem {
  const [label] = diagnostic.labels;
  const place = label === undefined ? undefined : { line: label.line, column: label.column + 1 };
  return problem('template-compile', TEMPLATE_FILE, diagnostic.text, place);
}

export async function compileTemplate(text: string): Promise<Compiled> {
  const { transform } = await import('@astrojs/compiler-rs');
  const result = await Promise.resolve(
    transform(text, { filename: TEMPLATE_FILE, resolvePath: (specifier: string) => specifier }),
  );
  const errors = z.array(diagnosticSchema).parse(result.diagnostics).filter(isError);
  if (errors.length > 0) return { ok: false, problems: errors.map(diagnosticProblem) };
  return { ok: true, code: result.code };
}

export async function moduleImportProblems(code: string): Promise<SectionProblem[]> {
  await Promise.resolve(init);
  const [imports] = lexImports(code);
  return imports
    .filter((entry) => !(entry.d === -1 && entry.n === ASTRO_RUNTIME))
    .map((entry) =>
      problem(
        'import-forbidden',
        TEMPLATE_FILE,
        `импорт ${entry.n ?? code.slice(entry.ss, entry.se)}: модулю шаблона можно только рантайм Astro`,
      ),
    );
}

// Что проверке шаблона нужно от section.json (часть 3): id настроек richtext (set:html, Р58) и есть ли у секции блоки
// (метки, Р57).
export interface TemplateOptions {
  richtext: RichtextIds;
  blocks: boolean;
}

export const NO_TEMPLATE_OPTIONS: TemplateOptions = { richtext: NO_RICHTEXT, blocks: false };

export const templateOptionsOf = (manifest: SectionManifest): TemplateOptions => ({
  richtext: richtextIdsOf(manifest),
  blocks: manifest.blocks !== undefined,
});

// Глубже предела — сразу отказ, до разбора: компилятор такой шаблон не переварит (depth.ts). Дальше запреты и
// компиляция — разом: все проблемы шаблона автор получает за один заход. Модуль рендера — из шаблона с метками блоков.
export async function checkTemplate(
  text: string,
  options: TemplateOptions = NO_TEMPLATE_OPTIONS,
): Promise<TemplateCheck> {
  const depth = templateDepth(text);
  if (depth > MAX_TEMPLATE_DEPTH) {
    const message = `шаблон вложен на ${depth} уровней (теги и скобки), предел — ${MAX_TEMPLATE_DEPTH}`;
    return { problems: [problem('template-too-deep', TEMPLATE_FILE, message)], render: null };
  }
  const [forbidden, compiled, marked] = await Promise.all([
    templateProblems(text, options.richtext),
    compileTemplate(text),
    markBlocks(text),
  ]);
  if (!compiled.ok) return { problems: [...forbidden, ...compiled.problems], render: null };
  // Модуль рендера — из шаблона с метками блоков (Р57); запреты и места ошибок — по исходному тексту.
  const module = marked.marks > 0 ? await compileTemplate(marked.text) : compiled;
  if (!module.ok) return { problems: [...forbidden, ...module.problems], render: null };
  const problems = [
    ...forbidden,
    ...blockSelectProblems(text, marked, options.blocks),
    ...(await moduleImportProblems(module.code)),
  ];
  return { problems, render: problems.some((item) => !isWarning(item)) ? null : module.code };
}
