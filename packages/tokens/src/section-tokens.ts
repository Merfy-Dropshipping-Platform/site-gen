import { entryProblems, entryShape, isBaseToken, tokenDef, type CheckContext } from './dictionary';
import { RUSSIAN_ERRORS, shapeProblems } from './errors';
import { block, tokenDeclarations } from './emit-css';
import { tokenThemeLines, tokenUtilityLine } from './generate/tailwind';
import type { Dictionary, TokenDef, TokenKind, TokenSet } from './types';

// Свои токены секции (блок 4 «Секций и SDK», design.md 4.4, Р4-9…Р4-11): объявляет автор в section.json,
// значение — на обёртке секции, правит мерчант в «Настройках темы».

export const SECTION_MARK = 'custom';
export const SECTION_TOKENS_MAX = 10;
// Виды токенов секции (design.md 4.4); у тени — только alias: своей тени без схемы нет, в панели теней нет.
export const SECTION_TOKEN_KINDS: readonly TokenKind[] = [
  'color',
  'weight',
  'text',
  'tracking',
  'radius',
  'border-width',
  'shadow',
  'spacing',
  'width',
];

export type SectionTokenDefs = Record<string, TokenDef>;
export type SectionTokensReading = { tokens: SectionTokenDefs; problems: string[] };
// Токены одной секции в магазине: имя секции (`shop:<имя>`) и её токены.
export type SectionTokenSet = { section: string; tokens: SectionTokenDefs };
// Правки мерчанта: имя секции → значения её токенов.
export type SectionEdits = Record<string, TokenSet>;

// Имя секции в магазине: префикс и имя через двоеточие, латиница в kebab-case.
export const SECTION_NAME: RegExp = /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;

// Группа записей секции: общие проверки словаря смотрят группу в списке контекста.
const SECTION_GROUP = 'section';
const NOT_OBJECT_PROBLEM = 'tokens: ключ tokens — объект: имя токена и его запись';

type Shaped = { name: string; def: TokenDef };
type Shaping = { defs: Shaped[]; problems: string[] };

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw);

const isSectionKind = (kind: string): kind is TokenKind => SECTION_TOKEN_KINDS.some((known) => known === kind);

function shapeOf(raw: Record<string, unknown>): Shaping {
  const shaping: Shaping = { defs: [], problems: [] };
  for (const [name, value] of Object.entries(raw)) {
    const parsed = entryShape.safeParse(value, RUSSIAN_ERRORS);
    if (!parsed.success) {
      shaping.problems.push(...shapeProblems(parsed.error, `tokens.${name}`));
      continue;
    }
    const entry = parsed.data;
    if (!isSectionKind(entry.kind)) {
      shaping.problems.push(`tokens.${name}: вид «${entry.kind}» не бывает у токена секции`);
      continue;
    }
    shaping.defs.push({
      name,
      def: { ...entry, kind: entry.kind, about: entry.about ?? '', group: entry.group ?? SECTION_GROUP },
    });
  }
  return shaping;
}

// Словарь контекста — базовые токены плюс сами токены секции: проверки записи смотрят деф в нём, источники alias —
// в базовом словаре.
const contextOf = (base: Dictionary, defs: readonly Shaped[]): CheckContext => ({
  tokens: { ...base.tokens, ...Object.fromEntries(defs.map((shaped) => [shaped.name, shaped.def])) },
  groupIds: [...base.groups.map((group) => group.id), SECTION_GROUP],
  origin: 'section',
});

function aliasSourceProblems(name: string, def: TokenDef, base: Dictionary): string[] {
  const from = def.derive?.rule === 'alias' ? def.derive.from : '';
  const source = tokenDef(base, from);
  if (source === undefined) return [`tokens.${name}: источника «${from}» нет в словаре платформы`];
  if (source.kind !== def.kind) return [`tokens.${name}: «${from}» — другого вида`];
  return isBaseToken(source) ? [] : [`tokens.${name}: умолчание — из базового токена, «${from}» — не базовый`];
}

