import {
  platformDictionary,
  readSectionEdits,
  readSectionTokens,
  sectionTailwindTheme,
  sectionTokensCss,
  type SectionTokenDefs,
  type SectionTokenSet,
} from '@merfy/tokens';

// Токены секций в сборке и превью (блок 4 «Секций и SDK», Р4-10, Р4-11): значения — в CSS токенов магазина, строки
// @theme — в CSS секций страницы.

// Секция магазина с её токенами из section.json принятой правки (code.sections[].tokens); нет ключа — токенов нет.
export interface TokenedSection {
  name: string;
  tokens?: unknown;
}

// Проверенная запись токенов секции: ошибки записи — в problems сборки с именем секции.
function tokenSetOf(section: TokenedSection, problems: string[]): SectionTokenSet {
  const reading = readSectionTokens(platformDictionary, section.tokens ?? {});
  problems.push(...reading.problems.map((problem) => `${section.name}: ${problem}`));
  return { section: section.name, tokens: reading.tokens };
}

// Значения токенов секций магазина (Р4-10): readSectionTokens(platformDictionary, …) по каждой секции, правки мерчанта —
// readSectionEdits(…, rawTokens), CSS — sectionTokensCss. rawTokens — revision.tokens как в ревизии, без шагов перевода.
// problems — неверные правки и записи токенов (для строки журнала), CSS при них — с умолчаниями.
export function shopSectionTokensCss(
  sections: readonly TokenedSection[],
  rawTokens: unknown,
): { css: string; problems: string[] } {
  const problems: string[] = [];
  const sets = sections.map((section) => tokenSetOf(section, problems));
  const edits = readSectionEdits(sets, rawTokens);
  return { css: sectionTokensCss(sets, edits.edits), problems: [...problems, ...edits.problems] };
}

// Строки Tailwind для CSS секций страницы: токены секций с этими именами — одной записью через sectionTailwindTheme
// (одно имя токена у двух секций — первая запись). Ни одного токена — ''.
export function pageSectionTheme(sections: readonly TokenedSection[], names: readonly string[]): string {
  const wanted = new Set(names);
  const tokens: SectionTokenDefs = {};
  const addFirst = (entry: [string, SectionTokenDefs[string]]): void => {
    if (!(entry[0] in tokens)) tokens[entry[0]] = entry[1];
  };
  const wantedSections = sections.filter((section) => wanted.has(section.name));
  const readings = wantedSections.map((section) => readSectionTokens(platformDictionary, section.tokens ?? {}));
  for (const reading of readings) Object.entries(reading.tokens).forEach(addFirst);
  return sectionTailwindTheme(tokens);
}
