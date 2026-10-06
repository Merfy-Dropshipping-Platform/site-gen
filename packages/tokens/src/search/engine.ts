// Копия движка поиска merfy-mcp без изменений (design.md 8.8). Не править: тест сверяет sha256 тела с шапкой.
// Источник: backend/services/merfy-mcp/src/search.ts
// Коммит: 4620d2eddc13f8f68dfc3c6d939c9ba98907637b (16.09.2026)
// sha256 тела: 92c2d7a7d83e75cf713ab6e857924b813e562c05d6696c1cab64d04157eba2f7
// Сверка с источником: git -C <папка merfy-mcp> show 4620d2e:src/search.ts | diff - <(tail -n +7 src/search/engine.ts)
// ---- тело копии ниже ----
/**
 * Поиск операции по словам мерчанта.
 *
 * Прошлый поиск резал слова до четырёх знаков: «товаров» → «това», «настроить»
 * → «наст». От этого он был одновременно слеп и щедр — «настроить самовывоз» не
 * находило создание точки выдачи, а «настроить телепортацию товаров» выдавало
 * восемь операций про товары. Щедрость здесь хуже слепоты: правило 1 главы 4
 * требует отказать формулировкой главы 3, а агент вместо отказа предлагает
 * «похожее».
 *
 * Поэтому три вещи, и все три — данные, а не код:
 *
 * 1. **Лемма вместо обрезки.** Стеммер русского (Snowball, порт без
 *    зависимостей) сводит формы одного слова к одной основе: «товаров», «товары»
 *    и «товар» → `товар`, а «настроить» → `настро` и ничего лишнего не тянет.
 * 2. **Словарь мерчанта** — `knowledge/4-ai-rules/search-vocabulary.yaml`: чем
 *    человек называет сущности («скидка» → `discounts`) и действия («посмотреть»
 *    → `list`). Раньше этот словарь жил в коде сервера, хотя сервер своих знаний
 *    о платформе носить не должен.
 * 3. **Незнакомое слово — это отказ, а не повод угадывать.** Лемма, которой нет
 *    ни в одном имени, описании и словаре, означает, что мерчант спросил о том,
 *    чего у платформы нет. Ответ называет это слово и отправляет в
 *    `merfy_docs_search`; если запрос попал в запись главы 3 со статусом «нет» —
 *    ответ берётся из её поля `refusal`.
 */

/** Возможность, которой нет: чем мерчант её называет и как агент отказывает. */
export interface RefusalRecord {
  id: string;
  title: string;
  refusal: string;
  /** Фразы мерчанта, по которым запись узнаётся. Совпадение — по всем словам фразы. */
  asks: string[];
}

/** Словарь поиска из свода: стоп-слова, сущности, действия. */
export interface SearchVocabulary {
  stopWords: string[];
  /** Слово мерчанта → имена сущностей платформы (как они стоят в именах операций). */
  entities: Record<string, string[]>;
  /** Слово мерчанта → действия по убыванию предпочтения. */
  actions: Record<string, string[]>;
}

/** Операция глазами поиска — ровно то, что он умеет читать. */
export interface SearchableOperation {
  name: string;
  group: string;
  description: string;
}

export interface SearchHit<T extends SearchableOperation = SearchableOperation> {
  tool: T;
  score: number;
  /** Доля значимых слов запроса, которые операция покрыла. */
  coverage: number;
}

export type SearchOutcome<T extends SearchableOperation = SearchableOperation> =
  | { kind: 'hits'; hits: SearchHit<T>[] }
  /** Запрос попал в запись главы 3 со статусом «нет» — отвечать её формулировкой. */
  | { kind: 'refusal'; capability: RefusalRecord }
  /** В запросе слово, которого платформа не знает вовсе. */
  | { kind: 'unknown'; word: string }
  /** Слова знакомы, но ни одна операция не набрала веса. */
  | { kind: 'empty' };

// ── нормализация ─────────────────────────────────────────────────────────

const CYRILLIC = /[а-яё]/;

