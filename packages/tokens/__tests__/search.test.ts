import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import queriesJson from '../fixtures/search-queries.json';
import themeWithExtension from '../fixtures/theme-with-extension/theme.json';
import { dictionaryNames, platformDictionary } from '../src/dictionary';
import { NOT_TOKENS, SEARCH_WORDS, normalizeForms, queryWord, searchTokens } from '../src/search/tokens';
import { parseTheme } from '../src/values';

// 134 проверочных запроса в трёх наборах (design.md 8.8). Зачёт: «не токен» — та самая запись; незнакомое слово —
// то самое (ё = е); иначе нужный токен в первых трёх и, если указано, слово ушло в «не искал по».
const queryShape = z
  .object({
    q: z.string(),
    top: z.array(z.string()).optional(),
    ignored: z.string().optional(),
    refusal: z.string().optional(),
    unknown: z.string().optional(),
  })
  .strict();
const fixture = z
  .object({ sets: z.array(z.object({ id: z.string(), title: z.string(), queries: z.array(queryShape) }).strict()) })
  .strict()
  .parse(queriesJson);
type Query = z.infer<typeof queryShape>;
type Verdict = { q: string; ok: boolean; first: boolean; search: boolean };

const plain = (word: string): string => word.replace(/ё/g, 'е');

function judge(query: Query): Verdict {
  const result = searchTokens(platformDictionary, query.q);
  const names = result.kind === 'hits' ? result.hits.map((hit) => hit.name) : [];
  const rank = names.findIndex((name) => (query.top ?? []).includes(name));
  const verdict = { q: query.q, first: rank === 0, search: false };
  if (query.refusal !== undefined) return { ...verdict, ok: result.kind === 'refusal' && result.id === query.refusal };
  if (query.unknown !== undefined) {
    return { ...verdict, ok: result.kind === 'unknown' && plain(result.word) === plain(query.unknown) };
  }
  const ignored = result.kind === 'hits' ? result.ignored : [];
  const ignoredOk = query.ignored === undefined || ignored.includes(query.ignored);
  return { ...verdict, ok: rank >= 0 && rank < 3 && ignoredOk, search: true };
}

// Сколько раз нужный токен стоял первым — как у прототипа на странице: 64 из 64, 28 из 30, 24 из 26.
const FIRST: Record<string, [number, number]> = { tuned: [64, 64], 'held-out': [28, 30], 'held-out-2': [24, 26] };

describe('134 проверочных запроса', () => {
  it('три набора: 76, 30 и 28 запросов', () => {
    expect(fixture.sets.map((set) => [set.id, set.queries.length])).toEqual([
      ['tuned', 76],
      ['held-out', 30],
      ['held-out-2', 28],
    ]);
  });

  it.each(fixture.sets)('$title — зачтены все', (set) => {
    const verdicts = set.queries.map(judge);
    const searches = verdicts.filter((verdict) => verdict.search);
    expect(verdicts.filter((verdict) => !verdict.ok).map((verdict) => verdict.q)).toEqual([]);
    expect([searches.filter((verdict) => verdict.first).length, searches.length]).toEqual(FIRST[set.id]);
  });
});

describe('searchTokens', () => {
  it('находит по порядку; full — совпали все слова', () => {
    const result = searchTokens(platformDictionary, 'скругление кнопок');
    expect(result.kind).toBe('hits');
    if (result.kind !== 'hits') return;
    expect(result.hits.slice(0, 5).map((hit) => hit.name)).toEqual([
      'radius-button',
      'radius-card',
      'radius-input',
      'radius-media',
      'radius-badge',
    ]);
    expect(result.hits[0].full).toBe(true);
    expect(result.hits.some((hit) => !hit.full)).toBe(true);
  });

  it('слово вида — не предмет: «цвет ссылок» — незнакомое слово, а не пять цветов', () => {
    expect(searchTokens(platformDictionary, 'цвет ссылок')).toEqual({ kind: 'unknown', word: 'ссылок' });
  });

  it('не токен, пустой запрос, опечатка и значение латиницей', () => {
    expect(searchTokens(platformDictionary, 'вид корзины')).toEqual({ kind: 'refusal', id: 'cart-type' });
    expect(searchTokens(platformDictionary, 'хочу')).toEqual({ kind: 'empty' });
    expect(searchTokens(platformDictionary, 'шрифд заголовков')).toMatchObject({ corrected: ['шрифд'] });
    expect(searchTokens(platformDictionary, 'поменяй шрифт на Playfair')).toMatchObject({
      hits: [
        { name: 'font-body', full: true },
        { name: 'font-heading', full: true },
        { name: 'weight-body', full: true },
        { name: 'weight-heading', full: true },
      ],
      ignored: ['playfair'],
    });
  });

  it('ищет и свои токены темы — по их описаниям', () => {
    const dictionary = parseTheme(themeWithExtension.tokens).dictionary;
    expect(searchTokens(dictionary, 'капсула')).toMatchObject({ hits: [{ name: 'radius-theme-pill' }] });
    expect(searchTokens(dictionary, 'лента')).toMatchObject({ hits: [{ name: 'choice-theme-ribbon' }] });
  });

  it('формы приводятся до движка; слово запроса возвращается как написано', () => {
    expect(normalizeForms('Цвет кнопок на сайте')).toBe('цвет кнопки сайт');
    expect(queryWord('цвет иконок', 'иконк')).toBe('иконок');
    expect(queryWord('цвет', 'нет')).toBe('нет');
  });
});

describe('данные поиска', () => {
  it('каждая часть имени в search-words.json есть хотя бы в одном имени словаря', () => {
    const segments = new Set(dictionaryNames(platformDictionary).flatMap((name) => name.split('-')));
    const parts = Object.values(SEARCH_WORDS.parts).flat();
    expect(parts.filter((part) => !segments.has(part))).toEqual([]);
  });

  it('пять записей «не токен» — настройки секций', () => {
    expect(NOT_TOKENS.map((record) => record.id)).toEqual([
      'cart-type',
      'cookie-banner',
      'logo-image',
      'social-links',
      'section-scheme',
    ]);
  });

  it('копия движка MCP не правлена: sha256 тела совпадает с шапкой', () => {
    const source = readFileSync(new URL('../src/search/engine.ts', import.meta.url), 'utf8');
    const [header, body] = source.split('// ---- тело копии ниже ----\n');
    expect(header).toContain('Коммит: 4620d2eddc13f8f68dfc3c6d939c9ba98907637b');
    const declared = /sha256 тела: ([0-9a-f]{64})/.exec(header)?.[1];
    expect(createHash('sha256').update(body).digest('hex')).toBe(declared);
  });
});
