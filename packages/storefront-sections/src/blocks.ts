import type { SectionValue } from './fields';
import type { SectionManifest } from './format';
import { resolveSectionSettings, settingsTexts } from './settings';

// Блоки секции (блок 1 «Секций и SDK», часть 3, design.md 3.16, Р53–Р55): типы — blocks в section.json, начальный
// набор — defaultBlocks, блоки экземпляра — в ревизии. format.ts импортирует этот файл, поэтому SectionManifest —
// только тип: иначе импорт по кругу.

// Проблемы блоков section.json текстом с путём: structure — форма (format.ts делает из них manifest-invalid),
// settings — значения и поля типов (setting-invalid).
export interface BlockFormatProblems {
  structure: string[];
  settings: string[];
}

// Имя типа блока (Р53): строчные латинские буквы и цифры через одиночный дефис, с буквы, до 30 знаков — id `<тип>-<8
// знаков>` не длиннее 40, как у экземпляра.
const BLOCK_TYPE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const BLOCK_TYPE_MAX = 30;
const BLOCK_TYPE_TEXT = 'тип блока — строчные латинские буквы и цифры через одиночный дефис, с буквы, до 30 знаков';

type BlockType = NonNullable<SectionManifest['blocks']>[string];
type BlockTypes = NonNullable<SectionManifest['blocks']>;
type DefaultBlock = NonNullable<SectionManifest['defaultBlocks']>[number];

// Имена типов не по Р53 — structure.
const typeNameTexts = (types: BlockTypes): string[] =>
  Object.keys(types)
    .filter((name) => !BLOCK_TYPE_ID.test(name) || name.length > BLOCK_TYPE_MAX)
    .map((name) => `blocks.${name}: ${BLOCK_TYPE_TEXT}`);

// Подпись «Добавить …» (addTitle, базовые секции, 29.10): конструктор пишет «Добавить » и её как есть, поэтому слово
// «Добавить» в ней лишнее, а первая буква — строчная («кнопку»; латиница и цифры — как есть: «email»).
const ADD_WORD = /^добавить(?:\s|$)/i;
const ADD_TITLE_TEXT =
  'подпись после «Добавить» в винительном падеже со строчной буквы, без слова «Добавить»: «кнопку»';
const addTitleWrong = (text: string): boolean => ADD_WORD.test(text) || text.charAt(0) !== text.charAt(0).toLowerCase();

const addTitleTexts = (types: BlockTypes): string[] =>
  Object.entries(types)
    .filter(([, type]) => type.addTitle !== undefined && addTitleWrong(type.addTitle))
    .map(([name]) => `blocks.${name}.addTitle: ${ADD_TITLE_TEXT}`);

// Поля типов блоков — settings: тексты settingsTexts с путём от типа.
const typeFieldTexts = (types: BlockTypes): string[] =>
  Object.entries(types).flatMap(([name, type]) => settingsTexts(type.settings).map((text) => `blocks.${name}.${text}`));

// Значения блоков по умолчанию — settings: правки проверяются как значения экземпляра (Р53).
const defaultValueTexts = (types: BlockTypes, defaults: readonly DefaultBlock[]): string[] =>
  defaults.flatMap((block, index) => {
    const type = Object.hasOwn(types, block.type) ? types[block.type] : undefined;
    if (type === undefined) return [];
    return resolveSectionSettings(type.settings, block.settings).invalid.map(
      (text) => `defaultBlocks.${index}.settings.${text}`,
    );
  });

// Тип блока по умолчанию не из blocks и блоков типа больше limit — structure (Р53).
const defaultStructureTexts = (types: BlockTypes, defaults: readonly DefaultBlock[]): string[] => {
  const unknown = defaults
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => !Object.hasOwn(types, block.type))
    .map(({ block, index }) => `defaultBlocks.${index}.type: типа ${block.type} в blocks нет`);
  const counts = new Map<string, number>();
  for (const block of defaults) counts.set(block.type, (counts.get(block.type) ?? 0) + 1);
  const overLimit = [...counts]
    .filter(([name, count]) => Object.hasOwn(types, name) && count > types[name].limit)
    .map(([name, count]) => `defaultBlocks: блоков ${name} — ${count}, limit ${types[name].limit}`);
  return [...unknown, ...overLimit];
};

