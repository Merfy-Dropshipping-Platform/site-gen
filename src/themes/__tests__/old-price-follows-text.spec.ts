import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Жалоба владельца 19.09: «цвет скидки должен быть как у текста, а не браться
 * из заголовка», затем «надо ещё также по цветам — сделать для скидки и
 * контролов +/-».
 *
 * ПОЧЕМУ СПЛОШНОЙ ОБХОД, А НЕ СПИСОК. Одна и та же зачёркнутая цена рисуется
 * во МНОГИХ местах, и три волны подряд «нашёл все» оказывались неполными —
 * каждый раз недостачу показывал только живой замер витрины после выкатки:
 *
 *   1-я волна — корзина (`CartBody`, `CartSection`, дровер `lib/cart.ts`);
 *   2-я волна — каталоги, карточки товара, избранное;
 *   3-я волна — гидрация карточек (`lib/storefront-hydrate.ts`);
 *   4-я волна — секция «Товар» на главной, страницы товара, галерея.
 *
 * Поэтому гард не перечисляет файлы, а ОБХОДИТ все исходники пяти тем и их
 * пакетов. Новый файл с зачёркнутой ценой попадает под охрану автоматически.
 *
 * 25.09 (партия тестера №3) — гард ловил не всё, что сам обещал:
 *  1) `]/NN` и `/0.NN` внутри rgb(), `opacity-` — модификаторы приглушения
 *     проходили мимо BAD (владелец 19.09 явно запретил приглушение, а не
 *     только смену переменной): ProductPrice.astro (`/60`), theme-base
 *     PopularProducts.classes.ts (`/75`);
 *  2) фильтр требовал слово `class` в строке — карты классов (`X.classes.ts`)
 *     пишут литерал БЕЗ этого слова (это имя ключа объекта, не JSX-атрибут) и
 *     были невидимы гарду целиком: theme-satin/theme-base PopularProducts,
 *     theme-base Catalog.classes.ts. Фильтр теперь отсекает КОММЕНТАРИИ, а не
 *     требует слово `class`.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "vanilla", "flux"] as const;

/**
 * Исключения — с обоснованием на каждое:
 *  - `ProductVariants` — там `line-through` помечает НЕДОСТУПНЫЙ вариант, а не цену;
 *  - чекаут и подтверждение заказа — типографика зафиксирована владельцем 16.09;
 *  - `theme-contract/tokens/sources/*` — справочные выжимки для реестра токенов,
 *    на витрине не рендерятся; правка там сдвинула бы контракт, а не вид;
 *  - `luna` — вне объёма по AGENTS.md;
 *  - `node_modules` — чужие артефакты;
 *  - `__tests__` — тестовый код (напр. `expect(x).toContain('line-through')`),
 *    не разметка; после снятия требования слова `class` (25.09) без этого
 *    исключения такие строки ложно попадали в обход;
 *  - vanilla `lib/header-search-view.ts` — старая цена в ШТОРКЕ (бургер-меню)
 *    красится ТОЙ ЖЕ переменной `textCls`, что имя и цена рядом (`--vanilla-dark`
 *    палитры шторки), НЕ `--color-text` схемы шапки: на светлом полотне шторки
 *    роль «Текст» шапки дала бы белый текст на белом (см. docstring файла).
 *    Панельная (не-шторка) ветка того же файла — `--color-text`, как везде.
 *  - `theme-satin/blocks/PopularProducts/PopularProducts.classes.ts` — экспорт
 *    `PopularProductsClasses` НЕ импортируется НИГДЕ (проверено 25.09: ни
 *    `theme-satin/index.ts`, ни один registry) — мёртвый код, satin рисует
 *    «Популярное» site-level секцией `themes/satin/.../PopularProducts.astro`;
 *  - `theme-base/blocks/Catalog/Catalog.classes.ts` — `productCardPriceCompare`
 *    НЕ используется ни одним `Catalog.astro` живых тем (проверено 25.09:
 *    у каждой темы своя карточка со своими литералами, все уже `--color-text`);
 *    сам theme-base/Catalog.astro не стоит в registry ни одной темы.
 */
const SKIP = [
  "ProductVariants",
  "CheckoutOrderSummary",
  "OrderConfirmation",
  "theme-contract/tokens/sources",
  "luna",
  "node_modules",
  "__tests__",
  "vanilla/src/lib/header-search-view",
  "theme-satin/blocks/PopularProducts/PopularProducts.classes",
  "theme-base/blocks/Catalog/Catalog.classes",
];

function walk(dir: string, acc: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (SKIP.some((s) => full.includes(s))) continue;
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (full.endsWith(".astro") || full.endsWith(".ts")) acc.push(full);
  }
}

function sources(): string[] {
  const acc: string[] = [];
  for (const t of THEMES) {
    walk(resolve(SITES_ROOT, "themes", t, "src"), acc);
    walk(resolve(SITES_ROOT, "packages", `theme-${t}`), acc);
  }
  walk(resolve(SITES_ROOT, "packages", "theme-base"), acc);
  return [...new Set(acc)].sort();
}

type Hit = { rel: string; line: string };

