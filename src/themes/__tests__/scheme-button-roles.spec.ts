/**
 * Кнопки секций красятся ПОЛЯМИ СХЕМЫ своей роли: Фон → фон, Текст → буквы,
 * Обводка → рамка. Замер в браузере, а не разбор классов.
 *
 * Задача владельца 2026-09-25, дословно:
 *   «Настройка "Кнопки" имеет в себе две кнопки Основную и Дополнительную,
 *    которые меняются в зависимости от настройки цветовой схемы
 *    (Основная-Основная, Дополнительная-Дополнительная).
 *    Настройка "Кнопка" имеет в себе одну единственную кнопку Основная…
 *    Дополнительная кнопка сейчас изменяется одной настройкой в цветовой схеме
 *    Фон (меняет и текст и обводку, фон не меняет)… Внутри цветовых схем не
 *    работает настройка "Обводка".»
 *
 * ЗАМЕР ДО (прод, путь превью конструктора: tokens-css + preview/block,
 * 2026-09-25): из 55 кнопок «тема × секция» верно красились 10. Рамки цвета
 * «Обводки» не было почти нигде; «Дополнительная» в Hero rose/vanilla/flux/satin
 * была прозрачной, а текст и рамку брала из ОДНОГО поля (Фон дополнительной
 * у vanilla, Фон ОСНОВНОЙ у rose/flux); одиночная «Кнопка» у vanilla/flux/bloom
 * в части секций садилась на Дополнительную.
 *
 * КАК МЕРИМ. Каждому полю схемы — свой уникальный цвет (все схемы магазина
 * одинаковые, так что неважно, какую схему секция выбрала по умолчанию).
 * Нарисованный цвет фона, текста и рамки кнопки однозначно называет поле,
 * из которого он пришёл. Требование: у кнопки роли R фон = R.Фон, текст =
 * R.Текст, рамка видна и = R.Обводка. Этого достаточно для «меняются
 * независимо»: три свойства — три разных поля.
 *
 * Два набора CSS: витрина (dist/theme-css/<тема>.css) и превью конструктора
 * (dist/preview-tailwind.css + CSS темы) — в обоих токены идут последними,
 * как на странице.
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all,
 * pnpm build:preview-tailwind.
 */
import { chromium, type Browser, type Page } from "playwright";

import { buildTokensCss } from "../tokens-css";
import { previewCss, renderSections, themeCss } from "../../../scripts/qa/lib";

const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

/** Поле схемы → уникальный цвет. */
const FIELD_COLOR = {
  "Основная.Фон": "#ff0000",
  "Основная.Текст": "#00c800",
  "Основная.Обводка": "#0000ff",
  "Основная.Фон при наведении": "#800000",
  "Основная.Текст при наведении": "#006400",
  "Дополнительная.Фон": "#ffa500",
  "Дополнительная.Текст": "#00c8c8",
  "Дополнительная.Обводка": "#a000ff",
  "Дополнительная.Фон при наведении": "#804000",
  "Дополнительная.Текст при наведении": "#006464",
  "Схема.Фон": "#fafaf0",
  "Схема.Текст": "#333333",
  "Схема.Заголовок": "#222222",
} as const;
type Field = keyof typeof FIELD_COLOR;

const probeScheme = (id: string) => ({
  id,
  name: id,
  background: FIELD_COLOR["Схема.Фон"],
  surfaceBg: FIELD_COLOR["Схема.Фон"],
  heading: FIELD_COLOR["Схема.Заголовок"],
  text: FIELD_COLOR["Схема.Текст"],
  primaryButton: {
    background: FIELD_COLOR["Основная.Фон"],
    text: FIELD_COLOR["Основная.Текст"],
    border: FIELD_COLOR["Основная.Обводка"],
    backgroundHover: FIELD_COLOR["Основная.Фон при наведении"],
    textHover: FIELD_COLOR["Основная.Текст при наведении"],
  },
  secondaryButton: {
    background: FIELD_COLOR["Дополнительная.Фон"],
    text: FIELD_COLOR["Дополнительная.Текст"],
    border: FIELD_COLOR["Дополнительная.Обводка"],
    backgroundHover: FIELD_COLOR["Дополнительная.Фон при наведении"],
    textHover: FIELD_COLOR["Дополнительная.Текст при наведении"],
  },
});
const SCHEMES = Array.from({ length: 8 }, (_, i) =>
  probeScheme(`scheme-${i + 1}`),
);

