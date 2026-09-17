import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildTokensCss } from "../tokens-css";
import { resolveCartDrawerSchemeId } from "../cart-drawer-contract";

/**
 * Баг тестера 17.09 (дословно): «Корзина — не применяется цветовая схема».
 *
 * Разведка предыдущей сессии + замер живым браузером (flux,
 * https://u9fpo33bkmsd.merfy.ru, pnpm qa:probe reveal --what cart) на СВЕЖЕМ
 * стенде (пересборка 17.09 22:30, main bd44f688):
 *   панель дровера — фон rgb(255,255,255), текст rgb(0,0,0) — не совпадает НИ
 *   С ОДНОЙ из пяти схем магазина (у схемы 1 текст rgb(10,10,10), не 0,0,0):
 *   жёстко закрашенный дефолт дизайн-пакета, схема витрины его не касается.
 *
 * ПРИЧИНА (два независимых механизма красят дровер, а фолбэк знает только
 * один из них):
 *   1) window-глобал __MERFY_CART_DRAWER_SCHEME__ (cart-drawer-contract.ts) —
 *      вешает класс .color-scheme-N на корень дровера; ИМЕЕТ фолбэк на
 *      CartBody/CartSummary страницы корзины, когда мерчант не трогал
 *      отдельную настройку «Корзина → Цветовая схема».
 *   2) CSS-правило tokens.css (tokens-css.ts, cartDrawerPaintRule) — ЕДИНСТВЕННОЕ,
 *      что реально перебивает утилиту bg-white на панели (правила портов лежат
 *      в @layer base и проигрывают utilities вообще всегда — см. комментарий
 *      рядом с cartDrawerPaintRule). До этой правки читало ТОЛЬКО явную
 *      settings.cartDrawerScheme, БЕЗ фолбэка на CartBody/CartSummary.
 *
 * Итог до правки: мерчант выбирает схему НА СТРАНИЦЕ корзины (обычный путь —
 * отдельную настройку дровера почти никто не трогает) → класс на дровере есть
 * (механизм 1), а перебивающее bg-white правило — нет (механизм 2 молчит) →
 * панель остаётся белой.
 *
 * Фикс: build.service.ts перед вызовом buildTokensCss домешивает в settings
 * тот же резолвинг (`resolveCartDrawerSchemeId`, явная настройка ИЛИ
 * CartBody/CartSummary), что уже использует window-глобал.
 */

const PAGE_CART_WITH_SCHEME = {
  pagesData: {
    "page-cart": {
      content: [{ type: "CartBody", props: { colorScheme: "scheme-3" } }],
    },
  },
  themeSettings: {},
};

describe("resolveCartDrawerSchemeId — резолвит схему дровера вне window-глобала", () => {
  it("явная настройка cartDrawerScheme побеждает", () => {
    expect(
      resolveCartDrawerSchemeId({
        themeSettings: { cartDrawerScheme: "scheme-5" },
        pagesData: {
          "page-cart": {
            content: [{ type: "CartBody", props: { colorScheme: "scheme-1" } }],
          },
        },
      }),
    ).toBe("scheme-5");
  });

  it("без настройки — фолбэк на CartBody страницы корзины", () => {
    expect(resolveCartDrawerSchemeId(PAGE_CART_WITH_SCHEME)).toBe("scheme-3");
  });

  it("без CartBody — фолбэк на CartSummary", () => {
    expect(
      resolveCartDrawerSchemeId({
        pagesData: {
          "page-cart": {
            content: [
              { type: "CartBody", props: {} },
              { type: "CartSummary", props: { colorScheme: "scheme-4" } },
            ],
          },
        },
      }),
    ).toBe("scheme-4");
  });

  it("нет ни настройки, ни корзины — undefined (дефолт темы, ноль регрессии)", () => {
    expect(resolveCartDrawerSchemeId(null)).toBeUndefined();
    expect(resolveCartDrawerSchemeId({})).toBeUndefined();
  });
});

describe("buildTokensCss + фолбэк CartBody — панель дровера красится без явной настройки", () => {
  const SCHEME = {
    id: "scheme-3",
    background: "#111111",
    surfaceBg: "#222222",
    heading: "#ffffff",
    text: "#eeeeee",
    muted: "#bbbbbb",
    primaryButton: { background: "#ffffff", text: "#111111" },
    secondaryButton: { background: "#222222", text: "#ffffff" },
  };

  it("резолвленная схема, домешанная в settings, красит правило дровера", () => {
    // Именно это делает build.service.ts: cartDrawerScheme = явная настройка
    // ?? resolveCartDrawerSchemeId(revisionData) — здесь воспроизводим руками,
    // потому что buildTokensCss сам revisionData не видит (только settings).
    const cartDrawerScheme = resolveCartDrawerSchemeId(PAGE_CART_WITH_SCHEME);
    expect(cartDrawerScheme).toBe("scheme-3");

    const css = buildTokensCss(
      { colorSchemes: [SCHEME], cartDrawerScheme },
      "flux",
    );
    const rule = css.match(/\[data-nt\$="cart-drawer"\][^{]*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).not.toBe("");
    expect(rule).toContain("--color-bg: 17 17 17");
    expect(rule).toContain("--color-heading: 255 255 255");
  });

  it("БЕЗ фолбэка (старое поведение) правило дровера остаётся пустым — воспроизводит баг", () => {
    // Саботаж «руками»: settings без cartDrawerScheme и без фолбэка — ровно
    // то, что было ДО правки build.service.ts. Показывает, что баг был именно
    // в отсутствии этого домешивания, а не в buildTokensCss самом по себе.
    const css = buildTokensCss({ colorSchemes: [SCHEME] }, "flux");
    const rule = css.match(/\[data-nt\$="cart-drawer"\][^{]*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toBe("");
  });
});

describe("build.service.ts — источник домешивает фолбэк в вызов buildTokensCss (v2/live путь)", () => {
  const src = readFileSync(
    resolve(__dirname, "..", "..", "generator", "build.service.ts"),
    "utf8",
  );

  it("resolveCartDrawerSchemeId импортирован", () => {
    expect(src).toMatch(/resolveCartDrawerSchemeId/);
  });

  it("вызов buildTokensCss для v2TokensCss домешивает cartDrawerScheme", () => {
    const idx = src.indexOf("const v2TokensCss = buildTokensCss(");
    expect(idx).toBeGreaterThan(-1);
    const around = src.slice(idx, idx + 700);
    expect(around).toContain("v2CartDrawerScheme");
  });

  it("v2CartDrawerScheme берёт явную настройку ИЛИ resolveCartDrawerSchemeId(ctx.revisionData)", () => {
    const idx = src.indexOf("const v2CartDrawerScheme =");
    expect(idx).toBeGreaterThan(-1);
    const around = src.slice(idx, idx + 400);
    expect(around).toContain("resolveCartDrawerSchemeId(ctx.revisionData)");
  });
});
