/**
 * Поиск: поле — схема вокруг, кнопка «Найти» — Схема 1. Замер в браузере на
 * НАСТОЯЩИХ схемах тем (packages/theme-<t>/theme.json → themeSchemeToMerchantShape,
 * так конструктор сидирует палитру мерчанта), а не на искусственной паре.
 *
 * История. 15.09 владелец прибил к Схеме 1 весь поиск — поле и кнопку
 * (c6b3b965, «Всегда Схема 1, жёстко»). Сторож тогда гонялся на выдуманной
 * Схеме 1 (#71c0ff/#e91e8c), и то, что у настоящих тем Схема 1 бывает чёрной
 * (flux) или розовой (bloom), он не видел. На витрине это вышло чёрным бруском
 * поля на белой шторке flux и розовым полем с белым текстом у bloom (контраст
 * 3,08). 28.09 владелец: «как у верстальщиков» — Схема 1 только у кнопки
 * «Найти», поле — «Фон» схемы шторки (на десктопе — коробки поиска шапки).
 *
 * ЗАМЕР ДО → ПОСЛЕ (заводские схемы, WebKit iPhone 390, шторка открыта;
 * фон шторки | фон поля | текст поля | контраст):
 *   flux    255 255 255 | 0 0 0 → 255 255 255       | 255 → 0 0 0 | 21 → 21
 *   bloom   255 255 255 | 207 122 139 → 255 255 255 | 255 → 0 0 0 | 3,08 → 21
 *   rose, satin, vanilla — поле уже совпадало со шторкой (у vanilla шапка
 *   стоит на Схеме 1, у rose/satin Схема 1 белая).
 *
 * Что сторожим, на каждой теме:
 *   1) заводская шторка и коробка десктопа: фон поля = фон шторки/коробки =
 *      «Фон» её схемы; контраст введённого текста к полю ≥ 4,5;
 *   2) шторка на КАЖДОЙ схеме темы («Цветовая схема меню»): фон поля = «Фон»
 *      схемы, текст поля = «Заголовок» схемы (у flux «Текст» scheme-2 серый
 *      153 — на белом 2,85, поэтому текст — «Заголовок», как #000 у
 *      верстальщиков);
 *   3) кнопка «Найти» (панель десктопа всегда, шторка — где кнопка с
 *      подписью) = «Кнопка» Схемы 1, при любой схеме вокруг;
 *   4) flux: шторка по вёрстке верстальщиков — рамка 1, скругление 4,
 *      высота 44, отступ 12, текст 16; «Профиль» — «Кнопка 2» схемы шторки,
 *      иконка 32.
 *
 * САБОТАЖ (обязан краснеть): вернуть Схему 1 полю (переменные --color-bg /
 * --color-text на form[role="search"]); убрать переменные кнопки; завернуть
 * правило в @layer utilities; вернуть полю flux «только нижнюю линию»; вернуть
 * «Профилю» роль «Кнопка».
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, type Browser, type Page } from "playwright";

import {
  buildSearchRule,
  buildTokensCss,
  pickSchemeOneTokens,
  themeSchemeToMerchantShape,
} from "../tokens-css";
import { renderSections } from "../../../scripts/qa/lib/render";
import { themeCss } from "../../../scripts/qa/lib/tailwind-css";

const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];
const ROOT = resolve(__dirname, "..", "..", "..");

type Scheme = {
  id: string;
  background: string;
  heading: string;
  primaryButton: { background: string; text: string };
  secondaryButton: { background: string; text: string };
};
type Block = { type: string; props: Record<string, unknown> };

const hexToRgb = (hex: string): string => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const channels = (css: string): number[] =>
  (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const luminance = (css: string): number => {
  const [r, g, b] = channels(css).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const schemeClass = (id: unknown): string =>
  `color-scheme-${String(id).replace("scheme-", "")}`;
const strip = (html: string): string =>
  html.replace(/<script\b[\s\S]*?<\/script>/gi, "");

/** Заводская тема: схемы мерчанта из theme.json, tokens.css, пропсы шапки главной. */
function factory(theme: Theme) {
  const manifest = JSON.parse(
    readFileSync(resolve(ROOT, `packages/theme-${theme}/theme.json`), "utf8"),
  );
  const schemes = (manifest.colorSchemes as unknown[]).map((s) =>
    themeSchemeToMerchantShape(s as never),
  ) as unknown as Scheme[];
  const home = JSON.parse(
    readFileSync(
      resolve(ROOT, `packages/theme-${theme}/pages/home.json`),
      "utf8",
    ),
  );
  const header = (home.content as Block[]).find((b) => b.type === "Header");
  if (!header) throw new Error(`${theme}: в pages/home.json нет шапки`);
  return {
    schemes,
    tokens: buildTokensCss({ colorSchemes: schemes }, theme),
    header: header.props,
  };
}

