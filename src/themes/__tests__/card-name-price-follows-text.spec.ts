import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Название и НОВАЯ цена карточки товара — тот же цвет «Текст» схемы, что уже
 * несёт старая цена (её сплошным обходом сторожит old-price-follows-text.spec.ts
 * — он смотрит только строки с `line-through`, название и новая цена вне его
 * обхода).
 *
 * Партия тестера №3 (25.09), находка по замеру прода (подстановка переменных
 * схемы на карточку, тёмная схема текст=255 255 255): в путях ДОРИСОВКИ
 * (`storefront-hydrate.ts`) и SSR-карточке satin название и новая цена были
 * литералом `text-[#000000]`/`text-black`, пока старая цена рядом уже читала
 * `--color-text` — на тёмной схеме имя и цена чёрные, старая цена белая
 * (разъезд виден на любом скриншоте, не только замером).
 *
 * СПИСОК, А НЕ СПЛОШНОЙ ОБХОД (в отличие от old-price-follows-text.spec.ts) —
 * ровно те шаблоны карточки, что правит эта партия: SSR-карточка satin +
 * дорисовка (site-lib и каталожная package) 5 тем + избранное 5 тем. Список
 * пополнять при новой находке — тот же урок, что у old-price-follows-text.spec.ts
 * («нашёл все» три волны подряд оказывалось неполным).
 *
 * ЧТО СТОРОЖИМ на каждый файл: (1) литералы text-[#000000]/text-black для
 * названия/цены отсутствуют совсем; (2) название и цена несут --color-text
 * (или — vanilla-шторка — ту же переменную textCls, что делает и старая цена
 * рядом, см. её собственное исключение в old-price-follows-text.spec.ts).
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");

const read = (rel: string): string => readFileSync(resolve(SITES_ROOT, rel), "utf-8");

const BANNED = /text-\[#000000\]|text-black\b/;

type Target = {
  file: string;
  /** Строки, где рисуются название и новая цена (без старой — её сторожит другой файл). */
  nameLine: string;
  priceLine: string;
};

const TARGETS: Target[] = [
  {
    file: "themes/bloom/src/lib/storefront-hydrate.ts",
    nameLine: "bloom-product-name",
    priceLine: "bloom-product-price",
  },
  {
    file: "themes/rose/src/lib/storefront-hydrate.ts",
    nameLine: "rose-product-name",
    priceLine: "rose-product-price",
  },
  {
    file: "themes/flux/src/lib/storefront-hydrate.ts",
    nameLine: 'class="truncate font-roboto-flex text-[14px] font-light leading-normal',
    priceLine: 'class="font-roboto-flex text-[14px] font-light leading-normal',
  },
  {
    file: "packages/theme-rose/blocks/Catalog/storefront-hydrate.ts",
    nameLine: "rose-product-name",
    priceLine: "rose-product-price",
  },
  {
    file: "packages/theme-satin/blocks/Catalog/storefront-hydrate.ts",
    nameLine: 'class="font-manrope text-[16px] font-normal uppercase leading-tight',
    priceLine: 'class="font-manrope text-[16px] font-normal leading-tight',
  },
  {
    file: "packages/theme-satin/blocks/Catalog/SatinProductCard.astro",
    nameLine: 'class="font-manrope text-[16px] font-normal leading-tight',
    priceLine: 'class="font-manrope text-[16px] font-normal leading-tight',
  },
  {
    file: "themes/rose/src/components/sections/WishlistSection.astro",
    nameLine: "rose-product-name",
    priceLine: "rose-product-price",
  },
  {
    file: "themes/bloom/src/components/sections/WishlistSection.astro",
    nameLine: "bloom-product-name",
    priceLine: "bloom-product-price",
  },
  {
    file: "themes/satin/src/components/sections/WishlistSection.astro",
    nameLine: 'class="font-manrope text-[16px] font-normal uppercase leading-tight',
    priceLine: 'class="font-manrope text-[16px] font-normal leading-tight',
  },
  {
    file: "themes/vanilla/src/components/sections/WishlistSection.astro",
    // Не просто "font-vanilla-arsenal text-base font-normal leading-none" —
    // такой же префикс несёт подпись пустого избранного (data-wishlist-subtitle,
    // цвет --color-muted умышленно, другой элемент) и ловится тем же обходом.
    nameLine: 'hover:opacity-70">\' + name',
    priceLine: '>\' + price + "</span>" + oldPrice',
  },
];

/** У vanilla-шторки (и только там) цвет — переменная textCls, не литерал --color-text. */
const HAS_COLOR = /--color-text|\$\{textCls\}/;

describe.each(TARGETS)("карточка товара несёт --color-text: $file", ({ file, nameLine, priceLine }) => {
  const src = read(file);
  const lines = src.split("\n");
  const findLines = (needle: string) => lines.filter((l) => l.includes(needle));

  // Банится ТОЛЬКО в самих строках названия/цены (не по всему файлу): у файла
  // могут быть другие, не относящиеся к этой задаче элементы с literal-цветом
  // (напр. иконка сердца избранного — чёрная поверх белого круга нарочно,
  // не участвует в правиле «название/цена = --color-text»).
  it("строка названия и строка цены не несут literal text-[#000000] / text-black", () => {
    const bad = [...findLines(nameLine), ...findLines(priceLine)].filter((l) => BANNED.test(l));
    const report = bad.map((l) => `    ${l.trim().slice(0, 160)}`).join("\n");
    expect(bad.length === 0 ? "" : `НАРУШЕНИЙ: ${bad.length}\n${report}`).toBe("");
  });

  it("строка названия несёт --color-text (или textCls у vanilla-шторки)", () => {
    const found = findLines(nameLine);
    expect(found.length).toBeGreaterThan(0);
    for (const l of found) expect(HAS_COLOR.test(l)).toBe(true);
  });

  it("строка новой цены несёт --color-text (или textCls у vanilla-шторки)", () => {
    const found = findLines(priceLine);
    expect(found.length).toBeGreaterThan(0);
    for (const l of found) expect(HAS_COLOR.test(l)).toBe(true);
  });
});

describe("саботаж: гард ловит откат на литерал", () => {
  it("text-[#000000] — красный", () => {
    expect(BANNED.test('class="rose-product-name text-[#000000]"')).toBe(true);
  });
  it("text-black — красный", () => {
    expect(BANNED.test('class="font-vanilla-arsenal text-black"')).toBe(true);
  });
  it("--color-text — зелёный (не БАНИТСЯ)", () => {
    expect(BANNED.test('class="text-[rgb(var(--color-text,0_0_0))]"')).toBe(false);
  });
});