// Значение токена секции — default или alias от базового токена словаря того же вида; у тени — только alias.
function deriveProblems(name: string, def: TokenDef, base: Dictionary): string[] {
  if (def.kind === 'shadow' && def.derive === undefined)
    return [`tokens.${name}: у тени — только alias от токена словаря`];
  if (def.derive === undefined) return [];
  if (def.derive.rule !== 'alias') return [`tokens.${name}: правило ${def.derive.rule} — только alias`];
  return aliasSourceProblems(name, def, base);
}

const limitProblems = (count: number): string[] =>
  count <= SECTION_TOKENS_MAX ? [] : [`tokens: не больше ${SECTION_TOKENS_MAX} токенов у секции`];

// Значение ключа tokens из section.json: запись — entryShape словаря, происхождение section, вид — из
// SECTION_TOKEN_KINDS, derive — только alias от токена base того же вида, у shadow — только alias,
// не больше SECTION_TOKENS_MAX. Проблема — строка «tokens.<имя>: …» (или «tokens: …» для всего ключа).
export function readSectionTokens(base: Dictionary, raw: unknown): SectionTokensReading {
  if (!isRecord(raw)) return { tokens: {}, problems: [NOT_OBJECT_PROBLEM] };
  const shaped = shapeOf(raw);
  const context = contextOf(base, shaped.defs);
  const checked = shaped.defs.map((shaped) => ({
    shaped,
    problems: [
      ...entryProblems([shaped.name], context).map((problem) => `tokens.${problem}`),
      ...deriveProblems(shaped.name, shaped.def, base),
    ],
  }));
  const tokens = Object.fromEntries(
    checked.filter((item) => item.problems.length === 0).map((item) => [item.shaped.name, item.shaped.def]),
  );
  const problems = [
    ...shaped.problems,
    ...checked.flatMap((item) => item.problems),
    ...limitProblems(shaped.defs.length),
  ];
  return { tokens, problems };
}

// Строки Tailwind для классов токенов секции — та же таблица, что у словаря (generate/tailwind.ts): блок
// «@theme inline reference { … }» без сбросов и, для weight и border-width, строки @utility. Токенов нет — ''.
export function sectionTailwindTheme(tokens: SectionTokenDefs): string {
  const entries = Object.entries(tokens);
  if (entries.length === 0) return '';
  const theme = block(
    '@theme inline reference',
    entries.flatMap(([name, def]) => tokenThemeLines(def.kind, name)),
  );
  const utilities = entries
    .map(([name, def]) => tokenUtilityLine(def.kind, name))
    .filter((line): line is string => line !== null);
  return [theme, ...utilities].join('\n');
}

function aliasLines(name: string, def: TokenDef): string[] {
  const from = def.derive?.rule === 'alias' ? def.derive.from : '';
  const main = `--${name}: var(--${from});`;
  if (def.kind !== 'text') return [main];
  return [main, `--${name}--line-height: var(--${from}--line-height);`];
}

function declarationsOf(section: SectionTokenSet, edits: TokenSet): string[] {
  return Object.entries(section.tokens).flatMap(([name, def]) => {
    if (edits[name] !== undefined) return tokenDeclarations(def.kind, name, edits[name]);
    if (def.default !== undefined) return tokenDeclarations(def.kind, name, def.default);
    return aliasLines(name, def);
  });
}

// CSS значений: «@layer base {», по правилу merfy-section[data-section="<имя>"] { … } на каждую секцию с токенами,
// «}» и перевод строки. Секция с именем не по SECTION_NAME — без правила. Ни одной строки — ''.
export function sectionTokensCss(sections: readonly SectionTokenSet[], edits: SectionEdits): string {
  const ruled = sections.filter(
    (section) => SECTION_NAME.test(section.section) && Object.keys(section.tokens).length > 0,
  );
  if (ruled.length === 0) return '';
  const rules = ruled.map((section) =>
    block(`merfy-section[data-section="${section.section}"]`, declarationsOf(section, edits[section.section] ?? {})),
  );
  return `@layer base {\n${rules.join('\n')}\n}\n`;
}
