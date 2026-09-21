import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Кнопка покупки берёт скругление из настройки темы «Кнопки → Скругление».
 *
 * Баг тестера 22.09 (пункт 9): «При токене 100px соседняя „Смотреть все
 * товары“ — 100px, „В корзину“ — 4px, зашито как rounded-[4px]».
 *
 * ЗАМЕР НА ЖИВОЙ ВИТРИНЕ (Chrome, flux, 22.09): `--radius-button` = 6px,
 * «Смотреть все товары» → border-radius 6px (класс на токене),
 * «Добавить в корзину» → 4px (класс `rounded-[4px]`). Дефолт flux равен 4px,
 * поэтому на дефолтных настройках расхождения не видно — и оно прожило долго.
 *
 * Фолбэк в токене остаётся прежним (4px), так что вид «из коробки» не меняется.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const ФАЙЛ = "themes/flux/src/components/sections/FeaturedProduct.astro";

/** Комментарии — не разметка: они цитируют прежний класс. */
function код(rel: string): string {
  return readFileSync(resolve(SITES_ROOT, rel), "utf-8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ");
}

describe("скругление кнопки покупки идёт от темы", () => {
  const src = код(ФАЙЛ);

  it("кнопки покупки объявлены — иначе проверка сторожит пустоту", () => {
    expect(src).toMatch(/data-cfg-add/);
    expect(src).toMatch(/data-cfg-buy/);
  });

  it("класс кнопки ссылается на токен, а не на число", () => {
    const кнопки = [...src.matchAll(/class="inline-flex h-14 w-full[^"]*"/g)].map((m) => m[0]);
    expect(кнопки.length).toBeGreaterThan(0);
    for (const cls of кнопки) {
      expect({ класс: cls.slice(0, 70), токен: cls.includes("rounded-[var(--radius-button") }).toEqual({
        класс: cls.slice(0, 70),
        токен: true,
      });
      expect({ класс: cls.slice(0, 70), жёстко: /rounded-\[\d+px\]/.test(cls) }).toEqual({
        класс: cls.slice(0, 70),
        жёстко: false,
      });
    }
  });

  it("фолбэк остался 4px — вид на дефолте не поехал", () => {
    expect(src).toContain("rounded-[var(--radius-button,4px)]");
  });
});