const rgbOf = (hex: string): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const FIELD_BY_RGB = new Map(
  (Object.entries(FIELD_COLOR) as [Field, string][]).map(([f, hex]) => [
    rgbOf(hex),
    f,
  ]),
);
const fieldOf = (rgb: string): string =>
  FIELD_BY_RGB.get(rgb) ?? `не поле схемы (${rgb})`;

type Role = "Основная" | "Дополнительная";
type ButtonCase = { label: string; role: Role };
type SectionCase = {
  name: string;
  block: string;
  props: Record<string, unknown>;
  buttons: ButtonCase[];
};

const PRIMARY = (label: string): ButtonCase => ({ label, role: "Основная" });
const SECONDARY = (label: string): ButtonCase => ({
  label,
  role: "Дополнительная",
});

/**
 * Секции с настройкой «Кнопки» (две) и «Кнопка» (одна). Текст кнопки —
 * уникальная метка: по ней кнопку и находим в разметке.
 */
const SECTIONS: SectionCase[] = [
  {
    name: "Hero · «Кнопки»",
    block: "Hero",
    props: {
      primaryButton: { text: "ОСНКН", link: "/catalog" },
      secondaryButton: { text: "ДОПКН", link: "/catalog" },
    },
    buttons: [PRIMARY("ОСНКН"), SECONDARY("ДОПКН")],
  },
  {
    name: "Товар · «Кнопки»",
    block: "Product",
    props: {
      productId: "",
      buttons: { addToCart: { text: "ОСНКН" }, buyNow: { text: "ДОПКН" } },
      dynamicButton: "true",
    },
    buttons: [PRIMARY("ОСНКН"), SECONDARY("ДОПКН")],
  },
  {
    name: "Основной текст · «Кнопка»",
    block: "MainText",
    props: {
      heading: { text: "Заголовок" },
      text: { content: "Текст" },
      button: { text: "ОДНКН", link: "/catalog" },
      cta: { enabled: "true", text: "ОДНКН", link: "/catalog" },
    },
    buttons: [PRIMARY("ОДНКН")],
  },
  {
    name: "Изображение с текстом · «Кнопка»",
    block: "ImageWithText",
    props: {
      heading: "Заголовок",
      text: "Текст",
      button: { text: "ОДНКН", link: "/about" },
    },
    buttons: [PRIMARY("ОДНКН")],
  },
  {
    name: "Вход · «Кнопка»",
    block: "LoginSection",
    props: { button: { text: "ОДНКН" } },
    buttons: [PRIMARY("ОДНКН")],
  },
  {
    name: "Рассылка · «Кнопка»",
    block: "Newsletter",
    props: { heading: "Подписка", buttonText: "ОДНКН" },
    buttons: [PRIMARY("ОДНКН")],
  },
  {
    name: "Мультиколонны · «Кнопка»",
    block: "MultiColumns",
    // С колонкой: без колонок секция рисует заглушку, а у satin в заглушке
    // общей кнопки нет (кнопку рисует каждая колонка).
    props: {
      buttonText: "ОДНКН",
      buttonLink: "/catalog",
      columns: [{ id: "c1", title: "Колонка", text: "Текст колонки" }],
    },
    buttons: [PRIMARY("ОДНКН")],
  },
  {
    name: "Слайд-шоу · «Кнопка» слайда",
    block: "Slideshow",
    props: {
      slides: [
        {
          id: "s1",
          heading: { text: "Слайд" },
          text: { content: "Текст" },
          button: { text: "ОДНКН", link: "/catalog" },
          ctaText: "ОДНКН",
          ctaLink: "/catalog",
        },
      ],
    },
    buttons: [PRIMARY("ОДНКН")],
  },
  {
    name: "Мультиряды · «Кнопка» ряда, стиль «Основная»",
    block: "MultiRows",
    props: {
      buttonStyle: "primary",
      rows: [
        {
          id: "r1",
          title: "Ряд",
          description: "Текст",
          image: "",
          button: { text: "ОДНКН", link: "/catalog" },
        },
      ],
    },
    buttons: [PRIMARY("ОДНКН")],
  },
  {
    name: "Мультиряды · «Кнопка» ряда, стиль «Дополнительная»",
    block: "MultiRows",
    props: {
      buttonStyle: "secondary",
      rows: [
        {
          id: "r1",
          title: "Ряд",
          description: "Текст",
          image: "",
          button: { text: "ДОПКН", link: "/catalog" },
        },
      ],
    },
    buttons: [SECONDARY("ДОПКН")],
  },
];

