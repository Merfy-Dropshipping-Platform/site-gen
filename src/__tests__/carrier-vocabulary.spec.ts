import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Сторож словаря перевозчиков (план 117, шаг 5.2) — по образцу логистики
 * (backend/services/logistic/src/__tests__/carrier-vocabulary.spec.ts) и
 * orders (src/__tests__/carrier-vocabulary.spec.ts).
 *
 * Живые пути витрины — только `packages/theme-base` (общие блоки и раннтайм,
 * их рендерят все пять тем): способ доставки, тариф, трек и ссылка приходят с
 * бэкенда в общих полях заказа (data-model.md § orders), а конструктор видит
 * перевозчика через общий манифест (contracts/carrier-adapter.md), не через
 * имя. В theme-base нет папок-адаптеров перевозчиков (это дело logistic) —
 * поэтому «разрешённых мест» нет вовсе, только временные исключения ниже.
 * Старые шаблоны `templates/astro/*` и `packages/storefront` (React-чекаут,
 * вне объёма 117 — research.md 1.9) в сборку витрины не входят и сторожем не
 * читаются вовсе.
 *
 * Слово — всё, во что входит имя перевозчика: идентификатор, проп, атрибут,
 * путь импорта, текст комментария или строкового литерала. Временные
 * исключения — списком ниже: файл, ровно те слова, что в нём есть, и причина.
 * Новое слово в файле из списка — нарушение, как и в любом другом файле. Слово
 * или файл, которых больше нет, — устаревшее исключение: список надо
 * сократить. Тесты и заготовки к ним не проверяются.
 */
const SRC = join(__dirname, '../../packages/theme-base');

const CARRIER_WORD = /[\p{L}\p{N}_$]*(?:cdek|сдэк|pek|пэк|pecom)[\p{L}\p{N}_$]*/giu;

/** В theme-base нет папок-адаптеров перевозчиков (это дело logistic). */
const CARRIER_PLACES: readonly RegExp[] = [];

/** Не рабочий код: тесты, заготовки к ним и вспомогательные модули тестов. */
const TEST_CODE: readonly RegExp[] = [
  /\.spec\.ts$/,
  /\.test\.ts$/,
  /(^|\/)__fixtures__\//,
  /(^|\/)__tests__\//,
];

interface TemporaryException {
  /** Путь от packages/theme-base/. */
  file: string;
  words: string[];
  why: string;
}

const CDEK_LABEL_PROPS =
  'настройки блока CheckoutDeliveryMethod (cdekEnabled/cdekDoorLabel/cdekPvzLabel/' +
  'cdekPostamatLabel) — замена подписи СДЭК для 458 сайтов на проде, хранивших свой ' +
  'текст в ревизии до появления общего label из расчёта логистики (WORKLOG ' +
  '2026-09-30 «правка»; решение владельца «интерфейс не меняем», FR-013 спеки 117). ' +
  'Шаг 5.1 плана 117, вне объёма шага 5.2 — не трогаем. Уходят вместе со сторожем, ' +
  'когда сайты смигрируют на label из расчёта (шаг 7 плана 117).';
const CDEK_COMMENT_PROSE =
  'СДЭК/ПЭК в тексте комментария блока чекаута — описывает поведение (шаг 5.1 плана ' +
  '117, вне объёма шага 5.2), не имя в коде.';
const ORDER_DELIVERY_LEGACY =
  'старое поле заказа (cdekTariffName/cdekNumber) — запасной источник впереди общих ' +
  'deliveryTariffName/trackingNumber, для заказов, у которых общие поля ещё не ' +
  'заполнены (data-model.md § orders); уходит на шаге 7, когда старые колонки заказа ' +
  'удалят. СДЭК в историческом комментарии (владелец 26.09) объясняет причину ' +
  'появления файла, не имя в коде.';
const SUMMARY_LEGACY_FALLBACK =
  'старое поле сводки заказа /orders/:id/summary (cdekPickupPointAddress) и старая ' +
  'колонка заказа (cdekTariffName) — запасные источники впереди общих ' +
  'pickupPointAddress/deliveryTariffName; уходят на шаге 7, когда шлюз перестанет ' +
  'отдавать старые поля (contracts/http.md § витрина, до `+deliveryCarrierName`).';

