import { platformDictionary, readSectionTokens, type SectionTokenDefs } from '@merfy/tokens';
import { MANIFEST_FILE, type SectionManifest } from './format';
import { valuePosition } from './position';
import { problem, type SectionProblem } from './problems';

// Свои токены секции (блок 4 «Секций и SDK», Р4-9): readSectionTokens словаря платформы. Ключа tokens нет — {}.

export function sectionTokensOf(manifest: SectionManifest): SectionTokenDefs {
  if (manifest.tokens === undefined) return {};
  return readSectionTokens(platformDictionary, manifest.tokens).tokens;
}

// Путь проблемы в тексте: «tokens.<имя>: …» — значение токена, «tokens: …» — весь ключ. Имя остаётся в тексте.
function splitPath(item: string): { path: readonly string[]; message: string } {
  if (item.startsWith('tokens:')) return { path: ['tokens'], message: item.slice('tokens: '.length) };
  const rest = item.slice('tokens.'.length);
  const name = rest.slice(0, rest.indexOf(':'));
  return { path: ['tokens', name], message: rest };
}

// Проблемы записи токенов — код token-invalid, файл section.json, место — valuePosition(text, ['tokens', <имя>])
// или ['tokens'] для проблемы всего ключа. text — текст section.json.
export function tokenProblems(manifest: SectionManifest, text: string): SectionProblem[] {
  if (manifest.tokens === undefined) return [];
  const reading = readSectionTokens(platformDictionary, manifest.tokens);
  return reading.problems.map((item) => {
    const { path, message } = splitPath(item);
    return problem('token-invalid', MANIFEST_FILE, message, valuePosition(text, path));
  });
}
