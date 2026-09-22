import {
  buildTokensCss,
  googleFontsImportCss,
  previewTokensCssWithFonts,
  siteTokensCss,
} from "../tokens-css";
import { parityOn } from "../parity-switch";
import { resolveCartDrawerSchemeId } from "../cart-drawer-contract";

/**
 * Владелец 22.09: «убрать расхождения лайв ↔ конструктор, главный —
 * конструктор». Сверщик (tools/parity) показал: tokens.css строился в пяти
 * местах по-разному. Первая загрузка страницы в превью несла шрифты мерчанта
 * (@import Google Fonts), живая сборка — нет: шрифт, выбранный в панели, на
 * витрине подменялся запасным (flux: текст шире на ~3px, до 6.6% пикселей).
 * Живая сборка и правка настроек в превью несли схему выдвижной корзины со
 * страницы корзины, первая загрузка страницы в превью — нет.
 *
 * siteTokensCss — одна функция на все пути. Тесты сравнивают её не с моей
 * формулировкой, а с выводом ПРЕЖНИХ путей: она обязана совпадать с превью
 * там, где превью было эталоном (шрифты), и с живой сборкой там, где у живой
 * был фикс, которого превью не получило (схема корзины).
 */

const FONTS = {
  headingFont: "sofia-sans-condensed",
  bodyFont: "yanone-kaffeesatz",
};
const SCHEMES = [
  {
    id: "scheme-1",
    name: "1",
    background: "#ffffff",
    surfaceBg: "#f5f5f5",
    heading: "#000000",
    text: "#000000",
    muted: "#999999",
    primaryButton: { background: "#000000", text: "#ffffff" },
    secondaryButton: { background: "#f5f5f5", text: "#000000" },
  },
  {
    id: "scheme-3",
    name: "3",
    background: "#111111",
    surfaceBg: "#222222",
    heading: "#ffffff",
    text: "#eeeeee",
    muted: "#bbbbbb",
    primaryButton: { background: "#ffffff", text: "#111111" },
    secondaryButton: { background: "#222222", text: "#ffffff" },
  },
];
/** Ревизия, где схема дровера выбрана на странице корзины (обычный путь мерчанта). */
const REVISION_WITH_CART_SCHEME = {
  pagesData: {
    "page-cart": {
      content: [{ type: "CartBody", props: { colorScheme: "scheme-3" } }],
    },
  },
};
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Прежний live-путь build.service (до PARITY_TOKENS): схема корзины да, шрифтов нет. */
function oldLiveTokens(
  ts: Record<string, unknown>,
  revision: unknown,
  theme: string,
): string {
  const cartDrawerScheme =
    (ts as { cartDrawerScheme?: unknown }).cartDrawerScheme ??
    // тот же резолвер, что звала живая сборка
    resolveCartDrawerSchemeId(revision);
  return buildTokensCss({ ...ts, cartDrawerScheme }, theme);
}

describe("siteTokensCss — одни токены для превью и живого сайта", () => {
  describe.each(THEMES)("тема %s", (theme) => {
    const ts = { ...FONTS, colorSchemes: SCHEMES };

    it("шрифты мерчанта — как у превью (первая строка — @import)", () => {
      const css = siteTokensCss(ts, REVISION_WITH_CART_SCHEME, theme);
      expect(css.startsWith(googleFontsImportCss(ts))).toBe(true);
      expect(css.startsWith("@import url(")).toBe(true);
      expect(css).toContain("Sofia+Sans+Condensed");
      expect(css).toContain("Yanone+Kaffeesatz");
    });

    it("схема корзины — как у живой сборки: всё, что строил live, внутри", () => {
      const css = siteTokensCss(ts, REVISION_WITH_CART_SCHEME, theme);
      const live = oldLiveTokens(ts, REVISION_WITH_CART_SCHEME, theme);
      // Ровно: прежний live + строка шрифтов спереди. Ничего не выпало и не добавилось.
      expect(css).toBe(googleFontsImportCss(ts) + live);
      expect(live).toMatch(/\[data-nt\$="cart-drawer"\]/);
    });

    it("без схемы корзины совпадает с прежней первой загрузкой превью байт в байт", () => {
      expect(siteTokensCss(ts, {}, theme)).toBe(
        previewTokensCssWithFonts(ts, theme),
      );
    });

    it("явная настройка схемы дровера важнее страницы корзины (как было в обоих путях)", () => {
      const withExplicit = { ...ts, cartDrawerScheme: "scheme-1" };
      expect(
        siteTokensCss(withExplicit, REVISION_WITH_CART_SCHEME, theme),
      ).toBe(
        googleFontsImportCss(ts) +
          oldLiveTokens(withExplicit, REVISION_WITH_CART_SCHEME, theme),
      );
    });
  });

  it("без шрифтов мерчанта @import нет (дефолтные шрифты темы грузит сама тема)", () => {
    expect(siteTokensCss({}, {}, "rose").startsWith("@import")).toBe(false);
    expect(googleFontsImportCss({})).toBe("");
  });

  it("мусор вместо настроек не роняет сборку токенов", () => {
    for (const bad of [null, undefined, 42, "x", []]) {
      expect(() => siteTokensCss(bad, bad, "flux")).not.toThrow();
    }
  });
});

describe("parityOn — выключатель пункта", () => {
  const on = (value: string | undefined, siteId: string | null) =>
    parityOn(
      "TOKENS",
      siteId,
      value === undefined ? {} : { PARITY_TOKENS: value },
    );

  it("по умолчанию выключен: выкладка кода сама ничего не меняет", () => {
    expect(on(undefined, "a")).toBe(false);
    expect(on("", "a")).toBe(false);
    expect(on("off", "a")).toBe(false);
    expect(on("0", "a")).toBe(false);
  });

  it("список siteId — только для перечисленных (стенды)", () => {
    expect(on("a, b", "a")).toBe(true);
    expect(on("a, b", "b")).toBe(true);
    expect(on("a, b", "c")).toBe(false);
    expect(on("a, b", null)).toBe(false);
  });

  it("звёздочка — для всех сайтов", () => {
    expect(on("*", "любой")).toBe(true);
    expect(on("*", null)).toBe(true);
  });
});
