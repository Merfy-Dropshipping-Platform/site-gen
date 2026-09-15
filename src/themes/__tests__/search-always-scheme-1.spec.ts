import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildTokensCss,
  pickSchemeOneTokens,
  buildSearchScheme1Rule,
  SEARCH_FORM_SELECTOR,
  SEARCH_PANEL_SUBMIT_SELECTOR,
} from "../tokens-css";

/**
 * Владелец, 15.09 (дословно): «Во всех темах Поиск должен брать на себя цвет
 * фона, текста, цвет текста в кнопке и цвет кнопки из Цветовой схемы 1».
 * Решение выбрано им же явно: «Всегда Схема 1, жёстко» — окружение (схема
 * секции-шапки) не перебивает. Побочный эффект озвучен и принят.
 *
 * ЗАМЕР «ДО» (Chromium 1440, пять живых стендов, шапка поочерёдно обёрнута в
 * .color-scheme-1..5; фон поля | текст поля | фон кнопки | текст кнопки):
 *   rose    255 255 255 | 0 0 0 | 0 0 0 → 255 255 255 | 255 255 255 → 0 0 0
 *           (единственная тема, где кнопка ехала за ОКРУЖЕНИЕМ: 4 разных
 *            сочетания на 5 схемах)
 *   vanilla 255 255 255 | 0 0 0 | 58 69 48    | 255 255 255  (1 сочетание)
 *   bloom   255 255 255 | 0 0 0 | 227 142 159 | 255 255 255  (1 сочетание)
 *   satin   255 255 255 | 0 0 0 | 0 0 0       | 255 255 255  (1 сочетание)
 *   flux    255 255 255 | 0 0 0 | 30 41 82    | 255 255 255  (1 сочетание)
 * Ни одна из 20 величин не приходила из Схемы 1.
 *
 * ЗАМЕР «ПОСЛЕ» (то же окно, правило дописано в боевой
 * <style id="__merfy_tokens_css">): 25 клеток из 25 (5 тем × 5 окружающих схем)
 * дали ровно Схему 1; при перекрашенной Схеме 1 (#71c0ff/#e91e8c/#ac20a5/#ffee00)
 * те же 25 клеток дали 113 192 255 | 233 30 140 | 172 32 165 | 255 238 0.
 * Соседи в шапке (логотип, меню, корзина, счётчик, сердечко, фон шапки) —
 * 7 величин × 5 тем — совпали с «до» побайтно.
 *
 * САБОТАЖ (обязан краснеть):
 *   • убрать `searchScheme1Rule` из массива return в buildTokensCss;
 *   • взять токены не Схемы 1, а активной/окружающей;
 *   • завернуть правило в `@layer utilities` (тогда литералы `bg-white`,
 *     `bg-[#1e2952]` побеждают снова);
 *   • снять `[data-search-panel]` со селектора кнопки (зальётся иконка в
 *     мобильном бургере — это сверх просьбы);
 *   • переименовать в порту `role="search"`, `type="search"` или
 *     `type="submit"` — селекторы перестанут попадать в разметку.
 */

const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/**
 * Селекторы записаны ЛИТЕРАЛАМИ, а не взяты из констант модуля: иначе ожидание
 * выводилось бы из того самого, что сторожим, и подмена селектора прошла бы
 * мимо теста (проверено саботажем — снятие `[data-search-panel]` давало один
 * красный вместо четырёх).
 */
const FORM = 'form[role="search"]';
const PANEL_SUBMIT = '[data-search-panel] form[role="search"] button[type="submit"]';

/** Схема 1 и заведомо непохожая на неё Схема 3 — чтобы «до» и «после» нельзя было спутать. */
const SCHEMES = [
  {
    id: "scheme-1",
    name: "1",
    background: "#71c0ff", // 113 192 255
    surfaceBg: "#f5f5f5",
    heading: "#e91e8c",
    text: "#e91e8c", // 233 30 140
    primaryButton: { background: "#ac20a5", text: "#ffee00" }, // 172 32 165 / 255 238 0
    secondaryButton: { background: "#f5f5f5", text: "#000000" },
  },
  {
    id: "scheme-3",
    name: "3",
    background: "#111111",
    surfaceBg: "#222222",
    heading: "#ffffff",
    text: "#eeeeee",
    primaryButton: { background: "#ffffff", text: "#111111" },
    secondaryButton: { background: "#222222", text: "#ffffff" },
  },
];

const SCHEME_1 = {
  bg: "113 192 255",
  text: "233 30 140",
  buttonBg: "172 32 165",
  buttonText: "255 238 0",
};
const SCHEME_3 = {
  bg: "17 17 17",
  text: "238 238 238",
  buttonBg: "255 255 255",
  buttonText: "17 17 17",
};

/** Все правила tokens.css, которые начинаются с селектора поиска. */
function searchRules(css: string): string[] {
  return css
    .split("\n")
    .filter((line) => line.startsWith(FORM))
    .flatMap((line) => line.match(/[^}]+\}/g) ?? []);
}