/**
 * Слова текста: «ё» приводится к «е» (мерчант пишет и так, и так), разделителем
 * считается всё, кроме букв и цифр, — включая подчёркивание, иначе
 * `merfy_orders_list` остаётся одним словом и имена перестают различаться.
 */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}\p{N}]+/u)
    // Двухбуквенные — это предлоги и союзы («на», «по», «из»). Смысла они не
    // несут, зато встречаются в описаниях: как значимые слова они и портили
    // покрытие, и тянули в выдачу случайное.
    .filter((word) => word.length >= 3);
}

const VOWELS = 'аеиоуыэюя';
const isVowel = (ch: string): boolean => VOWELS.includes(ch);

/** Область RV: всё после первой гласной. Все окончания ищутся только в ней. */
function regionRV(word: string): number {
  for (let i = 0; i < word.length; i += 1) if (isVowel(word[i]!)) return i + 1;
  return word.length;
}

/** Область R2: после второй пары «гласная + согласная». */
function regionR2(word: string): number {
  const after = (from: number): number => {
    for (let i = from; i < word.length - 1; i += 1) {
      if (isVowel(word[i]!) && !isVowel(word[i + 1]!)) return i + 2;
    }
    return word.length;
  };
  return after(after(0));
}

/**
 * Деепричастия — только однозначные формы.
 *
 * Эталонный Snowball режет ещё «в», «ив», «ыв», и на этом ломается: «отзыв» он
 * превращает в «отз», а «отзывы» — в «отзыв», и две формы одного слова
 * перестают сходиться. Мерчант деепричастиями магазином не командует, а
 * существительных на «-ыв»/«-ив» много (отзыв, призыв, актив), поэтому
 * короткие окончания убраны намеренно.
 */
const PERFECTIVE_GERUND_1 = ['вшись', 'вши'];
const PERFECTIVE_GERUND_2 = ['ившись', 'ывшись', 'ивши', 'ывши'];
const ADJECTIVE = [
  'ими', 'ыми', 'его', 'ого', 'ему', 'ому', 'ее', 'ие', 'ые', 'ое', 'ей', 'ий', 'ый', 'ой',
  'ем', 'им', 'ым', 'ом', 'их', 'ых', 'ую', 'юю', 'ая', 'яя', 'ою', 'ею',
];
const PARTICIPLE_1 = ['ющ', 'ем', 'нн', 'вш', 'щ'];
const PARTICIPLE_2 = ['ивш', 'ывш', 'ующ'];
const REFLEXIVE = ['ся', 'сь'];
const VERB_1 = ['ете', 'йте', 'нно', 'ла', 'на', 'ли', 'ем', 'ло', 'но', 'ет', 'ют', 'ны', 'ть', 'ешь', 'й', 'л', 'н'];
const VERB_2 = ['ейте', 'уйте', 'ила', 'ыла', 'ена', 'ены', 'ить', 'ыть', 'ишь', 'ит', 'ыт', 'ую', 'ю'];
const NOUN = [
  'иями', 'ями', 'ами', 'иях', 'ией', 'ием', 'иям', 'иев', 'ях', 'ах', 'ов', 'ев', 'ие', 'ье',
  'еи', 'ии', 'ей', 'ой', 'ий', 'ям', 'ем', 'ам', 'ом', 'ию', 'ью', 'ия', 'ья', 'а', 'е', 'и',
  'й', 'о', 'у', 'ы', 'ь', 'ю', 'я',
];
const DERIVATIONAL = ['ость', 'ост'];
const SUPERLATIVE = ['ейше', 'ейш'];

/** Отрезать первое подошедшее окончание из списка; `undefined` — ни одно не подошло. */
function cut(word: string, rv: number, endings: readonly string[], precededBy?: string): string | undefined {
  for (const ending of endings) {
    if (!word.endsWith(ending)) continue;
    const at = word.length - ending.length;
    if (at < rv) continue;
    if (precededBy !== undefined) {
      const before = word[at - 1];
      if (before === undefined || !precededBy.includes(before)) continue;
    }
    return word.slice(0, at);
  }
  return undefined;
}