type Painted = {
  bg: string;
  text: string;
  border: string;
  borderWidth: number;
  borderStyle: string;
} | null;

/**
 * Исполняется В БРАУЗЕРЕ: самый внутренний a/button секции с меткой в тексте
 * и то, что на нём НАРИСОВАНО.
 */
function paintOf([probeId, label]: [string, string]): Painted {
  const host = document.querySelector(`[data-probe="${probeId}"]`);
  if (!host) return null;
  const hits = Array.from(host.querySelectorAll("a,button")).filter((el) =>
    (el.textContent ?? "").toUpperCase().includes(label),
  );
  const el = hits.find((h) => !hits.some((o) => o !== h && h.contains(o)));
  if (!el) return null;
  el.setAttribute("data-probe-button", `${probeId}-${label}`);
  const cs = getComputedStyle(el);
  return {
    bg: cs.backgroundColor,
    text: cs.color,
    border: cs.borderTopColor,
    borderWidth: Number.parseFloat(cs.borderTopWidth) || 0,
    borderStyle: cs.borderTopStyle,
  };
}

/** Наведение: фон и текст обязаны взять поля «При наведении» своей роли. */
function hoverMismatches(p: Painted, role: Role): string[] {
  if (!p) return ["кнопка не найдена при наведении"];
  const got: Record<string, string> = {
    "Фон при наведении": fieldOf(p.bg),
    "Текст при наведении": fieldOf(p.text),
  };
  return Object.entries(got)
    .filter(([prop, field]) => field !== `${role}.${prop}`)
    .map(([prop, field]) => `${prop}: ${field}, ждали ${role}.${prop}`);
}

/** Что не так с кнопкой: пустой список — всё верно. */
function mismatches(p: Painted, role: Role): string[] {
  if (!p) return ["кнопка не найдена"];
  const border =
    p.borderWidth > 0 && p.borderStyle !== "none"
      ? fieldOf(p.border)
      : "рамки нет";
  const got: Record<string, string> = {
    Фон: fieldOf(p.bg),
    Текст: fieldOf(p.text),
    Обводка: border,
  };
  return Object.entries(got)
    .filter(([prop, field]) => field !== `${role}.${prop}`)
    .map(([prop, field]) => `${prop}: ${field}, ждали ${role}.${prop}`);
}

/**
 * Цвет кнопки под курсором. Переходы на странице замера выключены: иначе
 * `transition-colors` отдаёт промежуточный цвет в середине анимации.
 */
async function hoverPaint(page: Page, id: string): Promise<Painted> {
  const sel = `[data-probe-button="${id}"]`;
  await page.hover(sel, { force: true, timeout: 5_000 });
  const painted = await page.$eval(sel, (el) => {
    const cs = getComputedStyle(el);
    return {
      bg: cs.backgroundColor,
      text: cs.color,
      border: cs.borderTopColor,
      borderWidth: Number.parseFloat(cs.borderTopWidth) || 0,
      borderStyle: cs.borderTopStyle,
    };
  });
  await page.mouse.move(0, 0);
  return painted;
}

const NO_TRANSITIONS =
  "<style>*,*::before,*::after{transition:none!important;animation:none!important}</style>";

let shared: Browser | null = null;
async function browser(): Promise<Browser> {
  if (shared) return shared;
  shared = await chromium
    .launch()
    .catch(() => chromium.launch({ channel: "chrome" }));
  return shared;
}
afterAll(async () => {
  await shared?.close();
  shared = null;
});

const stripScripts = (html: string): string =>
  html.replace(/<script\b[\s\S]*?<\/script>/gi, "");

const CSS_SETS = {
  витрина: (theme: string) => [themeCss(theme)],
  "превью конструктора": (theme: string) => [previewCss(), themeCss(theme)],
} as const;

