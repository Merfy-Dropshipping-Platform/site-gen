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
    for (const line of sends) expect(line).toMatch(/productId: productIdForRender\(/);
  });

  /**
   * РЕГРЕССИЯ 20.09, поймана замером соседнего агента на стенде Bloom Pilot:
   * `props.productId = A` + `body.productId = B` давало товар B, то есть
   * глобал побеждал свежую правку панели «Выбор товара» — переключение товара
   * в сайдбаре не меняло ничего до перезагрузки iframe.
   *
   * Глобал — снимок на момент ЗАГРУЗКИ страницы, поэтому безусловным он быть
   * не может. Различаем по diff, который агент и так считает: правят сам
   * productId → авторитетны props; правят другое поле → держим товар из меню.
   */
  it("правка самого «Выбора товара» сильнее снимка из меню", () => {
    const fn = AGENT.slice(AGENT.indexOf("function productIdForRender"));
    expect(fn.slice(0, 260)).toMatch(/oldP\.productId !== newP\.productId/);
    expect(fn.slice(0, 260)).toMatch(/return undefined;/);
  });

  it("правка другого поля оставляет товар из меню", () => {
    const fn = AGENT.slice(AGENT.indexOf("function productIdForRender"));
    expect(fn.slice(0, 300)).toMatch(/return previewProductId\(\);/);
  });

  it("очередь перерисовки сверяется с запомненными пропами блока", () => {
    expect(AGENT).toMatch(/productIdForRender\(LAST_PROPS\[job\.id\], job\.props\)/);
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
    expect(/productId: productIdForRender\(/.test(body)).toBe(false);
  });

  it("безусловный глобал (без diff) — красный", () => {
    const naive = "function productIdForRender(o, n) { return previewProductId(); }";
    expect(/productId !== /.test(naive)).toBe(false);
  });

  it("подмена без ограничения по типу блока — красный", () => {
    const code = "propsWithContext.productId = previewProductId;";
    expect(/\/\^product\$\/i\.test/.test(code)).toBe(false);
  });
});
