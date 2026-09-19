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
 *  - `node_modules` — чужие артефакты.
 */
const SKIP = [
  "ProductVariants",
  "CheckoutOrderSummary",
  "OrderConfirmation",
  "theme-contract/tokens/sources",
  "luna",
  "node_modules",
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
    // только разметка: комментарии тоже упоминают line-through
    if (!line.includes("line-through") || !line.includes("class")) continue;
    hits.push({ rel: relative(SITES_ROOT, f), line });
  }
}

const BAD =
  /--color-muted|--color-heading|--vanilla-dark|--vanilla-muted|text-\[#[0-9A-Fa-f]{3,8}\]/;

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

});
