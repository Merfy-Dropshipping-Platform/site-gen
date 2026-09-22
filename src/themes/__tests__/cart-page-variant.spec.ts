import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Перепроверка тестера (20.09): «Корзина не показывает вариант. Два оттенка
 * одного тинта — две неразличимые строки. В Vanilla данные варианта уже есть
 * (`options: {"Оттенок":"Sugar Plum"}`), но страница их не выводит».
 *
 * Первый заход (PR #46) научил произвольным опциям рантайм корзины и боковую
 * корзину тем, но СТРАНИЦУ корзины рисует `CartSection.astro`, и она собирала
 * подпись вручную из `color` + `size` — то есть из двух полей, куда «Оттенок»
 * никогда не попадает. Vanilla не выводила вариант вовсе.
 *
 * Правило: подпись варианта на странице корзины строит общий хелпер
 * (`variantHtml` — значения через запятую, `variantParts` — пары «Имя:
 * Значение» для тем, которые подписывают характеристики). С 23.09 оба рисуют
 * цвет кружком (владелец: «цвет не надо словами писать»); прежние
 * `variantLabel`/`variantPairs` отдают только текст.
 */
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "flux", "bloom", "satin", "vanilla"] as const;

function findFile(dir: string, name: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findFile(full, name);
      if (hit) return hit;
    } else if (entry.name === name) return full;
  }
  return null;
}

const cartSection = (theme: string): string => {
  const file = findFile(
    resolve(SITES_ROOT, "themes", theme, "src"),
    "CartSection.astro",
  );
  if (!file) throw new Error(`${theme}: CartSection.astro не найден`);
  return readFileSync(file, "utf8");
};

describe("страница корзины показывает выбранный вариант", () => {
  it.each(THEMES)("%s: подпись строит общий хелпер", (theme) => {
    const src = cartSection(theme);
    // 23.09: хелпер с кружком цвета (variantHtml / variantParts), не голый текст.
    expect(src).toMatch(
      /variantHtml\(line\.variant\)|variantParts\(line\.variant\)/,
    );
  });

  it.each(THEMES)(
    "%s: подпись не собирается вручную из color+size",
    (theme) => {
      const src = cartSection(theme);
      expect(src).not.toMatch(
        /\[\s*line\.variant\?\.color\s*,\s*line\.variant\?\.size\s*\]/,
      );
      expect(src).not.toMatch(/const color = line\.variant\?\.color/);
    },
  );
});
