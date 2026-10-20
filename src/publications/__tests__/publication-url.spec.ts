/**
 * Адрес записи и блога на витрине — одна функция в theme-base (PUB-1, PUB-2).
 * Ею пользуются темы, секция «Публикации», сборка (страницы и редиректы) и
 * API записи (`url`). Здесь же — дата по-русски для карточек и страницы записи.
 */
import { getPageNumbers } from "../../../packages/theme-base/blocks/Catalog/pagination";
import {
  BLOG_PAGE_SIZE,
  blogPageNumbers,
  blogPageUrl,
  blogUrl,
  formatPublicationDate,
  publicationUrl,
} from "../../../packages/theme-base/runtime/publications";
import { publicationPath } from "../publication-rules";

describe("publicationUrl / blogUrl (theme-base)", () => {
  it("запись — /blogs/{handle}/{slug}", () => {
    expect(publicationUrl("novosti", "otkrytie-magazina")).toBe(
      "/blogs/novosti/otkrytie-magazina",
    );
  });

  it("блог — /blogs/{handle}", () => {
    expect(blogUrl("stati")).toBe("/blogs/stati");
  });

  it("страница блога: первая — без параметра, дальше ?page=N", () => {
    expect(blogPageUrl("blog", 1)).toBe("/blogs/blog");
    expect(blogPageUrl("blog", 3)).toBe("/blogs/blog?page=3");
  });

  it("на странице блога по 12 записей", () => {
    expect(BLOG_PAGE_SIZE).toBe(12);
  });

  it("номера страниц блога раскладываются как у каталога", () => {
    for (let total = 1; total <= 15; total++) {
      for (let current = 1; current <= total; current++) {
        expect(blogPageNumbers(current, total)).toEqual(getPageNumbers(current, total));
      }
    }
  });

  it("лишние слэши и пробелы не попадают в адрес", () => {
    expect(publicationUrl(" novosti ", "/zapis/")).toBe("/blogs/novosti/zapis");
  });

  it("API записи строит адрес той же функцией", () => {
    expect(publicationPath("novosti", "zapis")).toBe(
      publicationUrl("novosti", "zapis"),
    );
  });
});

describe("formatPublicationDate", () => {
  it("дата по-русски без «г.»: «1 января 2025»", () => {
    expect(formatPublicationDate("2025-01-01T09:00:00.000Z")).toBe("1 января 2025");
  });

  it("день — по московскому времени", () => {
    // 31 декабря 22:30 UTC — в Москве уже 1 января.
    expect(formatPublicationDate("2024-12-31T22:30:00.000Z")).toBe("1 января 2025");
  });

  it("родительный падеж всех месяцев", () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      formatPublicationDate(`2025-${String(i + 1).padStart(2, "0")}-15T12:00:00.000Z`),
    );
    expect(months).toEqual([
      "15 января 2025",
      "15 февраля 2025",
      "15 марта 2025",
      "15 апреля 2025",
      "15 мая 2025",
      "15 июня 2025",
      "15 июля 2025",
      "15 августа 2025",
      "15 сентября 2025",
      "15 октября 2025",
      "15 ноября 2025",
      "15 декабря 2025",
    ]);
  });

  it("нет даты или мусор — пустая строка", () => {
    expect(formatPublicationDate(null)).toBe("");
    expect(formatPublicationDate(undefined)).toBe("");
    expect(formatPublicationDate("не дата")).toBe("");
  });
});
