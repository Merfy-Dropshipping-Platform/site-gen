import { init, parse as lexImports } from 'es-module-lexer';
import { z } from 'zod';
import { ASTRO_RUNTIME } from './astro-runtime';
import { TEMPLATE_FILE } from './format';
import { problem, type SectionProblem } from './problems';
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
  const result = await Promise.resolve(transform(text, { filename: TEMPLATE_FILE, resolvePath: (specifier: string) => specifier }));
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

// Запреты и компиляция — разом: автор видит все проблемы шаблона за один заход.
export async function checkTemplate(text: string): Promise<TemplateCheck> {
  const [forbidden, compiled] = await Promise.all([templateProblems(text), compileTemplate(text)]);
  if (!compiled.ok) return { problems: [...forbidden, ...compiled.problems], render: null };
  const problems = [...forbidden, ...(await moduleImportProblems(compiled.code))];
  return { problems, render: problems.length === 0 ? compiled.code : null };
}
