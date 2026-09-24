/**
 * Слаг магазина из названия (этап 3, Н4).
 *
 * Долг волны 0 (Н4): `slugify()` в `reserve()` вырезает всё вне [a-z0-9] —
 * «Мой Магазин» даёт слаг «-». Команда `CreateStore` транслитерирует
 * кириллицу. Старый `reserve()` (RPC `sites.create_site`) не меняется — его
 * поведение пришпилено характеризационным тестом 0.2 до переезда шлюза.
 */
import { storeSlugFromName } from "../store-slug";

describe("storeSlugFromName", () => {
  it.each([
    ["Мой Магазин", "moy-magazin"],
    ["Мой сайт", "moy-sayt"],
    ["Шёлк", "shyolk"],
    ["Щука и Ёж", "shchuka-i-yozh"],
    ["ЦВЕТЫ Юли", "tsvety-yuli"],
    ["Подъезд", "podezd"],
    ["My Shop", "my-shop"],
    ["My   Shop!!!", "my-shop"],
    ["  --Shop--  ", "shop"],
    ["Café Déjà Vu", "cafe-deja-vu"],
    // «№» при разложении NFKD — «No»: знак номера читается, а не пропадает.
    ["Магазин №1 (лучший)", "magazin-no1-luchshiy"],
    ["Київ ґанок", "kiyiv-ganok"],
  ])("%s → %s", (name, slug) => {
    expect(storeSlugFromName(name)).toBe(slug);
  });

  it("ничего пригодного (эмодзи, иероглифы) — запасной слаг, а не «-» и не пусто", () => {
    expect(storeSlugFromName("🌸🌸")).toBe("store");
    expect(storeSlugFromName("花店")).toBe("store");
    expect(storeSlugFromName("   ")).toBe("store");
  });

  it("длинное название обрезается без висящего дефиса", () => {
    const slug = storeSlugFromName("очень ".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug.startsWith("ochen-ochen")).toBe(true);
  });

  it("результат всегда из [a-z0-9-], без двойных и крайних дефисов", () => {
    for (const name of ["Мой Магазин", "a--b", "---", "Ёлка-палка!", "x"]) {
      const slug = storeSlugFromName(name);
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});
