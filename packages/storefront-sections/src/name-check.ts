import type { ProblemCode } from './problems';
import type { FieldIssue, FieldList, RuleSection } from './rule-types';
import { NAMES, OWN_NAME_LIMITS, sharedSettingHint, type NameEntry, type OwnName, type OwnNames } from './names';

// Проверка имени поля по словарю (блок 3 «Секций и SDK», Р3.5–Р3.6): одно имя на одно назначение. Ошибка сразу
// говорит, что вместо: подсказку формы, отказ, настройку «Настроек темы» или ближайшее имя.

// kebab-форма id: дефис между [a-z0-9] и [A-Z], [_\s]+ → дефис, нижний регистр, повторы дефиса — один, по краям — без.
export const kebabOf = (id: string): string =>
  id
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export interface NameProblem {
  code: 'setting-name-unknown' | 'setting-name-kind';
  message: string;
}

// Замены слов перед поиском ближайшего имени (Р3.6).
const WORD_REPLACEMENTS: Readonly<Record<string, string>> = {
  colour: 'color',
  img: 'image',
  photo: 'image',
  btn: 'button',
  title: 'heading',
};

const WORD_SPLIT = /[\s-]+/;
const wordsOf = (text: string): string[] =>
  text
    .split(WORD_SPLIT)
    .map((word) => WORD_REPLACEMENTS[word] ?? word)
    .filter((word, index, all) => all.indexOf(word) === index);

const entryOf = (id: string): NameEntry | undefined => NAMES.names.find((entry) => entry.name === id);
const sharedOf = (id: string): string | undefined => {
  const item = NAMES.shared.find((shared) => shared.id === id);
  return item === undefined ? undefined : `Это ${sharedSettingHint(item)}`;
};
const refusalOf = (id: string): string | undefined => {
  const matches = (name: string): boolean => name === id || (name.endsWith('-*') && id.startsWith(name.slice(0, -1)));
  const refusal = NAMES.refusals.find((item) => item.names.some(matches));
  return refusal?.refusal;
};

const quoteList = (values: readonly string[], separator: string): string =>
  values.map((value) => `\`${value}\``).join(separator);

const kindProblem = (entry: NameEntry, id: string, kind: string): NameProblem => {
  const withKind = NAMES.names.filter((item) => item.kinds.some((own) => own === kind)).map((item) => item.name);
  const tail =
    withKind.length === 0
      ? `имён с видом \`${kind}\` в словаре нет`
      : `имена с видом \`${kind}\` — ${quoteList(withKind, ', ')}`;
  return {
    code: 'setting-name-kind',
    message: `поле \`${id}\`: в словаре это ${quoteList(entry.kinds, ' или ')}, здесь \`${kind}\`; ${tail}`,
  };
};

// Расстояние Левенштейна (Р3.6): без новых зависимостей.
export function levenshteinOf(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const held = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = held;
    }
  }
  return row[right.length];
}

// Расстояние с перестановкой соседних букв за одну правку: «titel» от «title» — 1 (у Левенштейна 2). Для опечаток в слове.
export function typoDistanceOf(left: string, right: string): number {
  const rows = [Array.from({ length: right.length + 1 }, (_, index) => index)];
  const cell = (row: readonly number[], i: number, j: number): number => {
    const plain = Math.min(
      rows[i - 1][j] + 1,
      row[j - 1] + 1,
      rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
    );
    const swapped = i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1];
    return swapped ? Math.min(plain, rows[i - 2][j - 2] + 1) : plain;
  };
  for (let i = 1; i <= left.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= right.length; j += 1) row.push(cell(row, i, j));
    rows.push(row);
  }
  return rows[left.length][right.length];
}

// Очки имени (Р3.6): слово совпало со словом имени — 4, со словом из подписи или asks — 2, с опечаткой в одном из них — 1.
const WORD_SCORE: Readonly<Record<string, number>> = { name: 4, ask: 2, typo: 1, none: 0 };
const TYPO_MIN_LENGTH = 5;