/**
 * Основа русского слова (Snowball «russian», порт без зависимостей).
 *
 * Латиница возвращается как есть: имена операций английские, и стеммер русского
 * им только навредит.
 */
export function stem(word: string): string {
  if (!CYRILLIC.test(word)) return word;
  let w = word;
  const rv = regionRV(w);
  const r2 = regionR2(w);

  // Шаг 1: деепричастие, иначе возвратность + прилагательное/причастие/глагол/существительное.
  const gerund = cut(w, rv, PERFECTIVE_GERUND_2) ?? cut(w, rv, PERFECTIVE_GERUND_1, 'ая');
  if (gerund !== undefined) {
    w = gerund;
  } else {
    w = cut(w, rv, REFLEXIVE) ?? w;
    const adjective = cut(w, rv, ADJECTIVE);
    if (adjective !== undefined) {
      w = cut(adjective, rv, PARTICIPLE_2) ?? cut(adjective, rv, PARTICIPLE_1, 'ая') ?? adjective;
    } else {
      const verb = cut(w, rv, VERB_2) ?? cut(w, rv, VERB_1, 'ая');
      w = verb ?? cut(w, rv, NOUN) ?? w;
    }
  }

  // Шаг 2: хвостовое «и».
  if (w.endsWith('и') && w.length - 1 >= rv) w = w.slice(0, -1);
  // Шаг 3: словообразовательный суффикс в R2.
  w = cut(w, r2, DERIVATIONAL) ?? w;
  // Шаг 4: двойное «н», превосходная степень, мягкий знак.
  if (w.endsWith('нн')) w = w.slice(0, -1);
  else {
    const superlative = cut(w, rv, SUPERLATIVE);
    if (superlative !== undefined) w = superlative.endsWith('нн') ? superlative.slice(0, -1) : superlative;
    else if (w.endsWith('ь')) w = w.slice(0, -1);
  }
  return w;
}

/** Основы всех слов текста. */
export function lemmas(text: string): string[] {
  return words(text).map(stem);
}

// ── опечатки ─────────────────────────────────────────────────────────────

/**
 * Расстояние Дамерау — Левенштейна, обрезанное по пределу.
 *
 * Мерчант печатает «промакод» и «самавывоз»: одна буква. Поиск, который от
 * этого отказывает, в жизни не работает, а полноценная нечёткая выдача здесь
 * не нужна — достаточно одной правки.
 */
export function editDistance(a: string, b: string, limit = 1): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i += 1) rows.push(new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) rows[i]![0] = i;
  for (let j = 0; j <= b.length; j += 1) rows[0]![j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = value;
      best = Math.min(best, value);
    }
    // Вся строка хуже предела — дальше не станет лучше.
    if (best > limit) return limit + 1;
  }
  return rows[a.length]![b.length]!;
}

/** Опечатку исправляем только в словах, где одна буква не меняет смысла целиком. */
const MIN_FUZZY_LENGTH = 5;

// ── индекс ───────────────────────────────────────────────────────────────

interface IndexedOperation<T extends SearchableOperation> {
  tool: T;
  /** Сегменты имени без `merfy`: `products`, `variants`, `sync`, `update`. */
  segments: string[];
  /** Последний сегмент — действие операции. */
  action: string;
  /** Основы слов описания. */
  described: Set<string>;
}

export interface SearchIndex<T extends SearchableOperation = SearchableOperation> {
  operations: IndexedOperation<T>[];
  vocabulary: SearchVocabulary;
  refusals: RefusalRecord[];
  /** Стоп-слова основами. */
  stop: Set<string>;
  /** Слово мерчанта (основой) → сущности платформы. */
  entities: Map<string, string[]>;
  /** Слово мерчанта (основой) → действия по предпочтению. */
  actions: Map<string, string[]>;
  /** Всё, что платформа вообще знает: сегменты имён, слова описаний, ключи словаря. */
  known: Set<string>;
  /** Фразы отказов основами. */
  refusalAsks: { record: RefusalRecord; phrases: string[][] }[];
}