const TEMPORARY: readonly TemporaryException[] = [
  {
    file: 'blocks/CartCheckoutButton/CartCheckoutButton.astro',
    words: ['СДЭК'],
    why: CDEK_COMMENT_PROSE,
  },
  {
    file: 'blocks/CartSummary/CartSummary.astro',
    words: ['СДЭК'],
    why: CDEK_COMMENT_PROSE,
  },
  {
    file: 'blocks/CheckoutDeliveryForm/CheckoutDeliveryForm.astro',
    words: ['ПЭК', 'СДЭК'],
    why: CDEK_COMMENT_PROSE,
  },
  {
    file: 'blocks/CheckoutDeliveryMethod/CheckoutDeliveryMethod.astro',
    words: [
      'CDEK',
      'cdek',
      'cdekDoorLabel',
      'cdekDoorLabelAttr',
      'cdekEnabled',
      'cdekError',
      'cdekLabelOverride',
      'cdekOverride',
      'cdekPostamatLabel',
      'cdekPostamatLabelAttr',
      'cdekPvzLabel',
      'cdekPvzLabelAttr',
      'cdek_door',
      'cdek_pickup',
      'pek',
      'pek_pickup',
      'ПЭК',
      'СДЭК',
    ],
    why: CDEK_LABEL_PROPS,
  },
  {
    file: 'blocks/CheckoutDeliveryMethod/CheckoutDeliveryMethod.puckConfig.ts',
    words: ['cdek', 'cdekDoorLabel', 'cdekEnabled', 'cdekPostamatLabel', 'cdekPvzLabel', 'СДЭК'],
    why: CDEK_LABEL_PROPS,
  },
  {
    file: 'blocks/CheckoutForm/CheckoutForm.astro',
    words: ['cdekDoorLabel', 'cdekEnabled', 'cdekPostamatLabel', 'cdekPvzLabel', 'СДЭК'],
    why: CDEK_LABEL_PROPS,
  },
  {
    file: 'blocks/CheckoutSection/CheckoutSection.astro',
    words: ['СДЭК'],
    why: CDEK_COMMENT_PROSE,
  },
  {
    file: 'blocks/CheckoutSubmit/CheckoutSubmit.astro',
    words: ['cdek_door', 'cdek_pickup', 'СДЭК'],
    why: CDEK_COMMENT_PROSE,
  },
  {
    file: 'blocks/OrderConfirmation/OrderConfirmation.astro',
    words: ['cdekPickupPointAddress', 'cdekTariffName'],
    why: SUMMARY_LEGACY_FALLBACK,
  },
  {
    file: 'runtime/order-delivery.ts',
    words: ['cdekNumber', 'cdekTariffName', 'СДЭК'],
    why: ORDER_DELIVERY_LEGACY,
  },
];

const wordsOf = (text: string): string[] => [...new Set(text.match(CARRIER_WORD) ?? [])].sort();

const matchesAny = (patterns: readonly RegExp[], file: string): boolean =>
  patterns.some((pattern) => pattern.test(file));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|astro)$/.test(entry.name) ? [relative(SRC, path).split(sep).join('/')] : [];
  });
}

const read = (file: string): string => readFileSync(join(SRC, file), 'utf8');

/** Рабочий код витрины (packages/theme-base) — то, что сторож читает. */
const guarded = sourceFiles(SRC).filter(
  (file) => !matchesAny(CARRIER_PLACES, file) && !matchesAny(TEST_CODE, file),
);

describe('Сторож словаря перевозчиков — рабочий код витрины (packages/theme-base)', () => {
  it('не называет перевозчиков; временные исключения — только слова из списка', () => {
    const allowed = new Map(TEMPORARY.map(({ file, words }) => [file, new Set(words)]));
    const violations = guarded
      .map((file) => [file, wordsOf(read(file)).filter((word) => !allowed.get(file)?.has(word))] as const)
      .filter(([, words]) => words.length > 0);

    expect(Object.fromEntries(violations)).toEqual({});
  });

  it('исключения не устарели: файл есть, каждое слово в нём ещё встречается', () => {
    const stale = TEMPORARY.flatMap(({ file, words }) => {
      const present = new Set(existsSync(join(SRC, file)) ? wordsOf(read(file)) : []);
      return words.filter((word) => !present.has(word)).map((word) => `${file}: ${word}`);
    });

    expect(stale).toEqual([]);
  });

  it('исключения — рабочий код витрины, каждый файл один раз и с причиной', () => {
    const files = TEMPORARY.map(({ file }) => file);

    expect(files.filter((file, index) => files.indexOf(file) !== index)).toEqual([]);
    expect(files.filter((file) => !guarded.includes(file))).toEqual([]);
    expect(TEMPORARY.filter(({ why, words }) => !why || words.length === 0)).toEqual([]);
  });

  it('сторож читает блоки и раннтайм, а тесты — нет', () => {
    expect(guarded).toEqual(
      expect.arrayContaining([
        'runtime/order-delivery.ts',
        'blocks/OrderConfirmation/OrderConfirmation.astro',
        'blocks/CheckoutDeliveryMethod/CheckoutDeliveryMethod.astro',
      ]),
    );
    expect(
      guarded.filter((file) => /\.spec\.ts$|\.test\.ts$|__fixtures__|__tests__/.test(file)),
    ).toEqual([]);
  });

  it('слово ловится в любом регистре, кириллицей и в составе имени; похожие слова — нет', () => {
    const sample =
      "const cdekX = 'Доставка СДЭК'; // сдэк, ПЭК, Pecom, PekModule, 117-pek; peek, spec";

    expect(wordsOf(sample)).toEqual(
      ['cdekX', 'СДЭК', 'сдэк', 'ПЭК', 'Pecom', 'PekModule', 'pek'].sort(),
    );
  });
});
