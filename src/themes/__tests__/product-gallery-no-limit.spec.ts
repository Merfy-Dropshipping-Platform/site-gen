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