async function measureTheme(
  theme: string,
  cssSet: keyof typeof CSS_SETS,
): Promise<string[]> {
  const rendered = renderSections(
    theme,
    SECTIONS.map((s, i) => ({
      block: s.block,
      props: { id: `${s.block}-${i}`, colorScheme: "scheme-1", ...s.props },
    })),
  );
  const body = rendered
    .map(
      (r, i) => `<div data-probe="p${i}">${stripScripts(r.html ?? "")}</div>`,
    )
    .join("\n");
  const styles = CSS_SETS[cssSet](theme)
    .map((css) => `<style>${css}</style>`)
    .join("");
  const tokens = buildTokensCss({ colorSchemes: SCHEMES }, theme);
  const ctx = await (
    await browser()
  ).newContext({ viewport: { width: 1440, height: 1600 } });
  const page = await ctx.newPage();
  await page.route("**/*", (route) =>
    /^(data:|about:)/.test(route.request().url())
      ? route.continue()
      : route.abort(),
  );
  try {
    await page.setContent(
      `<!doctype html><html lang="ru"><head><meta charset="utf-8">${styles}` +
        `<style id="__merfy_tokens_css">${tokens}</style>${NO_TRANSITIONS}</head><body>${body}</body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    const problems: string[] = [];
    for (const [i, s] of SECTIONS.entries()) {
      if (!rendered[i]?.html) {
        problems.push(
          `${s.name}: секция не отрисовалась (${rendered[i]?.error ?? "нет html"})`,
        );
        continue;
      }
      for (const b of s.buttons) {
        const painted = await page.evaluate(paintOf, [`p${i}`, b.label] as [
          string,
          string,
        ]);
        for (const m of mismatches(painted, b.role))
          problems.push(`${s.name} · ${b.role} · ${m}`);
        if (!painted) continue;
        const hovered = await hoverPaint(page, `p${i}-${b.label}`);
        for (const m of hoverMismatches(hovered, b.role))
          problems.push(`${s.name} · ${b.role} · ${m}`);
      }
    }
    return problems;
  } finally {
    await ctx.close();
  }
}

describe.each(Object.keys(CSS_SETS) as (keyof typeof CSS_SETS)[])(
  "кнопки секций ← поля схемы своей роли (%s)",
  (cssSet) => {
    it.each(THEMES)(
      "%s",
      async (theme) => {
        expect(await measureTheme(theme, cssSet)).toEqual([]);
      },
      180_000,
    );
  },
);

describe("саботаж: замер отличает верную кнопку от сломанной", () => {
  const page = (html: string, css: string) =>
    `<!doctype html><html><head><style>${css}</style></head><body><div data-probe="x">${html}</div></body></html>`;

  it("кнопка, у которой текст и рамка взяты из Фона, ловится по двум свойствам", async () => {
    const ctx = await (await browser()).newContext();
    const p = await ctx.newPage();
    const css = `a{background:transparent;color:${FIELD_COLOR["Дополнительная.Фон"]};border:1px solid ${FIELD_COLOR["Дополнительная.Фон"]}}`;
    await p.setContent(page(`<a href="#">ДОПКН</a>`, css));
    const painted = await p.evaluate(paintOf, ["x", "ДОПКН"] as [
      string,
      string,
    ]);
    await ctx.close();
    expect(mismatches(painted, "Дополнительная")).toHaveLength(3);
  });

  it("кнопка без рамки ловится по «Обводке»", async () => {
    const ctx = await (await browser()).newContext();
    const p = await ctx.newPage();
    const css = `a{background:${FIELD_COLOR["Основная.Фон"]};color:${FIELD_COLOR["Основная.Текст"]};border:0}`;
    await p.setContent(page(`<a href="#">ОДНКН</a>`, css));
    const painted = await p.evaluate(paintOf, ["x", "ОДНКН"] as [
      string,
      string,
    ]);
    await ctx.close();
    expect(mismatches(painted, "Основная")).toEqual([
      "Обводка: рамки нет, ждали Основная.Обводка",
    ]);
  });

  it("верная кнопка проходит", async () => {
    const ctx = await (await browser()).newContext();
    const p = await ctx.newPage();
    const css = `a{background:${FIELD_COLOR["Основная.Фон"]};color:${FIELD_COLOR["Основная.Текст"]};border:1px solid ${FIELD_COLOR["Основная.Обводка"]}}`;
    await p.setContent(page(`<a href="#"><span>ОДНКН</span></a>`, css));
    const painted = await p.evaluate(paintOf, ["x", "ОДНКН"] as [
      string,
      string,
    ]);
    await ctx.close();
    expect(mismatches(painted, "Основная")).toEqual([]);
  });
});