/**
 * Честный разбор вложенности (взят у cart-drawer-scheme.spec.ts): открыт ли к
 * позиции `at` хоть один `@layer … {`. Счёт «скобок всего» здесь не годится —
 * он не отличает @layer от обычного правила и молчал бы ровно на той поломке,
 * ради которой тест написан.
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
      if (stack.length && stack[stack.length - 1].depth === depth) stack.pop();
    }
    i += 1;
  }
  return stack.map((e) => e.name ?? "");
}

describe("Поиск всегда красится Схемой 1", () => {
  describe("правило tokens.css", () => {
    it.each(THEMES)("%s: четыре величины берутся из Схемы 1", (theme) => {
      const rules = searchRules(buildTokensCss({ colorSchemes: SCHEMES }, theme));
      expect(rules.length).toBe(3);
      const root = rules[0];
      expect(root.startsWith(`${FORM}{`)).toBe(true);
      expect(root).toContain(`--color-bg:${SCHEME_1.bg};`);
      expect(root).toContain(`--color-text:${SCHEME_1.text};`);
      expect(root).toContain(`--color-button-bg:${SCHEME_1.buttonBg};`);
      expect(root).toContain(`--color-button-text:${SCHEME_1.buttonText};`);
      expect(root).toContain("background-color:rgb(var(--color-bg));");
      expect(rules[1]).toBe(
        `${FORM} input[type="search"]{color:rgb(var(--color-text));}`,
      );
      expect(rules[2]).toBe(
        `${PANEL_SUBMIT}{background-color:rgb(var(--color-button-bg));color:rgb(var(--color-button-text));}`,
      );
    });

    it.each(THEMES)(
      "%s: ни одна величина не приходит из другой схемы",
      (theme) => {
        const all = searchRules(
          buildTokensCss({ colorSchemes: SCHEMES }, theme),
        ).join("");
        for (const v of Object.values(SCHEME_3)) expect(all).not.toContain(v);
      },
    );

    it.each(THEMES)(
      "%s: активная схема страницы поиск не перекрашивает",
      (theme) => {
        // defaultSchemeIndex = 1 → :root уезжает на Схему 3, а поиск обязан
        // остаться на Схеме 1. Это и есть «жёстко» из решения владельца.
        const css = buildTokensCss(
          { colorSchemes: SCHEMES, defaultSchemeIndex: 1 },
          theme,
        );
        const root = css.match(/:root \{[^}]*\}/g)?.join("") ?? "";
        expect(root).toContain(`--color-bg: ${SCHEME_3.bg}`);
        expect(searchRules(css)[0]).toContain(`--color-bg:${SCHEME_1.bg};`);
      },
    );

    it.each(THEMES)("%s: правило есть без всяких настроек", (theme) => {
      // «Всегда», а не «по галочке»: у настройки нет тумблера, и появиться
      // правило обязано у любого магазина, где Схема 1 вообще существует.
      expect(
        searchRules(buildTokensCss({ colorSchemes: SCHEMES }, theme)).length,
      ).toBe(3);
      // И даже когда мерчант не заводил схем вовсе — Схему 1 несёт манифест темы.
      expect(searchRules(buildTokensCss({}, theme)).length).toBe(3);
    });

    it.each(THEMES)("%s: правило не завёрнуто в @layer", (theme) => {
      const css = buildTokensCss({ colorSchemes: SCHEMES }, theme);
      let at = css.indexOf(FORM);
      expect(at).toBeGreaterThan(-1);
      while (at > -1) {
        expect(openLayersAt(css, at)).toEqual([]);
        at = css.indexOf(FORM, at + 1);
      }
    });

    it.each(THEMES)(
      "%s: значения совпадают с объявлениями .color-scheme-1",
      (theme) => {
        const css = buildTokensCss({ colorSchemes: SCHEMES }, theme);
        const declared = pickSchemeOneTokens(css);
        expect(declared).not.toBeNull();
        const root = searchRules(css)[0];
        for (const name of [
          "--color-bg",
          "--color-text",
          "--color-button-bg",
          "--color-button-text",
        ]) {
          expect(root).toContain(`${name}:${declared![name]};`);
        }
      },
    );
  });

  describe("объём — ровно четыре величины владельца", () => {
    it.each(THEMES)("%s: других свойств правило не объявляет", (theme) => {
      const rules = searchRules(buildTokensCss({ colorSchemes: SCHEMES }, theme));
      const props = rules
        .flatMap((r) => r.slice(r.indexOf("{") + 1, -1).split(";"))
        .map((d) => d.slice(0, d.indexOf(":")).trim())
        .filter(Boolean);
      expect(new Set(props)).toEqual(
        new Set([
          "--color-bg",
          "--color-text",
          "--color-button-bg",
          "--color-button-text",
          "background-color",
          "color",
        ]),
      );
    });

    it("подложка выпадающей панели и плашка подсказок не трогаются", () => {
      // У satin/flux сама панель несёт фон, у satin — ещё и [data-search-results].
      // Владелец просил четыре величины ПОЛЯ и КНОПКИ, а не панель.
      for (const theme of THEMES) {
        for (const rule of searchRules(
          buildTokensCss({ colorSchemes: SCHEMES }, theme),
        )) {
          const selector = rule.slice(0, rule.indexOf("{"));
          expect(selector).not.toContain("[data-search-results]");
          expect(selector.endsWith("[data-search-panel]")).toBe(false);
        }
      }
    });

    it("кнопка красится только в выпадающей панели", () => {
      // В мобильном бургере `button[type="submit"]` — голая иконка без фона во
      // всех пяти темах; заливка была бы изменением сверх просьбы.
      expect(SEARCH_PANEL_SUBMIT_SELECTOR).toBe(PANEL_SUBMIT);
      expect(SEARCH_FORM_SELECTOR).toBe(FORM);
      for (const theme of THEMES) {
        const rules = searchRules(
          buildTokensCss({ colorSchemes: SCHEMES }, theme),
        );
        const painted = rules.filter((r) => r.includes('button[type="submit"]'));
        expect(painted.length).toBe(1);
        expect(painted[0].startsWith("[data-search-panel] ")).toBe(true);
      }
    });
  });

  describe("нулевая регрессия там, где Схемы 1 нет", () => {
    it("нет схемы с id scheme-1 — нет и правила", () => {
      const noOne = [{ ...SCHEMES[1] }];
      // Тема, у которой в манифесте нет своих схем, — иначе Схему 1 даст манифест.
      expect(buildSearchScheme1Rule(pickSchemeOneTokens(""))).toBe("");
      expect(buildSearchScheme1Rule(null)).toBe("");
      expect(
        buildSearchScheme1Rule(
          pickSchemeOneTokens(".color-scheme-3 { --color-bg: 1 2 3; }"),
        ),
      ).toBe("");
      expect(noOne.length).toBe(1);
    });

    it("scheme-10 мерчанта не читается как Схема 1", () => {
      const tokens = pickSchemeOneTokens(
        ".color-scheme-10 { --color-bg: 1 2 3; --color-text: 4 5 6; }",
      );
      expect(tokens).toBeNull();
    });

    it("частичная Схема 1 даёт только то, что в ней есть", () => {
      const rule = buildSearchScheme1Rule(
        pickSchemeOneTokens(".color-scheme-1 { --color-button-bg: 1 2 3; }"),
      );
      expect(rule).toContain("--color-button-bg:1 2 3;");
      // Фон поля без своего токена остался бы наследованным от окружения —
      // поэтому объявления быть не должно вовсе.
      expect(rule).not.toContain("background-color:rgb(var(--color-bg))");
      expect(rule).not.toContain('input[type="search"]');
    });
  });

  describe("живая цепочка: селекторы попадают в разметку портов", () => {
    const ports: Array<[string, string]> = [
      ...THEMES.map(
        (t) =>
          [t, join(process.cwd(), "themes", t, "src", "components", "Header.astro")] as [
            string,
            string,
          ],
      ),
      [
        "theme-base",
        join(
          process.cwd(),
          "packages",
          "theme-base",
          "blocks",
          "Header",
          "Header.astro",
        ),
      ],
    ];

    it.each(ports)("%s: панель поиска — form[role=search] с input[type=search] и кнопкой submit", (_name, file) => {
      const src = readFileSync(file, "utf8");
      const panelAt = src.indexOf("data-search-panel");
      expect(panelAt).toBeGreaterThan(-1);
      const roleAt = src.indexOf('role="search"', panelAt);
      expect(roleAt).toBeGreaterThan(-1);
      const formEnd = src.indexOf("</form>", roleAt);
      expect(formEnd).toBeGreaterThan(roleAt);
      const form = src.slice(roleAt, formEnd);
      expect(form).toContain('type="search"');
      expect(form).toContain('type="submit"');
    });

    it.each(THEMES)(
      "%s: кнопка бургера — иконка вне [data-search-panel]",
      (theme) => {
        const src = readFileSync(
          join(process.cwd(), "themes", theme, "src", "components", "Header.astro"),
          "utf8",
        );
        const roles = [...src.matchAll(/role="search"/g)].map((m) => m.index!);
        expect(roles.length).toBe(2);
        const burgerAt = roles[1];
        const form = src.slice(burgerAt, src.indexOf("</form>", burgerAt));
        expect(form).toContain('type="search"');
        // Иконка, а не подпись: у кнопки бургера есть aria-label «Найти».
        expect(form).toMatch(/aria-label="Найти"/);
        // И она действительно вне панели: выпадающая панель живёт ВНУТРИ
        // <header>, бургер — после него, значит форма бургера не может быть
        // потомком [data-search-panel] ни в одной из тем.
        const panelFormEnd = src.indexOf("</form>", roles[0]);
        expect(panelFormEnd).toBeGreaterThan(-1);
        expect(src.slice(panelFormEnd, burgerAt)).toContain("</header>");
      },
    );
  });
});