const hits: Hit[] = [];
for (const f of sources()) {
  const src = readFileSync(f, "utf-8");
  if (!src.includes("line-through")) continue;
  for (const line of src.split("\n")) {
    // Только разметка: комментарии тоже упоминают line-through. Раньше строка
    // должна была ЕЩЁ содержать слово `class` — это отсекало комментарии, но
    // заодно ослепляло гард к картам классов (X.classes.ts): там литерал —
    // значение объекта, слова `class` в строке нет вовсе (25.09). Отсекаем
    // сами комментарии (// и продолжение блочных /* … * … */), а не требуем
    // конкретное слово.
    const trimmed = line.trim();
    const isComment = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
    if (!line.includes("line-through") || isComment) continue;
    hits.push({ rel: relative(SITES_ROOT, f), line });
  }
}

// 25.09: раньше BAD не ловил ПРИГЛУШЕНИЕ той же переменной --color-text —
// модификатор непрозрачности Tailwind после закрывающей `]` (`]/60`), внутри
// rgb() как `/0.NN` (доля от 0 до 1) и явную утилиту `opacity-`. Решение
// владельца 19.09 — «без приглушения», не «другая переменная».
const BAD =
  /--color-muted|--color-heading|--vanilla-dark|--vanilla-muted|text-\[#[0-9A-Fa-f]{3,8}\]|\]\/\d+|\/0\.\d+|\bopacity-\d/;

describe("зачёркнутая старая цена везде следует тексту схемы", () => {
  it("обход нашёл мишени во всех пяти темах", () => {
    expect(hits.length).toBeGreaterThanOrEqual(30);
    for (const t of THEMES) {
      expect(hits.some((h) => h.rel.includes(t))).toBe(true);
    }
  });

  it("ни одна зачёркнутая цена не красится серым, заголовком или литералом", () => {
    const bad = hits.filter((h) => BAD.test(h.line));
    const report = bad
      .map((h) => `  ${h.rel}\n    ${h.line.trim().slice(0, 160)}`)
      .join("\n");
    expect(
      bad.length === 0 ? "" : `НАРУШЕНИЙ: ${bad.length}\n${report}`,
    ).toBe("");
  });

  /**
   * ПРОЗРАЧНОСТЬ СНЯТА 19.09. Я добавил её по Shopify Dawn
   * (`rgba(var(--color-foreground), 0.75)`), владелец этого не просил, и на
   * живой схеме мерчанта (текст белый, фон светло-голубой, контраст 1.97)
   * приглушённая цена пропала с экрана совсем. Требование владельца дословно:
   * «нужно только настройку цветовых схем поправить, чтобы цвет в заданных
   * блоках красился от настройки ТЕКСТА, а не заголовка». Значит — ровно
   * `--color-text`, без приглушения.
   */

  it("каждая зачёркнутая цена несёт --color-text", () => {
    const missing = hits.filter((h) => !/--color-text/.test(h.line));
    const report = missing
      .map((h) => `  ${h.rel}\n    ${h.line.trim().slice(0, 160)}`)
      .join("\n");
    expect(
      missing.length === 0 ? "" : `БЕЗ --color-text: ${missing.length}\n${report}`,
    ).toBe("");
  });
});

describe("саботаж: гард ловит откат цвета", () => {
  it("приглушённый серый — красный", () => {
    expect(BAD.test(`class="text-[rgb(var(--color-muted,153_153_153))] line-through"`)).toBe(true);
  });
  it("алиас заголовка — красный", () => {
    expect(BAD.test(`class="text-[var(--vanilla-dark)] line-through"`)).toBe(true);
  });
  it("литерал — красный", () => {
    expect(BAD.test(`class="text-[#999999] line-through"`)).toBe(true);
  });

  it("приглушение той же переменной ]/NN — красный (25.09, ProductPrice.astro /60)", () => {
    expect(BAD.test(`'text-[rgb(var(--color-text))]/60 line-through'`)).toBe(true);
  });

  it("приглушение /0.NN внутри rgb — красный (25.09, PopularProducts.classes.ts /75)", () => {
    expect(
      BAD.test(
        `'[font-family:var(--font-body)] text-[12px] leading-[15px] text-[rgb(var(--color-text))]/75 line-through'`,
      ),
    ).toBe(true);
  });

  it("утилита opacity- — красный", () => {
    expect(BAD.test(`class="text-[rgb(var(--color-text))] opacity-50 line-through"`)).toBe(true);
  });

  it("не приглушение — зелёный (ровно --color-text, без модификатора)", () => {
    expect(BAD.test(`class="text-[rgb(var(--color-text,0_0_0))] line-through"`)).toBe(false);
  });

  it("строка карты классов БЕЗ слова class видна обходу (25.09)", () => {
    const src =
      "export const X = {\n  cardOldPrice: 'text-[rgb(var(--color-muted))] line-through',\n};\n";
    const lines = src.split("\n").filter((line) => {
      const trimmed = line.trim();
      const isComment = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
      return line.includes("line-through") && !isComment;
    });
    expect(lines.length).toBe(1);
    expect(BAD.test(lines[0])).toBe(true);
  });

  it("комментарий про line-through — не попадает в обход", () => {
    const src = "// старая цена: line-through, цвет текста\nconst x = 1;\n";
    const lines = src.split("\n").filter((line) => {
      const trimmed = line.trim();
      const isComment = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
      return line.includes("line-through") && !isComment;
    });
    expect(lines.length).toBe(0);
  });
});
