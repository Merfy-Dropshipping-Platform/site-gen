import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderBlock } from "../../../scripts/qa/lib/render";

/**
 * Строка корзины подписывает выбранный вариант.
 *
 * Баг тестера: «Добавил два разных оттенка одного тинта — в /cart две
 * одинаковые строки». Воспроизведено на живом стенде 21.09: в хранилище две
 * позиции с `variant.options = {"Формат":"Порошок"}` и
 * `{"Формат":"Набор (протеин + стики)"}`, на странице — два одинаковых
 * «Bloom Strawberry Watermelon».
 *
 * ПРИЧИНА. `CartBody` склеивал подпись из ЛЕГАСИ-полей:
 * `[line.variant?.color, line.variant?.size]`. Реальные опции лежат в
 * `variant.options`, поэтому подпись выходила пустой. Общий хелпер
 * `variantLabel` (packages/theme-base/runtime/nt-cart.ts) читает options и
 * падает на color/size лишь фолбэком — `CartSection` на него уже перевели,
 * `CartBody` остался на старом пути. Одна фича, два пути, починен был один.
 *
 * У vanilla подписи не было в разметке вовсе — добавлена.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "vanilla", "flux"] as const;
const built = (t: string) =>
  existsSync(resolve(SITES_ROOT, "dist", "theme-sections", t, "manifest.json"));

const html = (t: string) =>
  renderBlock(t, "CartBody", { id: "CartBody-1", colorScheme: "scheme-1" });

describe("строка корзины: подпись варианта", () => {
  const themes = THEMES.filter(built);

  it("темы собраны — иначе проверки сторожат пустоту", () => {
    expect(themes.length).toBeGreaterThan(0);
  });

  it.each(THEMES)("%s: подпись считает общий хелпер", (t) => {
    if (!built(t)) return;
    expect({ t, зовёт: /variantLabel\(|variantPairs\(/.test(html(t)) }).toEqual({ t, зовёт: true });
  });

  it.each(THEMES)("%s: склейки только по color+size не осталось", (t) => {
    if (!built(t)) return;
    // Ровно та строка, из-за которой подпись была пустой.
    const склейка = /\[line\.variant\?\.color,\s*line\.variant\?\.size\]\.filter\(Boolean\)\.join/.test(html(t));
    expect({ t, склейка }).toEqual({ t, склейка: false });
  });

  it.each(["bloom", "satin"])(
    "%s: СТРАНИЦА корзины тоже на общем хелпере",
    (t) => {
      // rose/vanilla/flux — тонкий шелл, строки рисует секция. У bloom и satin
      // страница несёт СВОЮ разметку, и правка секции её не касается: на живом
      // стенде 21.09 код секции был выкачен, а строки всё равно одинаковые.
      const src = readFileSync(
        resolve(SITES_ROOT, "themes", t, "src/pages/cart.astro"),
        "utf-8",
      );
      expect({ t, зовёт: /variantLabel\(line\.variant\)/.test(src) }).toEqual({ t, зовёт: true });
      expect({ t, склейка: /\[line\.variant\?\.color,/.test(src) }).toEqual({ t, склейка: false });
    },
  );

  it.each(["rose", "vanilla", "flux"])(
    "%s: страница корзины остаётся тонким шеллом",
    (t) => {
      // Если у неё заведётся своя разметка строк — подпись снова разъедется.
      const src = readFileSync(
        resolve(SITES_ROOT, "themes", t, "src/pages/cart.astro"),
        "utf-8",
      );
      expect({ t, своиСтроки: /lines\s*\.map\(|data-line-id/.test(src) }).toEqual({
        t,
        своиСтроки: false,
      });
    },
  );

  it("vanilla выводит подпись в РАЗМЕТКЕ, а не только объявляет переменную", () => {
    if (!built("vanilla")) return;
    const src = html("vanilla");
    // Первая версия проверки искала просто имя переменной — и саботаж «убрать
    // подпись из разметки» её не ронял: объявление оставалось на месте.
    // Считаем вхождения: объявление + хотя бы одна подстановка в шаблон.
    const всего = (src.match(/variantUnderName/g) || []).length;
    expect({ всего: всего >= 2 }).toEqual({ всего: true });
    expect(src).toMatch(/\$\{variantUnderName \?/);
  });
});
