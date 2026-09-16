import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Баг владельца 16.09 (дословно): «Баг тема Bloom — … применяет на себя
 * цветовую схему корзины для сайдбара применяет на себя». Расшифровка:
 * боковая панель корзины (дровер) в bloom неправильно тянет на себя
 * цветовую схему СЕКЦИИ «Корзина» страницы /cart; должно быть как в rose.
 *
 * Механизм бага (замер `resolveCartDrawerGlobals`,
 * src/themes/cart-drawer-contract.ts): без явной настройки «Настройки темы →
 * Корзина → Цветовая схема» резолвер падает на ЗАПАСНОЙ ВАРИАНТ — colorScheme
 * блока CartBody/CartSummary самой секции «Корзина» — и кладёт его в окно как
 * `__MERFY_CART_DRAWER_SCHEME__`. Раньше bloom's Layout.astro читал этот
 * глобал и подменял им class="color-scheme-N" на корне дровера — то есть
 * мерчант красит страницу корзины, а дровер молча перекрашивается следом.
 *
 * У rose такого читателя нет вовсе (эталон) — её дровер красится ТОЛЬКО
 * через tokens.css правило `[data-nt$="cart-drawer"]` (cartDrawerSchemeRule),
 * которое читает ИСКЛЮЧИТЕЛЬНО явную настройку cartDrawerScheme, без
 * секционного фолбэка. Фикс — убрать в bloom's Layout.astro JS-ветку,
 * которая накладывала classList из __MERFY_CART_DRAWER_SCHEME__: этот канал
 * был ВТОРЫМ, лишним (валидный явный сценарий и так работает через
 * tokens.css) и единственным источником бага.
 *
 * Сторож держит ИСХОДНИК (а не браузерный замер) — быстрее и не зависит от
 * playwright/сети. Живой замер описан в отчёте агента (b40-bloom).
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");

function bloomLayoutSource(): string {
  return readFileSync(
    resolve(SITES_ROOT, "themes/bloom/src/layouts/Layout.astro"),
    "utf-8",
  );
}

function roseSource(): string {
  return readFileSync(
    resolve(SITES_ROOT, "themes/rose/src/components/StorefrontRuntime.astro"),
    "utf-8",
  );
}

describe("bloom: дровер корзины не тянет на себя схему секции «Корзина»", () => {
  it("Layout.astro не читает окно-глобал схемы дровера (w.__MERFY_CART_DRAWER_SCHEME__)", () => {
    const src = bloomLayoutSource();
    // Ищем СПОСОБ ЧТЕНИЯ (объявление типа поля / обращение через w.), а не
    // упоминание строки вообще — она законно живёт в комментарии выше,
    // объясняющем сам баг и фикс.
    expect(src).not.toMatch(/w\.__MERFY_CART_DRAWER_SCHEME__/);
    expect(src).not.toMatch(/__MERFY_CART_DRAWER_SCHEME__\?:\s*string/);
  });

  it("Layout.astro не накладывает color-scheme-N на корень дровера из cfg.scheme", () => {
    const src = bloomLayoutSource();
    // Раньше здесь стояло: cfg.scheme && /^scheme-\d+$/.test(cfg.scheme) →
    // root.classList.add("color-scheme-" + …). Полная фраза не должна
    // встречаться — единственный источник этого класса на дровере теперь
    // tokens.css (та же лестница, что и у rose).
    expect(src).not.toMatch(/cfg\.scheme/);
    expect(src).not.toMatch(/root\.classList\.add\(\s*"color-scheme-"/);
  });

  it("дисклеймер/тексты дровера остаются (не задели соседний функционал)", () => {
    const src = bloomLayoutSource();
    expect(src).toContain("__MERFY_CART_DRAWER_DISCLAIMER__");
    expect(src).toContain("__MERFY_CART_DRAWER_TITLE__");
    expect(src).toContain("__MERFY_CART_DRAWER_CHECKOUT__");
    expect(src).toContain("__MERFY_CART_DRAWER_EMPTY__");
  });

  it("паритет с rose: у эталона тоже нет читателя __MERFY_CART_DRAWER_SCHEME__", () => {
    expect(roseSource()).not.toContain("__MERFY_CART_DRAWER_SCHEME__");
  });
});
