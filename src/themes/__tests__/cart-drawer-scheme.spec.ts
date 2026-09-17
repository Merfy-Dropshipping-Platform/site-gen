import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildTokensCss } from "../tokens-css";
import {
  resolveCartDrawerGlobals,
  CART_DRAWER_DISCLAIMER,
} from "../cart-drawer-contract";

/**
 * Владелец, 13.09 (дословно): «В Настройках темы, в пункте Корзина, добавить
 * цветовую схему сайдбара при настройке "сайдбар" и придать ей живость, то есть
 * применение».
 *
 * «Живость» здесь — не фигура речи: настройка обязана КРАСИТЬ дровер, а не
 * лежать в ревизии. Замер «до» (scripts нет, делался руками tsx):
 *   • слова `cartDrawerScheme` не было ни в tokens-css.ts, ни в
 *     cart-drawer-contract.ts — у настройки не было НИ ОДНОГО читателя;
 *   • схему дровера резолвил только `CartBody.colorScheme` (иначе CartSummary)
 *     со страницы page-cart, и доезжала она ровно одним каналом — оконным
 *     глобалом `__MERFY_CART_DRAWER_SCHEME__`, который читают Layout.astro
 *     четырёх тем: flux, bloom, satin, vanilla. У rose такого читателя нет
 *     вовсе (проверено grep по themes/rose/src: ни одного __MERFY_CART_DRAWER),
 *     то есть у rose схема дровера не работала никогда.
 *
 * Поэтому каналов два, и оба обязаны брать новую настройку источником:
 *   1) tokens.css — правило на корне дровера. Это единственный канал rose и он
 *      же работает в превью конструктора (глобалы туда не инжектятся —
 *      известный пробел, см. preview-page-routing.spec «observed GAP»).
 *   2) оконный глобал — им живут class-based темы (vanilla без класса
 *      `.color-scheme-N` не перекрашивается вовсе: её remap-правило в
 *      themes/vanilla/src/styles/global.css требует именно класс).
 *
 * Совместимость: старый источник (CartBody/CartSummary) остаётся запасным —
 * магазины, где схема уже выбрана в секции корзины, ничего не теряют.
 */

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

const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Правило tokens.css, которое красит корень дровера (или '' если его нет). */
function drawerRule(css: string): string {
  const m = css.match(/\[data-nt\$="cart-drawer"\][^{]*\{[^}]*\}/);
  return m ? m[0] : "";
}

