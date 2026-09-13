/**
 * Образцы вариаций: название цвета → заливка свотча.
 *
 * Баг тестировщика (2026-09-13, п.6): при «Вариации: Круг» из девяти образцов
 * восемь стали кружками 48×48, а «Светло-голубой» остался текстовой кнопкой
 * 145×48. Причина — распознавание цвета по имени было ТОЧНЫМ совпадением со
 * словарём (`COLOR_HEX[value.toLowerCase()]`), поэтому любое СОСТАВНОЕ имя
 * («светло-голубой», «тёмно-синий», «сине-зелёный»), имя с лишними пробелами
 * или с «ё» не в том месте не резолвилось → свотча нет → текст-кнопка, и форма
 * «Круг/Квадрат» к ней неприменима.
 *
 * Чинится КЛАСС имён, а не одно значение: нормализация (регистр, ё/е, дефисы и
 * тире, повторные пробелы) + разбор составного имени на модификатор («светло»,
 * «тёмно», «light», «dark») и базовый цвет, включая склейку двух цветов
 * («сине-зелёный»).
 *
 * Резолверов два — по одному на порт секции (авторитет по файлу порта:
 * dist/theme-sections/<тема>/manifest.json):
 *   • packages/theme-base/blocks/Product/variantColor.ts — rose, vanilla, satin, bloom
 *   • themes/flux/src/lib/storefront-hydrate.ts (colorToHex) — flux
 * Палитры у них РАЗНЫЕ (у каждой темы свой оттенок), поэтому тест сверяет не
 * значения, а КЛАССИФИКАЦИЮ: что считается цветом, что нет, и куда двигается
 * светлота от модификатора. Плюс отдельный тест на дрейф: набор распознанных
 * имён у портов обязан совпадать.
 */
import {
  normalizeColorName,
  resolveVariantColor,
} from "../../../packages/theme-base/blocks/Product/variantColor";
import { colorToHex } from "../../../themes/flux/src/lib/storefront-hydrate";

type Resolver = (value: string, hint?: string | null) => string | null;

const PORTS: { name: string; resolve: Resolver }[] = [
  {
    name: "theme-base (rose, vanilla, satin, bloom)",
    resolve: (v, h) => resolveVariantColor(v, h ?? null),
  },
  {
    name: "flux (собственный порт)",
    resolve: (v, h) => colorToHex(v, h ?? null),
  },
];

/** Относительная яркость — для сравнения «светлее/темнее». */
function luminance(css: string): number {
  const hex = css.trim().replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex.slice(0, 6);
  const n = parseInt(full, 16);

  return (
    (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) /
    255
  );
}

/** Имена, которые ОБЯЗАНЫ стать свотчем. Именно классы, а не список из бага. */
const COLOR_NAMES = [
  // как в баге — составное имя с дефисом
  "Светло-голубой",
  "светло-голубой",
  "СВЕТЛО-ГОЛУБОЙ",
  "  Светло-Голубой  ",
  "Светло голубой",
  "светло   голубой",
  "Светло–голубой", // en dash
  // другие модификаторы и другие базы
  "Тёмно-синий",
  "темно-синий",
  "Тёмно-зелёный",
  "темно зеленый",
  "Светло-серый",
  "Ярко-красный",
  "Бледно-розовый",
  // склейка двух цветов
  "Сине-зелёный",
  "Серо-голубой",
  "Чёрно-белый",
  // однословные (работали и раньше — не сломать)
  "Синий",
  "Красный",
  "Чёрный",
  "черный",
  "Белый",
  "Серый",
  "Зелёный",
  "Жёлтый",
  "Розовый",
  // латиница и склонения
  "Light blue",
  "dark green",
  "Голубая",
  "Синяя",
];

/** Не цвет — обязаны остаться текст-чипом, иначе размеры станут кружками. */
const NOT_COLORS = [
  "XL",
  "M",
  "42",
  "128 ГБ",
  "Размер L",
  "Хлопок",
  "One size",
  "",
  "   ",
];

describe.each(PORTS)("имя цвета → свотч — $name", ({ resolve }) => {
  it.each(COLOR_NAMES)("«%s» распознаётся как цвет", (name) => {
    expect(resolve(name)).not.toBeNull();
  });

  it.each(NOT_COLORS)("«%s» НЕ цвет — остаётся текстом", (name) => {
    expect(resolve(name)).toBeNull();
  });

  it("составное имя даёт РОВНО тот же свотч при любом написании", () => {
    const canonical = resolve("Светло-голубой");
    for (const v of ["светло-голубой", "СВЕТЛО ГОЛУБОЙ", " светло–голубой "]) {
      expect(resolve(v)).toBe(canonical);
    }
  });

  it("«светло-X» светлее X, «тёмно-X» темнее X", () => {
    const base = resolve("Голубой")!;
    const light = resolve("Светло-голубой")!;
    const dark = resolve("Тёмно-голубой")!;
    expect(luminance(light)).toBeGreaterThan(luminance(base));
    expect(luminance(dark)).toBeLessThan(luminance(base));
  });

  it("однословные имена не поехали — цвет ровно из словаря темы", () => {
    expect(resolve("Чёрный")).toBe(resolve("черный"));
    expect(luminance(resolve("Белый")!)).toBeGreaterThan(0.9);
    expect(luminance(resolve("Чёрный")!)).toBeLessThan(0.1);
  });

  it("явный hex/подсказка платформы сильнее словаря", () => {
    expect(resolve("#123456")).toBe("#123456");
    expect(resolve("Светло-голубой", "#abcdef")).toBe("#abcdef");
  });
});

describe("нормализация имени", () => {
  it("схлопывает регистр, ё/е, дефисы, тире и повторные пробелы", () => {
    expect(normalizeColorName("  Светло-Голубой ")).toBe("светло голубой");
    expect(normalizeColorName("СВЕТЛО–ГОЛУБОЙ")).toBe("светло голубой");
    expect(normalizeColorName("светло   голубой")).toBe("светло голубой");
    expect(normalizeColorName("Тёмно-зелёный")).toBe("темно зеленый");
  });
});

describe("оба порта секции классифицируют имена одинаково", () => {
  it.each([...COLOR_NAMES, ...NOT_COLORS])(
    "«%s» — без дрейфа между портами",
    (name) => {
      const [base, flux] = PORTS.map((p) => p.resolve(name) !== null);
      expect(flux).toBe(base);
    },
  );
});
