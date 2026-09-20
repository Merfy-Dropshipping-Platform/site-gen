import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Баг тестера (18.09): «В секции Корзина во всех темах не отображается цена до
 * скидки. Rose, Bloom, Satin».
 *
 * Живую страницу корзины рисует НЕ общий блок `theme-base/CartBody`, а
 * `CartSection.astro` темы — это выяснилось замером витрины bloom, где правка в
 * общем блоке не появилась вовсе. В четырёх темах зачёркнутая цена уже была
 * (её добавляли 17.09 по жалобе владельца), а satin оставался без неё.
 *
 * Гард держит паритет: строка корзины КАЖДОЙ темы показывает старую цену и
 * только когда она выше текущей.
 */
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "flux", "bloom", "satin", "vanilla"] as const;

function findFile(dir: string, name: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findFile(full, name);
      if (hit) return hit;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

function cartSection(theme: string): string {
  const file = findFile(resolve(SITES_ROOT, "themes", theme, "src"), "CartSection.astro");
  if (!file) throw new Error(`${theme}: CartSection.astro не найден`);
  return readFileSync(file, "utf8");
}

describe("строка корзины показывает цену до скидки во всех темах", () => {
  it.each(THEMES)("%s", (theme) => {
    const src = cartSection(theme);
    expect(src).toMatch(/line\.oldPrice/);
    expect(src).toMatch(/line-through/);
    // только когда старая цена действительно выше текущей
    expect(src).toMatch(/line\.oldPrice\s*>\s*line\.price/);
  });
});
