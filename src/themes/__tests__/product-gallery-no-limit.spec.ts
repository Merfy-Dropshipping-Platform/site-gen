/**
 * Галерея товара показывает ВСЕ загруженные фото, а не первые четыре.
 *
 * Владелец 2026-09-17, дословно: «надо убрать это ограничение».
 *
 * Что было. В `normaliseGallery` стояло `urls.slice(1, 4)`: первое фото
 * становилось главным, следующие ТРИ — миниатюрами, всё остальное
 * отбрасывалось. Молча: ни конструктор, ни админка не сообщали мерчанту, что
 * пятое и дальше на витрину не попадут. Ограничение было общим для всех пяти
 * тем — четыре из них рендерят секцию общим блоком theme-base, flux берёт из
 * него же подготовку данных.
 *
 * Лента миниатюр прокручивается (ProductGallery.astro: `overflow-x-auto` в
 * горизонтальном макете, `overflow-y-auto` в вертикальном), поэтому длинный
 * список не ломает раскладку — ограничение не было защитой от переполнения.
 *
 * Сторожим именно ОТСУТСТВИЕ верхней границы: число фото на входе равно числу
 * фото на выходе, сколько бы их ни было.
 */
import { normaliseProduct } from "../../../packages/theme-base/blocks/Product/Product.headless";

const productWith = (count: number) => ({
  id: "p1",
  name: "Товар",
  price: 1000,
  images: Array.from({ length: count }, (_, i) => `/img/photo-${i + 1}.jpg`),
});

const galleryOf = (count: number) => normaliseProduct(productWith(count) as never).gallery;

describe("галерея товара не режет список фото", () => {
  it.each([1, 2, 4, 5, 8, 20])("%i фото — все доезжают до витрины", (count: number) => {
    const g = galleryOf(count);
    const total = (g.hero ? 1 : 0) + g.thumbs.length;
    expect({ загружено: count, наВитрине: total }).toEqual({
      загружено: count,
      наВитрине: count,
    });
  });

  it("порядок сохраняется: первое фото — главное, остальные по очереди", () => {
    const g = galleryOf(5);
    expect(g.hero?.src).toBe("/img/photo-1.jpg");
    expect(g.thumbs.map((t: { src: string }) => t.src)).toEqual([
      "/img/photo-2.jpg",
      "/img/photo-3.jpg",
      "/img/photo-4.jpg",
      "/img/photo-5.jpg",
    ]);
  });

  it("пятое фото и дальше больше не теряются", () => {
    // Ровно тот случай, на который жаловался владелец: раньше на витрину
    // попадали четыре из шести.
    const g = galleryOf(6);
    expect(g.thumbs).toHaveLength(5);
    expect(g.thumbs.at(-1)?.src).toBe("/img/photo-6.jpg");
  });

  it("товар без фото по-прежнему даёт пустую галерею", () => {
    const view = normaliseProduct({ id: "p", name: "Без фото", price: 1 } as never);
    expect(view.gallery).toEqual({ hero: null, thumbs: [] });
  });
});

/**
 * ВТОРОЙ ЭТАЖ, 17.09 вечер. Проверки выше сторожили ОДИН путь — нормализацию
 * данных в `Product.headless`. Владелец в тот же день сообщил, что ограничение
 * живо, и был прав: страницы товара (PDP) у четырёх тем режут список ЕЩЁ РАЗ,
 * уже в своей разметке, после всякой нормализации.
 *
 * ЗАМЕР ДО (grep по исходникам, 17.09): bloom `[mainImage, ...thumbs].slice(0, 6)`
 * и `arr.slice(0, 6)` в клиентском скрипте · flux то же самое плюс
 * `galleryImages.slice(0, 5)` в секции «Товар» · satin `.slice(0, 4)` на самом
 * списке галереи · vanilla `arr.slice(0, 5)` — причём с комментарием
 * «показываем все фото», то есть ограничение уже считали снятым. У rose (эталон)
 * ограничения не было ни в одном месте.
 *
 * Это ровно тот класс, на который мы наступали: гард сторожит путь, который
 * трогал его автор, а соседние порты той же фичи остаются голыми. Поэтому здесь
 * сторожится КАЖДЫЙ файл, который рисует фото товара, а не только общий блок.
 *
 * Критерий: в коде, готовящем список фото к выводу, нет верхней границы —
 * никакого `.slice(<число>, <число>)` на галерее. Отсечка вида `.slice(1)`
 * («всё, кроме главного») разрешена: она не ограничивает сверху.
 */
describe("PDP тем не режет список фото повторно", () => {
  const { readFileSync: read } = require("node:fs") as typeof import("node:fs");
  const { join: j } = require("node:path") as typeof import("node:path");
  const ROOT = j(__dirname, "..", "..", "..");

  // Каждый файл, который выводит фото товара на витрину.
  const PORTS: Array<[string, string]> = [
    ["bloom · страница товара", "themes/bloom/src/components/products/BloomProductDetail.astro"],
    ["flux · страница товара", "themes/flux/src/components/products/FluxProductDetail.astro"],
    ["vanilla · страница товара", "themes/vanilla/src/components/products/VanillaProductDetail.astro"],
    ["satin · страница товара", "themes/satin/src/components/products/satinProductDetail.astro"],
    ["flux · секция «Товар»", "themes/flux/src/components/sections/FeaturedProduct.astro"],
    ["общий блок · секция «Товар»", "packages/theme-base/blocks/Product/Product.astro"],
    ["общий блок · галерея", "packages/theme-base/blocks/Product/ProductGallery.astro"],
  ];

  // Имена, за которыми в этих файлах ходит список фото.
  const GALLERY = /(gallery|galleryImages|thumbs|thumbUrls|images|imgs|arr|urls|photos)/i;

  /**
   * Строки с верхней границей — без комментариев.
   *
   * Критерий намеренно НЕ требует, чтобы перед `.slice` стояло «галерейное»
   * имя: у satin граница висела прямо на выражении — `(… ? a : b).slice(0, 4)`,
   * и первая версия этого сторожа её пропустила (саботаж 17.09 не покраснел).
   * В перечисленных файлах отсечка «с N по M» бывает только у списка фото,
   * поэтому ловим любую — в этом и есть смысл сторожа. Появится законная
   * (обрезка строки, hex-цвет) — её будет видно по красному тесту, и тогда её
   * надо назвать здесь явным исключением, а не ослаблять критерий.
   */
  const limitsIn = (file: string): string[] => {
    const src = read(j(ROOT, file), "utf-8");
    return src
      .split("\n")
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => {
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        return /\.slice\(\s*\d+\s*,\s*\d+\s*\)/.test(code);
      })
      .map(([i, line]) => `${i}: ${line.trim()}`);
  };

  it.each(PORTS)("%s — фото выводятся без верхней границы", (_name: string, file: string) => {
    expect(limitsIn(file)).toEqual([]);
  });

  it("САБОТАЖ: проверка не пуста — она действительно читает файлы и видит в них галерею", () => {
    const seen = PORTS.map(([, file]) => read(j(ROOT, file), "utf-8")).filter((src) =>
      GALLERY.test(src),
    );
    expect(seen).toHaveLength(PORTS.length);
    // И сам критерий умеет находить границу, если её вернуть.
    const probe = "const thumbs = galleryImages.slice(0, 5);";
    expect(probe.match(/([\w$.\]]+)\s*\.slice\(\s*\d+\s*,\s*\d+\s*\)/)?.[1]).toBe("galleryImages");
  });
});
