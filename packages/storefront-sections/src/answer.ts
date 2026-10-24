import { readManifest, type SectionFiles } from './format';
import { problemDoc } from './problem-info';
import type { PrepareResult } from './prepare';
import { isWarning, type SectionProblem } from './problems';

// Ответ проверки для ИИ (блок 14 «Секций и SDK», 14.6, п. 9): один JSON у команды --json и у адресов шлюза
// «проверить» и «сохранить» (14б). doc — страница и якорь кода в документации.
export interface AnswerProblem extends SectionProblem {
  readonly doc: string; // problemDoc(code): страница и якорь от адреса llms.txt своего контура
}

export interface SectionAnswer {
  ok: boolean;
  name: string | null; // `${prefix}:${manifest.name}`, если section.json разобран; иначе null
  problems: AnswerProblem[]; // отказы
  warnings: AnswerProblem[]; // предупреждения (isWarning) — секция с ними сохраняется
}

const withDoc = (item: SectionProblem): AnswerProblem => ({ ...item, doc: problemDoc(item.code) });

const answerName = (prefix: string, files: SectionFiles): string | null => {
  const manifest = readManifest(files);
  return manifest.ok ? `${prefix}:${manifest.value.name}` : null;
};

export function sectionAnswer(prefix: string, files: SectionFiles, result: PrepareResult): SectionAnswer {
  const name = answerName(prefix, files);
  if (result.ok) return { ok: true, name, problems: [], warnings: result.section.warnings.map(withDoc) };
  return {
    ok: false,
    name,
    problems: result.problems.filter((item) => !isWarning(item)).map(withDoc),
    warnings: result.problems.filter(isWarning).map(withDoc),
  };
}
