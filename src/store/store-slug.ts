/**
 * Слаг магазина из названия (этап 3, долг волны 0 Н4).
 *
 * `slugify()` старого `reserve()` вырезал всё вне [a-z0-9]: «Мой Магазин» →
 * «-». Здесь кириллица транслитерируется (та же таблица, что у слагов товаров
 * в product-сервисе, `src/common/utils/slug.ts`, плюс украинские буквы),
 * латинские диакритики снимаются разложением NFKD, всё прочее — разделитель.
 * Пусто после этого (эмодзи, иероглифы) — запасной слаг `store`; уникальность
 * в тенанте (`-1`, `-2`…) добавляет команда.
 */

/** Транслитерация (строчные буквы; заглавные приводятся до таблицы). */
const CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  // украинские и белорусские
  і: "i",
  ї: "yi",
  є: "ye",
  ґ: "g",
  ў: "u",
};

export const FALLBACK_STORE_SLUG = "store";
const MAX_SLUG_LENGTH = 60;

function transliterate(text: string): string {
  return Array.from(
    text.toLowerCase(),
    (ch) => CYRILLIC_TO_LATIN[ch] ?? ch,
  ).join("");
}

export function storeSlugFromName(name: string): string {
  const latin = transliterate(name)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "");
  const slug = latin
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");
  return slug || FALLBACK_STORE_SLUG;
}