const asList = (value: string | string[]): string[] => (Array.isArray(value) ? value : [value]);

export function buildSearchIndex<T extends SearchableOperation>(
  tools: readonly T[],
  vocabulary: SearchVocabulary,
  refusals: readonly RefusalRecord[] = [],
): SearchIndex<T> {
  const operations: IndexedOperation<T>[] = tools.map((tool) => {
    const segments = tool.name.split('_').filter((part) => part && part !== 'merfy');
    return {
      tool,
      segments,
      action: segments[segments.length - 1] ?? '',
      described: new Set(lemmas(tool.description)),
    };
  });

  // Ключи словаря проходят ту же нормализацию, что и запрос: иначе «отчёт» в
  // словаре и «отчет» в запросе — два разных слова, и поиск принимается
  // «исправлять опечатку» в слове, которое сам же и знает.
  const lemma = (word: string): string => lemmas(word)[0] ?? word;
  const stop = new Set(vocabulary.stopWords.map(lemma));
  const entities = new Map<string, string[]>();
  for (const [word, value] of Object.entries(vocabulary.entities)) entities.set(lemma(word), asList(value));
  const actions = new Map<string, string[]>();
  for (const [word, value] of Object.entries(vocabulary.actions)) actions.set(lemma(word), asList(value));

  const known = new Set<string>();
  for (const operation of operations) {
    for (const segment of operation.segments) known.add(segment);
    for (const word of operation.described) known.add(word);
  }
  for (const word of entities.keys()) known.add(word);
  for (const word of actions.keys()) known.add(word);
  for (const word of stop) known.add(word);

  const refusalAsks = refusals.map((record) => ({
    record,
    phrases: record.asks.map((ask) => lemmas(ask)).filter((phrase) => phrase.length > 0),
  }));

  return { operations, vocabulary, refusals: [...refusals], stop, entities, actions, known, refusalAsks };
}

// ── разбор запроса ───────────────────────────────────────────────────────

/** Вес совпадения: сущность в имени сильнее слова в описании — оно есть почти везде. */
const WEIGHT_NAME = 6;
const WEIGHT_DESCRIPTION = 2;
/** Первое предпочтение действия, второе, третье… */
const ACTION_WEIGHTS = [3, 2, 1];
/**
 * Первое значимое слово — главное: «промокод для покупателей» — это про
 * промокод, а покупатели здесь уточнение. Без этого запрос уходил к списку
 * покупателей, где «покупатель» стоит и в имени, и в описании.
 */
const MAIN_WORD_BONUS = 1.5;
/** Меньше половины значимых слов — это не находка, а совпадение по одному слову из трёх. */
const MIN_COVERAGE = 0.5;

export interface ParsedQuery {
  /** Значимые слова, которые платформа знает: всё, кроме стоп-слов и действий. */
  content: string[];
  /** Действия, о которых просил мерчант, по убыванию предпочтения. */
  actions: string[];
  /**
   * Главное слово запроса, которого платформа не знает вовсе.
   *
   * Незнакомое слово считается приговором **только на первом месте**. «Настроить
   * телепортацию товаров» — это запрос про телепортацию, и находки про товары
   * здесь ложь. А «поставить скидку 20 процентов» — запрос про скидку, и
   * незнакомые «проценты» на месте уточнения его не отменяют: правило, которое
   * валит запрос от любого незнакомого слова, отказывает половину рабочих.
   */
  unknown?: string;
  /** Значимые слова, которых платформа не знает и которые ушли в уточнения. */
  ignored: string[];
  /** Что исправлено как опечатка: было → стало. */
  corrections: [string, string][];
}

/** Исправление опечатки по собственному словарю платформы. */
function correct(index: SearchIndex, word: string): string | undefined {
  if (word.length < MIN_FUZZY_LENGTH || !CYRILLIC.test(word)) return undefined;
  let best: string | undefined;
  for (const candidate of index.known) {
    if (candidate.length < MIN_FUZZY_LENGTH || !CYRILLIC.test(candidate)) continue;
    if (Math.abs(candidate.length - word.length) > 1) continue;
    if (editDistance(word, candidate) > 1) continue;
    if (best === undefined || candidate.length < best.length) best = candidate;
  }
  return best;
}