export function blockFormatProblems(manifest: Pick<SectionManifest, 'blocks' | 'defaultBlocks'>): BlockFormatProblems {
  const types = manifest.blocks;
  if (types === undefined)
    return {
      structure: manifest.defaultBlocks === undefined ? [] : ['defaultBlocks: у секции нет blocks'],
      settings: [],
    };
  const defaults = manifest.defaultBlocks ?? [];
  return {
    structure: [...typeNameTexts(types), ...addTitleTexts(types), ...defaultStructureTexts(types, defaults)],
    settings: [...typeFieldTexts(types), ...defaultValueTexts(types, defaults)],
  };
}

// Блок экземпляра в ревизии и показанный блок со значениями.
export interface RevisionBlock {
  id: string;
  type: string;
  settings: Readonly<Record<string, unknown>>;
  hidden?: boolean | undefined;
}
export interface BlockValues {
  id: string;
  type: string;
  settings: Record<string, SectionValue>;
}
export interface ResolvedBlocks {
  blocks: BlockValues[];
  invalid: string[];
}

// Тип блока по имени: только свои ключи словаря — имя constructor или toString не находит методы объекта.
const typeOf = (types: Readonly<Record<string, BlockType>>, name: string): BlockType | undefined =>
  Object.hasOwn(types, name) ? types[name] : undefined;

// Блоки по умолчанию (Р54): id `<тип>-<n>`, n — место в defaultBlocks с 1. Так же считает конструктор.
const defaultsOf = (manifest: Pick<SectionManifest, 'defaultBlocks'>): RevisionBlock[] =>
  (manifest.defaultBlocks ?? []).map((block, index) => ({
    id: `${block.type}-${index + 1}`,
    type: block.type,
    settings: block.settings,
  }));

// Почему блок не показан: текст проблемы или null. Помечает id увиденным после проверок типа и повтора: неизвестный
// тип и повтор id в limit не считаются, блок сверх limit свой id занимает (Р55).
function skipTextOf(
  block: RevisionBlock,
  index: number,
  types: Readonly<Record<string, BlockType>>,
  seen: Set<string>,
  counts: ReadonlyMap<string, number>,
): string | null {
  const type = typeOf(types, block.type);
  if (type === undefined) return `blocks.${index}.type: типа ${block.type} у секции нет`;
  if (seen.has(block.id)) return `blocks.${index}.id: ${block.id} уже есть`;
  seen.add(block.id);
  const count = (counts.get(block.type) ?? 0) + 1;
  if (count > type.limit) return `blocks.${index}: блоков ${block.type} больше ${type.limit}`;
  return null;
}

// Показанные блоки экземпляра по порядку со значениями (п. 18, Р54, Р55). Нет ключа blocks — блоки по умолчанию.
// Пропускаются с текстом в invalid: неизвестный тип, повтор id, блок сверх limit (по порядку, скрытые считаются);
// скрытый — без текста. Значения — правки поверх умолчаний типа, richtext очищен (resolveSectionSettings).
export function resolveSectionBlocks(
  manifest: Pick<SectionManifest, 'blocks' | 'defaultBlocks'>,
  edits: readonly RevisionBlock[] | undefined,
): ResolvedBlocks {
  const types = manifest.blocks;
  if (types === undefined)
    return { blocks: [], invalid: edits !== undefined && edits.length > 0 ? ['blocks: у секции нет блоков'] : [] };
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const resolved: ResolvedBlocks = { blocks: [], invalid: [] };
  for (const [index, block] of (edits ?? defaultsOf(manifest)).entries()) {
    const skip = skipTextOf(block, index, types, seen, counts);
    if (skip !== null) {
      resolved.invalid.push(skip);
      continue;
    }
    counts.set(block.type, (counts.get(block.type) ?? 0) + 1);
    if (block.hidden === true) continue;
    const type = typeOf(types, block.type);
    const values = resolveSectionSettings(type?.settings ?? [], block.settings);
    resolved.invalid.push(...values.invalid.map((text) => `blocks.${index}.settings.${text}`));
    resolved.blocks.push({ id: block.id, type: block.type, settings: values.values });
  }
  return resolved;
}