/** Страница: CSS темы + tokens.css + шапка в обёртке своей схемы (как v2-page-composer). */
function pageHtml(
  theme: Theme,
  tokens: string,
  headerHtml: string,
  headerScheme: unknown,
): string {
  const inner = headerScheme
    ? `<div class="${schemeClass(headerScheme)}">${strip(headerHtml)}</div>`
    : strip(headerHtml);
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<style>${themeCss(theme)}</style>
<style id="__merfy_tokens_css">${tokens}</style>
</head><body><main>${inner}</main></body></html>`;
}

let shared: Browser | null = null;
async function browser(): Promise<Browser> {
  shared ??= await chromium
    .launch()
    .catch(() => chromium.launch({ channel: "chrome" }));
  return shared;
}
afterAll(async () => {
  await shared?.close();
  shared = null;
}, 90_000);

async function withPage<T>(
  html: string,
  width: number,
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const ctx = await (
    await browser()
  ).newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.route("**/*", (route) =>
    /^(data:|about:)/.test(route.request().url())
      ? route.continue()
      : route.abort(),
  );
  try {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    return await fn(page);
  } finally {
    await ctx.close();
  }
}

type SearchProbe = {
  hostBg: string;
  fieldBg: string;
  inputColor: string;
  buttonText: string;
  buttonBg: string;
  buttonColor: string;
  form: {
    borderWidth: string;
    radius: string;
    height: number;
    paddingLeft: string;
    fontSize: string;
  };
  profile: { bg: string; icon: number } | null;
};

/**
 * Открыть область поиска (шторку меню или коробку шапки) и снять цвета.
 * Фон — первый непрозрачный вверх по дереву: у формы своего фона может не быть.
 */
function probe(page: Page, host: "drawer" | "panel"): Promise<SearchProbe> {
  return page.evaluate((where) => {
    const effBg = (el: Element | null): string => {
      for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
      }
      return "rgb(255, 255, 255)";
    };
    const root =
      where === "drawer"
        ? document.querySelector<HTMLElement>(
            '[role="dialog"][aria-label="Меню"]',
          )
        : document.querySelector<HTMLElement>("[data-search-panel]");
    if (!root) throw new Error(`нет области поиска: ${where}`);
    root.classList.remove("hidden");
    root.removeAttribute("hidden");
    Object.assign(root.style, {
      maxHeight: "none",
      transition: "none",
      clipPath: "none",
    });
    const box =
      where === "panel"
        ? (root.querySelector("[data-header-search]") ?? root)
        : root;
    const form = root.querySelector<HTMLElement>('form[role="search"]');
    const input = form?.querySelector('input[type="search"]');
    const button = form?.querySelector<HTMLElement>('button[type="submit"]');
    if (!form || !input || !button)
      throw new Error(`нет формы поиска: ${where}`);
    const f = getComputedStyle(form);
    const profile =
      where === "drawer" ? root.querySelector('[aria-label="Профиль"]') : null;
    const icon = profile?.querySelector("svg, img, span");
    return {
      hostBg: effBg(box),
      fieldBg: effBg(form),
      inputColor: getComputedStyle(input).color,
      buttonText: (button.textContent ?? "").trim(),
      buttonBg: getComputedStyle(button).backgroundColor,
      buttonColor: getComputedStyle(button).color,
      form: {
        borderWidth: f.borderTopWidth,
        radius: f.borderTopLeftRadius,
        height: Math.round(form.getBoundingClientRect().height),
        paddingLeft: f.paddingLeft,
        fontSize: getComputedStyle(input).fontSize,
      },
      profile: profile
        ? {
            bg: getComputedStyle(profile).backgroundColor,
            icon: Math.round(icon?.getBoundingClientRect().width ?? 0),
          }
        : null,
    };
  }, host);
}

/** Шапка темы: заводская + по одной на каждую схему шторки. */
function renderHeaders(theme: Theme) {
  const f = factory(theme);
  const variants: Array<{
    label: string;
    props: Record<string, unknown>;
    drawerScheme: string;
  }> = [
    {
      label: "заводская",
      props: f.header,
      drawerScheme: String(
        f.header.menuColorScheme ?? f.header.colorScheme ?? "",
      ),
    },
    ...f.schemes.map((s) => ({
      label: `шторка на ${s.id}`,
      props: { ...f.header, menuColorScheme: s.id },
      drawerScheme: s.id,
    })),
  ];
  const rendered = renderSections(
    theme,
    variants.map((v) => ({ block: "Header", props: v.props })),
  );
  return variants.map((v, i) => {
    const html = rendered[i]?.html;
    if (!html)
      throw new Error(
        `${theme}: шапка «${v.label}» не отрисовалась: ${rendered[i]?.error ?? "нет HTML"}`,
      );
    return { ...v, html };
  });
}

const scheme = (schemes: Scheme[], id: string): Scheme | undefined =>
  schemes.find((s) => s.id === id);

describe("поиск: поле — схема вокруг, «Найти» — Схема 1 (настоящие theme.json)", () => {
  describe.each(THEMES)("%s", (theme) => {
    const f = factory(theme);
    const scheme1 = scheme(f.schemes, "scheme-1");
    let headers: ReturnType<typeof renderHeaders> = [];
    beforeAll(() => {
      headers = renderHeaders(theme);
    }, 120_000);

    it("заводская шторка 390: фон поля = фон шторки, текст читается, «Найти» = Схема 1", async () => {
      const h = headers[0];
      const m = await withPage(
        pageHtml(theme, f.tokens, h.html, f.header.colorScheme),
        390,
        (p) => probe(p, "drawer"),
      );
      const own = scheme(f.schemes, h.drawerScheme);
      expect({ theme, фонПоля: m.fieldBg }).toEqual({
        theme,
        фонПоля: m.hostBg,
      });
      if (own)
        expect({ theme, фонПоля: m.fieldBg }).toEqual({
          theme,
          фонПоля: hexToRgb(own.background),
        });
      expect(contrast(m.inputColor, m.fieldBg)).toBeGreaterThanOrEqual(4.5);
      if (m.buttonText === "Найти" && scheme1) {
        expect({ theme, кнопка: [m.buttonBg, m.buttonColor] }).toEqual({
          theme,
          кнопка: [
            hexToRgb(scheme1.primaryButton.background),
            hexToRgb(scheme1.primaryButton.text),
          ],
        });
      }
    }, 120_000);

    it("шапка 1440: фон поля = фон коробки поиска, текст читается, «Найти» = Схема 1", async () => {
      const h = headers[0];
      const m = await withPage(
        pageHtml(theme, f.tokens, h.html, f.header.colorScheme),
        1440,
        (p) => probe(p, "panel"),
      );
      expect({ theme, фонПоля: m.fieldBg }).toEqual({
        theme,
        фонПоля: m.hostBg,
      });
      expect(contrast(m.inputColor, m.fieldBg)).toBeGreaterThanOrEqual(4.5);
      expect(m.buttonText).toBe("Найти");
      expect({ theme, кнопка: [m.buttonBg, m.buttonColor] }).toEqual({
        theme,
        кнопка: [
          hexToRgb(scheme1!.primaryButton.background),
          hexToRgb(scheme1!.primaryButton.text),
        ],
      });
    }, 120_000);

    it("шторка на каждой схеме темы: поле — «Фон» и «Заголовок» схемы, «Найти» — Схема 1", async () => {
      const rows: unknown[] = [];
      const expected: unknown[] = [];
      for (const h of headers.slice(1)) {
        const own = scheme(f.schemes, h.drawerScheme)!;
        const m = await withPage(
          pageHtml(theme, f.tokens, h.html, f.header.colorScheme),
          390,
          (p) => probe(p, "drawer"),
        );
        const buttonIsText = m.buttonText === "Найти";
        rows.push({
          схема: own.id,
          фон: m.fieldBg,
          текст: m.inputColor,
          кнопка: buttonIsText ? m.buttonBg : "иконка",
        });
        expected.push({
          схема: own.id,
          фон: hexToRgb(own.background),
          текст: hexToRgb(own.heading),
          кнопка: buttonIsText
            ? hexToRgb(scheme1!.primaryButton.background)
            : "иконка",
        });
      }
      expect(rows).toEqual(expected);
    }, 120_000);
  });

  it("flux: шторка по вёрстке верстальщиков, «Профиль» — «Кнопка 2» схемы шторки", async () => {
    const f = factory("flux");
    const [h] = renderHeaders("flux");
    const own = scheme(f.schemes, String(f.header.colorScheme))!;
    const m = await withPage(
      pageHtml("flux", f.tokens, h.html, f.header.colorScheme),
      390,
      (p) => probe(p, "drawer"),
    );
    expect(m.form).toEqual({
      borderWidth: "1px",
      radius: "4px",
      height: 44,
      paddingLeft: "12px",
      fontSize: "16px",
    });
    expect(m.buttonText).toBe("Найти");
    expect(m.profile).toEqual({
      bg: hexToRgb(own.secondaryButton.background),
      icon: 32,
    });
  }, 120_000);

  describe("правило tokens.css", () => {
    it.each(THEMES)("%s: правило не завёрнуто в @layer", (theme) => {
      // Литералы портов (`bg-white`, `bg-[#1e2952]`) лежат в @layer utilities:
      // бить их может только безслойное объявление.
      const css = buildTokensCss({}, theme);
      const at = css.indexOf('form[role="search"]{');
      expect(at).toBeGreaterThan(-1);
      // Глубина вложенности к началу правила: 0 — верхний уровень, вне @layer.
      const before = css.slice(0, at);
      const depth =
        (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
      expect(depth).toBe(0);
    });

    it("нет Схемы 1 — нет переменных кнопки, поле остаётся за схемой вокруг", () => {
      const rule = buildSearchRule(null);
      expect(rule).toContain(
        'form[role="search"]{background-color:rgb(var(--color-bg));}',
      );
      expect(rule).not.toContain("--color-button-bg:");
    });

    it("scheme-10 мерчанта не читается как Схема 1", () => {
      expect(
        pickSchemeOneTokens(".color-scheme-10 { --color-button-bg: 1 2 3; }"),
      ).toBeNull();
    });

    it("поле не получает переменных Схемы 1", () => {
      // Именно так было до 28.09: --color-bg/--color-text Схемы 1 на корне формы.
      const rule = buildSearchRule(
        pickSchemeOneTokens(
          ".color-scheme-1 { --color-bg: 1 2 3; --color-button-bg: 4 5 6; --color-button-text: 7 8 9; }",
        ),
      );
      expect(rule).not.toContain("--color-bg:1 2 3");
      expect(rule).toContain(
        'form[role="search"] button[type="submit"]{--color-button-bg:4 5 6;--color-button-text:7 8 9;}',
      );
    });
  });
});