// Слова без замен (Р3.6) тоже в наборе: «title» из asks — слово, на которое похожа опечатка «titel».
const rawWordsOf = (text: string): string[] => text.split(WORD_SPLIT);
const namesWordsOf = (entry: NameEntry): Set<string> =>
  new Set(entry.name.split('-').flatMap((word) => [...wordsOf(word), word]));
const asksWordsOf = (entry: NameEntry): Set<string> =>
  new Set([...entry.asks, entry.label.toLowerCase()].flatMap((ask) => [...wordsOf(ask), ...rawWordsOf(ask)]));

// Все слова словаря: слово id, которое тут есть, — не опечатка, а слово с другим назначением.
const DICTIONARY_WORDS: ReadonlySet<string> = new Set(
  NAMES.names.flatMap((entry) => [...namesWordsOf(entry), ...asksWordsOf(entry)]),
);

const isTypoOf = (word: string, known: ReadonlySet<string>): boolean =>
  word.length >= TYPO_MIN_LENGTH &&
  !DICTIONARY_WORDS.has(word) &&
  [...known].some((other) => other.length >= TYPO_MIN_LENGTH && typoDistanceOf(word, other) <= 1);

function scoreOf(entry: NameEntry, idWords: readonly string[]): number {
  const nameWords = namesWordsOf(entry);
  const askWords = asksWordsOf(entry);
  const scoreOfWord = (word: string): number => {
    if (nameWords.has(word)) return WORD_SCORE.name;
    if (askWords.has(word)) return WORD_SCORE.ask;
    if (isTypoOf(word, nameWords) || isTypoOf(word, askWords)) return WORD_SCORE.typo;
    return WORD_SCORE.none;
  };
  return idWords.reduce((score, word) => score + scoreOfWord(word), 0);
}

// До трёх ближайших имён словаря (по ключу, подписи и asks): первое — лучшее, остальные — того же вида поля и не слабее
// половины очков первого.
const NEAREST_MAX = 3;

const nearestOf = (kebab: string, kind: string): string[] => {
  const idWords = wordsOf(kebab);
  const ranked = NAMES.names
    .map((entry, index) => ({
      entry,
      index,
      score: scoreOf(entry, idWords),
      distance: levenshteinOf(kebab, entry.name),
      hasKind: entry.kinds.some((own) => own === kind),
    }))
    .filter((item) => item.score > 0 || item.distance <= 2);
  const better = (a: (typeof ranked)[number], b: (typeof ranked)[number]): number => {
    if (a.hasKind !== b.hasKind) return a.hasKind ? -1 : 1;
    const byScore = b.score - a.score;
    if (byScore !== 0) return byScore;
    const byDistance = a.distance - b.distance;
    if (byDistance !== 0) return byDistance;
    return a.index - b.index;
  };
  ranked.sort(better);
  const [top] = ranked;
  if (top === undefined) return [];
  const close = (item: (typeof ranked)[number]): boolean =>
    item.hasKind === top.hasKind &&
    (top.score === 0 ? item.score === 0 && item.distance <= top.distance : item.score * 4 >= top.score * 3);
  return ranked
    .filter((item) => item === top || close(item))
    .slice(0, NEAREST_MAX)
    .map((item) => item.entry.name);
};

const UNKNOWN = 'такого имени нет в словаре';

// Шаги проверки имени для неизвестного словарю (Р3.5): первая непустая подсказка побеждает.
const HINT_STEPS: readonly ((id: string, kebab: string, kind: string) => string | undefined)[] = [
  (id, kebab) => (kebab !== id && entryOf(kebab) !== undefined ? `поле \`${id}\`: имена — kebab-case, в словаре — \`${kebab}\`` : undefined),
  (id, kebab) => {
    const refusal = refusalOf(kebab);
    return refusal === undefined ? undefined : `поле \`${id}\`: ${UNKNOWN}. ${refusal}`;
  },
  (id, kebab) => {
    const shared = sharedOf(kebab);
    return shared === undefined ? undefined : `поле \`${id}\`: ${UNKNOWN}. ${shared}`;
  },
  (id, kebab, kind) => {
    const nearest = nearestOf(kebab, kind);
    return nearest.length === 0
      ? `поле \`${id}\`: ${UNKNOWN}, ближе всего — нет; имена — \`merfy section names\``
      : `поле \`${id}\`: ${UNKNOWN}, ближе всего — ${quoteList(nearest, ', ')}`;
  },
];

