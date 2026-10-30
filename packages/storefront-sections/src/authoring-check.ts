import { MANIFEST_FILE, TEMPLATE_FILE, readManifest, type SectionFiles } from './format';
import { deadSettingProblems } from './dead-settings';
import { libraryCopyProblems } from './library-copy';
import { literalFound } from './markup-literals';
import { positionAt } from './position';
import { problem, type SectionProblem } from './problems';

// Предупреждения о том, как секция собрана (Н-«Оценка владельца» после «Лавренти», 30.10): надписи и адреса картинок
// прямо в разметке, параметры, которых никто не читает, копия библиотечной секции без изменений. Секция
// сохраняется, автор исправляет по ответу. Отдельно от taste-check.ts: те правила смотрят на вид и код шаблона, эти —
// на содержимое и состав секции.
const SCRIPT_FILE = /\.(?:ts|js)$/;

async function markupProblems(template: string): Promise<SectionProblem[]> {
  try {
    const { parse } = await import('@astrojs/compiler-rs');
    const { ast } = await Promise.resolve(parse(template));
    return literalFound(ast, template)
      .sort((left, right) => left.at - right.at)
      .map((item) => problem(item.code, TEMPLATE_FILE, item.message, positionAt(template, item.at)));
  } catch {
    // Шаблон не разобрался — его ошибку сообщает компиляция.
    return [];
  }
}

export async function authoringProblems(files: SectionFiles): Promise<SectionProblem[]> {
  const manifest = readManifest(files);
  if (!manifest.ok) return [];
  const template = files[TEMPLATE_FILE];
  const fromMarkup = template === undefined ? [] : await markupProblems(template);
  const scripts = Object.entries(files).flatMap(([file, text]) => (SCRIPT_FILE.test(file) ? [text] : []));
  const fromSettings =
    template === undefined
      ? []
      : deadSettingProblems(manifest.value, [template, ...scripts], files[MANIFEST_FILE] ?? '');
  return [...fromMarkup, ...fromSettings, ...libraryCopyProblems(files, manifest.value.name)];
}
