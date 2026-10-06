import { z } from 'zod';
import notTokensData from '../../not-tokens.json';
import searchWordsData from '../../search-words.json';
import { searchCatalog } from '../helpers';
import type { Dictionary, SearchEntry, TokenSearchResult } from '../types';
import {
  buildSearchIndex,
  lemmas,
  parseQuery,
  search,
  stem,
  words,
  type RefusalRecord,
  type SearchIndex,
  type SearchVocabulary,
} from './engine';

// Поиск токенов словами мерчанта (design.md 8.8). Ищет движок MCP — engine.ts, копия без изменений. Здесь только
// слова мерчанта, «не токены», приведение форм и правило «слово вида — не предмет».

const searchWordsShape = z
  .object({
    $comment: z.string(),
    parts: z.record(z.string(), z.array(z.string())),
    kindWords: z.array(z.string()),
    valueWords: z.array(z.string()),
    stopWords: z.array(z.string()),
    actionWords: z.array(z.string()),
    forms: z.record(z.string(), z.string()),
  })
  .strict();
const notTokensShape = z.array(
  z.object({ id: z.string(), title: z.string(), refusal: z.string(), asks: z.array(z.string()) }).strict(),
);

export const SEARCH_WORDS = searchWordsShape.parse(searchWordsData);
// Не токены (Т1-5): поля не про вид — настройки секций. Отказ проверяется раньше поиска.
export const NOT_TOKENS: RefusalRecord[] = notTokensShape.parse(notTokensData);

// Всё, что совпало хотя бы частично: «Ещё N» считает ответ find.
const ALL_HITS = 1000;

// Формы, на которых стеммер ошибается («кнопок» и «кнопка» дают разные основы, «сайте» режется до «са»), до движка
// приводятся к одной — в запросе, в описаниях и в словаре.
const formOf = (word: string): string => (Object.hasOwn(SEARCH_WORDS.forms, word) ? SEARCH_WORDS.forms[word] : word);
export const normalizeForms = (text: string): string => words(text).map(formOf).join(' ');

const VOCABULARY: SearchVocabulary = {
  // Оттенки, цвета и единицы словами — про значение, а не про то, какой токен менять.
  stopWords: [...SEARCH_WORDS.stopWords, ...SEARCH_WORDS.valueWords],
  entities: Object.fromEntries(
    Object.entries(SEARCH_WORDS.parts).map(([word, parts]): [string, string[]] => [normalizeForms(word), parts]),
  ),
  // Токену всё равно, «поменяй» его или «поставь»: слова действий известны, но не ищутся.
  actions: Object.fromEntries(SEARCH_WORDS.actionWords.map((word): [string, string[]] => [word, []])),
};
const REFUSALS: RefusalRecord[] = NOT_TOKENS.map((record) => ({ ...record, asks: record.asks.map(normalizeForms) }));
const KIND_STEMS = SEARCH_WORDS.kindWords.map((word) => lemmas(word)[0]);

// Индекс строится один раз на словарь и запоминается по объекту словаря.
const INDEXES = new WeakMap<Dictionary, SearchIndex<SearchEntry>>();
function indexOf(dictionary: Dictionary): SearchIndex<SearchEntry> {
  const cached = INDEXES.get(dictionary);
  if (cached !== undefined) return cached;
  const catalog = searchCatalog(dictionary).map((entry) => ({
    ...entry,
    description: normalizeForms(entry.description),
  }));
  const index = buildSearchIndex(catalog, VOCABULARY, REFUSALS);
  INDEXES.set(dictionary, index);
  return index;
}

// Слово запроса по его основе — чтобы в ответе стояло «иконок», а не «иконк».
export function queryWord(query: string, stemmed: string): string {
  return words(query).find((word) => stem(formOf(word)) === stemmed) ?? stemmed;
}

// Латиница и числа без пары в словаре — значения («шрифт Playfair», «отступ 24»), а не предмет.
const isValueWord = (word: string): boolean => /\d/.test(word) || /^[a-z-]+$/.test(word);

// Слово вида — не предмет. В «цвет ссылок» слово «цвет» есть у 32 токенов, а ссылок в словаре нет: это отказ,
// как у MCP на незнакомое первое слово, а не пять случайных цветов.
function unknownSubject(index: SearchIndex<SearchEntry>, query: string): string | undefined {
  const rest = words(normalizeForms(query)).filter((word) => !KIND_STEMS.includes(stem(word)) && !isValueWord(word));
  return rest.length > 0 ? parseQuery(index, rest.join(' ')).unknown : undefined;
}

// Поиск без оформления: найденные по порядку (full — совпали все слова), запись «не токен» или незнакомое слово.
export function searchTokens(dictionary: Dictionary, query: string): TokenSearchResult {
  const index = indexOf(dictionary);
  const normalized = normalizeForms(query);
  const outcome = search(index, normalized, ALL_HITS);
  if (outcome.kind === 'refusal') return { kind: 'refusal', id: outcome.capability.id };
  if (outcome.kind === 'unknown') return { kind: 'unknown', word: queryWord(query, outcome.word) };
  if (outcome.kind === 'empty') return { kind: 'empty' };
  const subject = unknownSubject(index, query);
  if (subject !== undefined) return { kind: 'unknown', word: queryWord(query, subject) };
  const parsed = parseQuery(index, normalized);
  return {
    kind: 'hits',
    hits: outcome.hits.map((hit) => ({ name: hit.tool.token, full: hit.coverage === 1 })),
    ignored: parsed.ignored.map((word) => queryWord(query, word)),
    corrected: parsed.corrections.map(([word]) => queryWord(query, word)),
  };
}