const OWN_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Своё имя секции (раздел `names`): отказ или undefined. Имя из словаря — name-own-in-dictionary; запись не по
// правилу или имя из not-names.json — name-own-invalid.
function ownNameProblem(name: string): { code: ProblemCode; message: string } | undefined {
  if (entryOf(name) !== undefined) {
    return {
      code: 'name-own-in-dictionary',
      message: `своё имя \`${name}\` уже есть в словаре: убери его из \`names\` — поле возьмёт имя, виды и подпись из словаря`,
    };
  }
  const shapeOk = OWN_NAME.test(name) && name.length <= OWN_NAME_LIMITS.length;
  const refusal = refusalOf(name);
  if (shapeOk && refusal === undefined) return undefined;
  const rule = `своё имя \`${name}\`: нужны строчные латинские буквы и цифры через одиночный дефис, до ${OWN_NAME_LIMITS.length} знаков`;
  return {
    code: 'name-own-invalid',
    message: refusal === undefined ? rule : `своё имя \`${name}\`: такое имя нельзя. ${refusal}`,
  };
}

// Свои имена, которые можно применять к полям: без отказа.
const usableOwnOf = (own: OwnNames): OwnNames =>
  Object.fromEntries(Object.entries(own).filter(([name]) => ownNameProblem(name) === undefined));

const ownKindProblem = (own: OwnName, id: string, kind: string): NameProblem => ({
  code: 'setting-name-kind',
  message: `поле \`${id}\`: в \`names\` секции это ${quoteList(own.kinds, ' или ')}, здесь \`${kind}\``,
});

// Имя и вид поля по словарю NAMES (Р3.5) и своим именам секции: проблемы нет — undefined.
export function nameIssue(id: string, kind: string, own: OwnNames = {}): NameProblem | undefined {
  const entry = entryOf(id);
  if (entry !== undefined) {
    return entry.kinds.some((item) => item === kind) ? undefined : kindProblem(entry, id, kind);
  }
  const ownEntry = Object.hasOwn(own, id) ? own[id] : undefined;
  if (ownEntry !== undefined) {
    return ownEntry.kinds.some((item) => item === kind) ? undefined : ownKindProblem(ownEntry, id, kind);
  }
  const kebab = kebabOf(id);
  const hint = HINT_STEPS.map((step) => step(id, kebab, kind)).find((text) => text !== undefined);
  return hint === undefined ? undefined : { code: 'setting-name-unknown', message: hint };
}

// Все поля всех списков по порядку; путь — [...list.path, индекс, 'id'], у setting-name-kind —
// [...list.path, индекс, 'setting', 'kind'].
// Сначала — свои имена секции: путь ['names', <имя>], число имён — ['names'].
export function nameIssues(section: RuleSection): FieldIssue[] {
  const ownNames = section.ownNames ?? {};
  const usable = usableOwnOf(ownNames);
  const ownIssues: FieldIssue[] = Object.keys(ownNames).flatMap((name) => {
    const found = ownNameProblem(name);
    return found === undefined ? [] : [{ code: found.code, path: ['names', name], message: found.message }];
  });
  const count = Object.keys(ownNames).length;
  if (count > OWN_NAME_LIMITS.names) {
    ownIssues.push({
      code: 'names-limit',
      path: ['names'],
      message: `своих имён в \`names\` — ${count}, можно не больше ${OWN_NAME_LIMITS.names}; возьми имена из словаря (\`merfy section names\`) или объедини поля`,
    });
  }
  const issuesOf = (list: FieldList): FieldIssue[] =>
    list.fields.flatMap((field, index) => {
      const issue = nameIssue(field.id, field.setting.kind, usable);
      if (issue === undefined) return [];
      const key = issue.code === 'setting-name-kind' ? ['setting', 'kind'] : ['id'];
      return [{ code: issue.code, path: [...list.path, index, ...key], message: issue.message }];
    });
  return [...ownIssues, ...section.lists.flatMap(issuesOf)];
}