describe("«Настройки темы» → «Корзина» → цветовая схема сайдбара", () => {
  describe("источник схемы", () => {
    it("настройка темы становится источником для дровера", () => {
      const g = resolveCartDrawerGlobals({
        themeSettings: { cartDrawerScheme: "scheme-3" },
      });
      expect(g.__MERFY_CART_DRAWER_SCHEME__).toBe("scheme-3");
      // Схема и дисклеймер — пара, как и было: дровер без дисклеймера не канон.
      expect(g.__MERFY_CART_DRAWER_DISCLAIMER__).toBe(CART_DRAWER_DISCLAIMER);
    });

    it("настройка темы перебивает схему секции корзины", () => {
      const g = resolveCartDrawerGlobals({
        themeSettings: { cartDrawerScheme: "scheme-3" },
        pagesData: {
          "page-cart": {
            content: [{ type: "CartBody", props: { colorScheme: "scheme-1" } }],
          },
        },
      });
      expect(g.__MERFY_CART_DRAWER_SCHEME__).toBe("scheme-3");
    });

    it("без настройки работает как раньше: CartBody, затем CartSummary", () => {
      const fromBody = resolveCartDrawerGlobals({
        pagesData: {
          "page-cart": {
            content: [{ type: "CartBody", props: { colorScheme: "scheme-2" } }],
          },
        },
      });
      expect(fromBody.__MERFY_CART_DRAWER_SCHEME__).toBe("scheme-2");

      const fromSummary = resolveCartDrawerGlobals({
        pagesData: {
          "page-cart": {
            content: [
              { type: "CartBody", props: {} },
              { type: "CartSummary", props: { colorScheme: "scheme-5" } },
            ],
          },
        },
      });
      expect(fromSummary.__MERFY_CART_DRAWER_SCHEME__).toBe("scheme-5");
    });

    it("мусор в настройке не съедает запасной источник", () => {
      // 42 убран из списка «мусора» баг-тестера №20 (18.09, третий заход):
      // живая нормализация ревизии переводит "scheme-N" в ЧИСЛО ДО того, как
      // этот резолвер его видит — число теперь ЗАКОННАЯ форма схемы, не мусор
      // (см. отдельный тест ниже и коммент в cart-drawer-contract.ts).
      for (const bad of ["", "   ", "scheme-", "schema-2", null, {}, NaN]) {
        const g = resolveCartDrawerGlobals({
          themeSettings: { cartDrawerScheme: bad },
          pagesData: {
            "page-cart": {
              content: [
                { type: "CartBody", props: { colorScheme: "scheme-1" } },
              ],
            },
          },
        });
        expect(g.__MERFY_CART_DRAWER_SCHEME__).toBe("scheme-1");
      }
    });

    // Баг тестера №20 (18.09, третий заход, дословно): «цв схема не
    // применяется к заголовку, цене, количества кнопка и цифры». Живой замер
    // (flux, свежий стенд u9fpo33bkmsd.merfy.ru, СОБРАННЫЙ 18.09): секция
    // CartBody на /cart несёт `color-scheme-2` (то есть проп ЖИВ), а
    // `tokens.css` витрины не содержит НИ ОДНОГО правила `cart-drawer` —
    // резолвер молчал. Явную настройку конструктор тоже может прислать
    // числом (та же «голая N» форма, что описана в
    // packages/theme-base/runtime/color-scheme.ts) — раньше resolveCartDrawer
    // GlobalsBackward отбрасывал число молча.
    it("числовая настройка cartDrawerScheme (пост-нормализация) принимается, а не отбрасывается", () => {
      const g = resolveCartDrawerGlobals({
        themeSettings: { cartDrawerScheme: 2 },
      });
      expect(g.__MERFY_CART_DRAWER_SCHEME__).toBe("scheme-2");
    });

    it("пустая настройка и пустая корзина по-прежнему дают ноль глобалов", () => {
      expect(
        resolveCartDrawerGlobals({ themeSettings: { cartDrawerScheme: "" } }),
      ).toEqual({});
    });
  });

  describe("применение: правило tokens.css на корне дровера", () => {
    it.each(THEMES)("%s: выбранная схема красит дровер", (theme) => {
      const rule = drawerRule(
        buildTokensCss(
          { colorSchemes: SCHEMES, cartDrawerScheme: "scheme-3" },
          theme,
        ),
      );
      expect(rule).not.toBe("");
      // Панель дровера во всех пяти темах читает именно эти токены
      // (themes/<t>/src/styles/global.css: background-color:
      // rgb(var(--color-bg)), h2 → --color-heading, «Скрыть» → --color-muted).
      expect(rule).toContain("--color-bg: 17 17 17");
      expect(rule).toContain("--color-surface: 34 34 34");
      expect(rule).toContain("--color-heading: 255 255 255");
      expect(rule).toContain("--color-text: 238 238 238");
      expect(rule).toContain("--color-muted: 187 187 187");
      // Кнопка «Оформить заказ» — кнопка-1 схемы.
      expect(rule).toContain("--color-button-bg: 255 255 255");
    });

    it("селектор ловит оба корня: cart-drawer и vanilla-cart-drawer", () => {
      // Замер по собранным дистам (themes/<t>/dist/index.html):
      //   rose/flux/bloom/satin → data-nt="cart-drawer"
      //   vanilla               → data-nt="vanilla-cart-drawer"
      // Суффиксный селектор — ровно та же приёмка, что у карточки товара
      // ([data-nt$="-product-card"]).
      const rule = drawerRule(
        buildTokensCss(
          { colorSchemes: SCHEMES, cartDrawerScheme: "scheme-3" },
          "vanilla",
        ),
      );
      expect(rule.startsWith('[data-nt$="cart-drawer"]')).toBe(true);
    });

    it.each(THEMES)(
      "%s: без выбора правила нет вовсе (ноль регрессии)",
      (theme) => {
        expect(
          drawerRule(buildTokensCss({ colorSchemes: SCHEMES }, theme)),
        ).toBe("");
      },
    );

    it("несуществующая схема ничего не рисует", () => {
      expect(
        drawerRule(
          buildTokensCss(
            { colorSchemes: SCHEMES, cartDrawerScheme: "scheme-9" },
            "rose",
          ),
        ),
      ).toBe("");
    });

    it("схема дровера не трогает :root — страница остаётся своей схемой", () => {
      const css = buildTokensCss(
        { colorSchemes: SCHEMES, cartDrawerScheme: "scheme-3" },
        "rose",
      );
      const root = css.match(/:root \{[^}]*\}/)?.[0] ?? "";
      expect(root).toContain("--color-bg: 255 255 255");
      expect(root).not.toContain("--color-bg: 17 17 17");
    });
  });

  describe("покраска бьёт утилиты дизайн-пакета", () => {
    /**
     * Замер в Chromium на собранных дистах (до правки): панель дровера
     * оставалась белой ВО ВСЕХ темах, кроме vanilla, даже когда на корне уже
     * висел класс `.color-scheme-3`. Причина — панель приходит из дизайн-пакета
     * с утилитой `bg-white`, а правила портов лежат в `@layer base`; слой
     * `utilities` старше, поэтому порт проигрывал всегда.
     *
     * Отсюда требование: объявления tokens.css обязаны быть БЕЗ слоя.
     */
    /**
     * Честный разбор вложенности: идём по строке и считаем, открыт ли к
     * позиции `at` хоть один блок `@layer … {`. Подсчёт «скобок всего» здесь не
     * годится — он не отличает @layer от обычного правила и молчал бы ровно на
     * той поломке, ради которой тест написан.
     */
    function openLayersAt(css: string, at: number): string[] {
      const stack: Array<{ name: string | null; depth: number }> = [];
      let depth = 0;
      let i = 0;
      while (i < at) {
        const m = /^@layer\s+([^;{]*)\{/.exec(css.slice(i, i + 80));
        if (m) {
          stack.push({ name: m[1].trim(), depth });
          depth += 1;
          i += m[0].length;
          continue;
        }
        const c = css[i];
        if (c === "{") depth += 1;
        else if (c === "}") {
          depth -= 1;
          if (stack.length && stack[stack.length - 1].depth === depth)
            stack.pop();
        }
        i += 1;
      }
      return stack.map((e) => e.name ?? "");
    }

    it.each(THEMES)("%s: правила дровера не завёрнуты в @layer", (theme) => {
      const css = buildTokensCss(
        { colorSchemes: SCHEMES, cartDrawerScheme: "scheme-3" },
        theme,
      );
      // Проверяем КАЖДОЕ вхождение: завернуть могли не всё сразу.
      let at = css.indexOf('[data-nt$="cart-drawer"]');
      expect(at).toBeGreaterThan(-1);
      while (at > -1) {
        expect(openLayersAt(css, at)).toEqual([]);
        at = css.indexOf('[data-nt$="cart-drawer"]', at + 1);
      }
    });

    it.each(["rose", "bloom", "satin", "flux"])(
      "%s: набор покрашенных частей дословно совпадает с портом",
      (theme) => {
        // Гард от расползания: порт объявляет, ЧТО именно в дровере красится
        // токенами схемы. tokens.css повторяет тот же список — иначе часть
        // панели осталась бы прежнего цвета и вышла бы «наполовину живая»
        // настройка.
        const portCss = readFileSync(
          resolve(
            __dirname,
            "..",
            "..",
            "..",
            "themes",
            theme,
            "src",
            "styles",
            "global.css",
          ),
          "utf8",
        );
        const portParts = [
          ...portCss.matchAll(
            /\[data-nt="cart-drawer"\]\s+(\[data-cart-[a-z]+\][^,{]*)/g,
          ),
        ].map((m) => m[1].trim().replace(/\s+/g, " "));
        expect(portParts.length).toBeGreaterThan(0);

        const css = buildTokensCss(
          { colorSchemes: SCHEMES, cartDrawerScheme: "scheme-3" },
          theme,
        );
        for (const part of new Set(portParts)) {
          expect(css).toContain(`[data-nt$="cart-drawer"] ${part}`);
        }
      },
    );

    it("скругление кнопки схема не трогает — это отдельная настройка", () => {
      const css = buildTokensCss(
        { colorSchemes: SCHEMES, cartDrawerScheme: "scheme-3" },
        "rose",
      );
      const drawerCss = css.slice(css.indexOf('[data-nt$="cart-drawer"]'));
      const upToNextRule = drawerCss.slice(0, drawerCss.indexOf("a[href$="));
      expect(upToNextRule).not.toContain("border-radius");
    });
  });

  describe("vanilla: порт перекрашивается своими токенами", () => {
    /**
     * У vanilla панель дровера читает НЕ --color-*, а собственные --vanilla-*.
     * Её порт переназначает их (themes/vanilla/src/styles/global.css), но только при
     * классе `.color-scheme-N` — а класс вешает JS из оконного глобала. В
     * превью конструктора глобалов нет, поэтому те же алиасы обязано выдавать и
     * правило tokens.css.
     */
    it("алиасы дровера vanilla совпадают с портом дословно", () => {
      // Гард от расползания: правило tokens.css и remap-блок порта — одни и те
      // же объявления. Если кто-то поправит одну сторону, тест назовёт обе.
      const portCss = readFileSync(
        resolve(
          __dirname,
          "..",
          "..",
          "..",
          "themes",
          "vanilla",
          "src",
          "styles",
          "global.css",
        ),
        "utf8",
      );
      const portBlock = portCss.match(
        /\[data-nt="vanilla-cart-drawer"\]\[class\*="color-scheme-"\]\s*\{([^}]*)\}/,
      );
      expect(portBlock).not.toBeNull();
      const portDecls = (portBlock as RegExpMatchArray)[1]
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => `${d};`);
      expect(portDecls.length).toBeGreaterThan(0);

      const rule = drawerRule(
        buildTokensCss(
          { colorSchemes: SCHEMES, cartDrawerScheme: "scheme-3" },
          "vanilla",
        ),
      );
      for (const decl of portDecls) {
        expect(rule).toContain(decl);
      }
    });

    it("другим темам алиасы vanilla не достаются", () => {
      for (const theme of ["rose", "bloom", "satin", "flux"]) {
        const rule = drawerRule(
          buildTokensCss(
            { colorSchemes: SCHEMES, cartDrawerScheme: "scheme-3" },
            theme,
          ),
        );
        expect(rule).not.toContain("--vanilla-");
      }
    });
  });
});
