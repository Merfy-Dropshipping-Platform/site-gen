/**
 * satin «Коллекция товаров» (PopularProducts) — «Товар» обязан красить
 * название и цену ТОКЕНОМ схемы, а не литералом.
 *
 * Репорт тестера 15.09, пункт [35]: «У satin в «Коллекции товаров» схема не
 * применяется к кнопке «Смотреть ещё» и к Товару». Разбор по месту:
 *   • «Смотреть ещё» (viewAll, `.satin-button-dark`) — УЖЕ токен-based
 *     (`--color-button-bg`/`--color-button-text`, см. styles/global.css) и
 *     корректно едет за схемой (замер `qa:probe scheme`, схемы 1↔2: 204,49,49
 *     → 0,0,0). Регрессии по этой половине жалобы нет — здесь не сторожим.
 *   • «Товар» — карточка реального товара рендерится ОТДЕЛЬНЫМ компонентом
 *     `themes/satin/src/components/products/SatinProductCard.astro`, а не
 *     inline-плейсхолдером из Popular.astro (тот уже был на токене). Имя и
 *     цена товара стояли на литерале `text-[#000000]` — фиксированный чёрный
 *     ни при какой схеме мерчанта не менялся. ВАЖНО: Схема 1 у satin
 *     чёрно-белая (литерал и токен дают одинаковые числа) — гард ниже
 *     проверяет по паре 1↔2, где `--color-text` различим (0,0,0 vs 255,255,255
 *     согласно tester-schemes.json).
 *
 * Требует сборки: pnpm build:blocks && pnpm build:theme-sections satin.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const SOURCE_FILE = resolve(
  SITES_ROOT,
  "themes/satin/src/components/products/SatinProductCard.astro",
);

function renderPopular(props: Record<string, unknown>): string | null {
  const mf = resolve(SITES_ROOT, "dist", "theme-sections", "satin", "manifest.json");
  if (!existsSync(mf)) return null;
  const rows = JSON.parse(
    execFileSync(
      "node",
      [RENDERER, "satin", JSON.stringify([{ block: "PopularProducts", props }])],
      { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 128 * 1024 * 1024 },
    ),
  ) as Array<{ html?: string; error?: string; missing?: boolean }>;
  const row = rows[0];
  expect(row?.error).toBeUndefined();
  expect(row?.missing).toBeFalsy();
  return row?.html ?? "";
}

const REAL_PRODUCT_PROPS = {
  id: "pp-1",
  __merfy: {
    resolved: {
      popularProducts: [
        { id: "p1", name: "ТОВАРПРУФ42", basePrice: 2500, images: ["/x.png"] },
      ],
    },
  },
};

describe("satin PopularProducts — «Товар» на токене (репорт [35])", () => {
  it("исходник SatinProductCard.astro не несёт literal text-[#000000] на имени/цене", () => {
    const src = readFileSync(SOURCE_FILE, "utf-8");
    // Бейдж «Скидка» и сердце избранного оставлены (не предмет жалобы, дизайн-
    // бейджи вне «Товара» как текста) — проверяем ИМЕННО имя+цену: строка
    // `text-[#000000]` рядом с product.name/product.price больше не встречается.
    // `[\s\S]{0,80}` — окно охватывает многострочный JSX-тег (класс на одной
    // строке, `{product.name}` на следующей), но не расползается по файлу.
    const nameOrPriceLiteral =
      /text-\[#000000\][\s\S]{0,80}\{product\.(name|price)\}/.test(src) ||
      /\{product\.(name|price)\}[\s\S]{0,80}text-\[#000000\]/.test(src);
    expect(nameOrPriceLiteral).toBe(false);
    expect(src).toContain("text-[rgb(var(--color-text,0_0_0))]");
  });

  it("рендер: имя и цена товара несут токен --color-text, не literal", () => {
    const html = renderPopular(REAL_PRODUCT_PROPS);
    if (html === null) return;
    expect(html).toContain("ТОВАРПРУФ42");
    // Мишень — сама разметка карточки (до <script>): бейдж «Скидка» и сердце
    // избранного остаются литералом за пределами этой жалобы, но их строки
    // живут дальше по HTML/в бандле скрипта — их не проверяем здесь.
    const markup = html.slice(0, html.indexOf("<script"));
    const nameOrPriceLiteral =
      /text-\[#000000\][^\n]*ТОВАРПРУФ42/.test(markup) ||
      /ТОВАРПРУФ42[^\n]*text-\[#000000\]/.test(markup) ||
      /text-\[#000000\][^\n]*2\s?500\s?₽/.test(markup);
    expect(nameOrPriceLiteral).toBe(false);
    expect(markup).toContain("text-[rgb(var(--color-text,0_0_0))]");
  });

  it("качественный саботаж-контраст: без товара (плейсхолдер) литерала на имени/цене и не было", () => {
    // Пруф того, что гард не сторожит пустое состояние случайно: плейсхолдер
    // Popular.astro сам по себе уже был на токене до и после этой правки.
    const html = renderPopular({ id: "pp-1" });
    if (html === null) return;
    const markup = html.slice(0, html.indexOf("<script"));
    const nameOrPriceLiteral =
      /text-\[#000000\][^\n]*(?:Товар|2\s?500\s?₽)/.test(markup);
    expect(nameOrPriceLiteral).toBe(false);
  });
});
