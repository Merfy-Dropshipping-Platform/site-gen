import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Жалоба владельца 19.09 (все темы, секция «Товар»): «при выборе товара через
 * верхнее меню в сайдбаре отображает другой товар и при любом изменении
 * сбрасывает секцию на товар, который был в сайдбаре, а не выбран через меню».
 *
 * МЕХАНИКА. Целая страница превью выбор из меню уважает: контроллер берёт
 * `productIdOverride ?? defaultProductIdFromRevision(...)`, то есть параметр
 * важнее настройки блока, и кладёт результат в глобал
 * `__MERFY_DEFAULT_PRODUCT_ID__`.
 *
 * А ТОЧЕЧНЫЙ перерендер (`POST /preview/block`, которым конструктор обновляет
 * одну секцию при правке любого поля) про этот выбор не знал вовсе: в теле
 * запроса такого поля не было, рендер шёл строго по props секции — то есть по
 * настройке сайдбара. Поэтому любая правка возвращала «свой» товар.
 *
 * Лечение повторяет уже работающий приём для страниц коллекций: агент превью
 * возвращает глобал в теле запроса, контроллер применяет его приоритетнее
 * props — и только для секции «Товар», чтобы не подменять товар там, где это
 * поле значит другое.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const AGENT = readFileSync(resolve(SITES_ROOT, "src/services/preview.service.ts"), "utf-8");
const CTRL = readFileSync(resolve(SITES_ROOT, "src/controllers/preview.controller.ts"), "utf-8");

describe("точечный перерендер уважает выбор товара из меню", () => {
  it("агент читает глобал текущего товара", () => {
    expect(AGENT).toMatch(/function previewProductId\(\)/);
    expect(AGENT).toMatch(/__MERFY_DEFAULT_PRODUCT_ID__/);
  });

  it("читает ЛЕНИВО — глобал ставит другой инжектор, порядок не гарантирован", () => {
    const fn = AGENT.slice(AGENT.indexOf("function previewProductId"));
    // внутри функции, а не константой на уровне модуля агента
    expect(fn.slice(0, 200)).toMatch(/var p = window\.__MERFY_DEFAULT_PRODUCT_ID__/);
  });

  it("productId уезжает в КАЖДОМ точечном рендере, а не в одном из путей", () => {
    const sends = AGENT.split("\n").filter((l) => l.includes("blockType:") && l.includes("body: JSON.stringify"));
    expect(sends.length).toBeGreaterThanOrEqual(2);
    for (const line of sends) expect(line).toMatch(/productId: previewProductId\(\)/);
  });

  it("контракт запроса знает поле", () => {
    expect(CTRL).toMatch(/productId\?: string \| null;/);
  });

  it("выбор из меню применяется приоритетнее props", () => {
    expect(CTRL).toMatch(/propsWithContext\.productId = previewProductId/);
  });

  it("подмена ограничена секцией «Товар»", () => {
    expect(CTRL).toMatch(/\/\^product\$\/i\.test\(body\.blockType\)/);
  });

  it("пустая строка не считается выбором", () => {
    const block = CTRL.slice(CTRL.indexOf("const previewProductId ="));
    expect(block.slice(0, 300)).toMatch(/body\.productId\.trim\(\)/);
  });
});

describe("саботаж: гард ловит возврат прежнего поведения", () => {
  it("тело без productId — красный", () => {
    const body = "body: JSON.stringify({ blockType: t, props: p, themeId: x, collectionContext: c() }),";
    expect(/productId: previewProductId\(\)/.test(body)).toBe(false);
  });

  it("подмена без ограничения по типу блока — красный", () => {
    const code = "propsWithContext.productId = previewProductId;";
    expect(/\/\^product\$\/i\.test/.test(code)).toBe(false);
  });
});