export function parseQuery(index: SearchIndex, query: string): ParsedQuery {
  const content: string[] = [];
  const ignored: string[] = [];
  const actions: string[] = [];
  const corrections: [string, string][] = [];
  /** Значимые слова по порядку — главное из них стоит первым. */
  let first: { word: string; known: boolean } | undefined;

  for (const raw of lemmas(query)) {
    let word = raw;
    if (!index.known.has(word)) {
      const fixed = correct(index, word);
      if (fixed !== undefined) {
        corrections.push([word, fixed]);
        word = fixed;
      }
    }
    if (index.stop.has(word)) continue;
    const asAction = index.actions.get(word);
    if (asAction) {
      for (const action of asAction) if (!actions.includes(action)) actions.push(action);
      continue;
    }
    const known = index.known.has(word);
    first ??= { word, known };
    if (!known) {
      if (!ignored.includes(word)) ignored.push(word);
      continue;
    }
    if (!content.includes(word)) content.push(word);
  }

  const unknown = first && !first.known ? first.word : undefined;
  return { content, ignored, actions, corrections, ...(unknown === undefined ? {} : { unknown }) };
}

/** Запрос попал в запись главы 3 со статусом «нет»? Совпадение — по всем словам фразы. */
export function matchRefusal(index: SearchIndex, query: string): RefusalRecord | undefined {
  const asked = new Set(lemmas(query));
  for (const { record, phrases } of index.refusalAsks) {
    for (const phrase of phrases) {
      if (phrase.every((word) => asked.has(word))) return record;
    }
  }
  return undefined;
}

// ── поиск ────────────────────────────────────────────────────────────────

export function search<T extends SearchableOperation>(
  index: SearchIndex<T>,
  query: string,
  limit = 8,
): SearchOutcome<T> {
  // Глава 3 идёт первой: о возможности, которой нет, агент обязан сказать
  // словами отказа, а не показать «что-то похожее».
  const refusal = matchRefusal(index, query);
  if (refusal) return { kind: 'refusal', capability: refusal };

  const parsed = parseQuery(index, query);
  if (parsed.unknown !== undefined) return { kind: 'unknown', word: parsed.unknown };
  if (parsed.content.length === 0 && parsed.actions.length === 0) return { kind: 'empty' };

  const hits: SearchHit<T>[] = [];
  for (const operation of index.operations) {
    const segments = new Set(operation.segments);
    let score = 0;
    let covered = 0;

    for (const [position, word] of parsed.content.entries()) {
      const meanings = index.entities.get(word) ?? [];
      const inName = segments.has(word) || meanings.some((meaning) => segments.has(meaning));
      const inText = operation.described.has(word);
      const weight = position === 0 ? MAIN_WORD_BONUS : 1;
      if (inName) score += WEIGHT_NAME * weight;
      if (inText) score += WEIGHT_DESCRIPTION * weight;
      if (inName || inText) covered += 1;
    }

    for (const [position, action] of parsed.actions.entries()) {
      if (operation.action === action || segments.has(action)) {
        score += ACTION_WEIGHTS[Math.min(position, ACTION_WEIGHTS.length - 1)]!;
        break;
      }
    }

    const coverage = parsed.content.length === 0 ? 1 : covered / parsed.content.length;
    if (score === 0 || coverage < MIN_COVERAGE) continue;
    hits.push({ tool: operation.tool, score, coverage });
  }

  if (hits.length === 0) return { kind: 'empty' };

  hits.sort(
    (a, b) =>
      b.score - a.score ||
      b.coverage - a.coverage ||
      // При равном счёте выигрывает более короткое имя: оно общее, а длинное —
      // частный случай («orders_list» полезнее, чем «orders_cdek_label_list»).
      a.tool.name.length - b.tool.name.length,
  );
  return { kind: 'hits', hits: hits.slice(0, limit) };
}
