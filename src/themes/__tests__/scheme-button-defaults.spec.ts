/**
 * Вид кнопок ПО УМОЛЧАНИЮ (схемы темы из theme.json, схема секции по
 * умолчанию) = вёрстка верстальщиков. Замер в браузере.
 *
 * Решение владельца 2026-09-26 («Кнопки и цветовые схемы — Б»): правило
 * «поле схемы → одно свойство кнопки» (scheme-buttons.ts, сторож
 * scheme-button-roles.spec.ts) остаётся, а стартовые значения схем тем и схема
 * секции по умолчанию подобраны так, чтобы новый магазин выглядел как сайт
 * верстальщиков `<тема>.merfy.ru`. Эталон снят с живых сайтов верстальщиков
 * 2026-09-26 (цвета фона/текста/рамки нарисованной кнопки); где у
 * верстальщиков кнопки нет (вторая кнопка Hero, «Мультиряды»), эталон — вид
 * прежнего порта, приведённый к правилу.
 *
 * Прозрачного фона в схеме нет. Там, где у верстальщиков контур поверх фото,
 * фон кнопки = фон схемы секции (`OUTLINE_ON_PHOTO` ниже).
 *
 * `border: "как фон"` — рамка того же цвета, что заливка: на экране рамки нет,
 * как у верстальщиков.
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright";

import { buildTokensCss } from "../tokens-css";
import { renderSections, SITES_ROOT, themeCss } from "../../../scripts/qa/lib";

type Look = { bg: string; text: string; border: string };
type Case = {
  name: string;
  block: string;
  props: Record<string, unknown>;
  role: "primary" | "secondary";
  look: Look;
};

const AS_BG = "как фон";
const look = (bg: string, text: string, border = AS_BG): Look => ({
  bg,
  text,
  border,
});
const btn = (text: string, link = "/catalog") => ({
  text,
  link: { href: link },
});
const HERO = {
  mode: "single",
  primaryButton: btn("Основная"),
  secondaryButton: btn("Дополнительная"),
};
const ROW = (buttonStyle: string) => ({
  buttonStyle,
  rows: [
    {
      id: "r1",
      title: "Ряд",
      description: "Текст",
      image: "",
      button: btn("Кнопка"),
    },
  ],
});
const COLUMNS = {
  buttonText: "Кнопка",
  buttonLink: "/catalog",
  columns: [{ id: "c1", title: "Колонка", text: "Текст" }],
};
const SLIDE = {
  slides: [
    {
      id: "s1",
      heading: { text: "Слайд" },
      text: { content: "Текст" },
      button: btn("Кнопка"),
    },
  ],
};
const PRODUCT = {
  productId: "",
  buttons: {
    addToCart: { text: "В корзину" },
    buyNow: { text: "Купить сейчас" },
  },
  dynamicButton: "true",
};

/**
 * Вторая кнопка Hero лежит на фото; у прежнего порта она была прозрачным
 * контуром. Прозрачного в схеме нет — заливка = фон схемы секции.
 */
const OUTLINE_ON_PHOTO = "контур поверх фото → заливка цветом фона схемы";

const ETALON: Record<string, Case[]> = {
  rose: [
    {
      name: "Hero · основная («В каталог» верстальщиков)",
      block: "Hero",
      props: HERO,
      role: "primary",
      look: look("#ffffff", "#000000"),
    },
    {
      name: `Hero · дополнительная (${OUTLINE_ON_PHOTO})`,
      block: "Hero",
      props: HERO,
      role: "secondary",
      look: look("#000000", "#ffffff", "#ffffff"),
    },
    {
      name: "Основной текст",
      block: "MainText",
      props: { button: btn("Кнопка") },
      role: "primary",
      look: look("#000000", "#ffffff"),
    },
    {
      name: "Мультиряды · дополнительная",
      block: "MultiRows",
      props: ROW("secondary"),
      role: "secondary",
      look: look("#ffffff", "#000000", "#000000"),
    },
  ],
  vanilla: [
    {
      name: "Hero · основная («Перейти к коллекции»)",
      block: "Hero",
      props: HERO,
      role: "primary",
      look: look("#3a4530", "#ffffff"),
    },
    {
      name: "Hero · дополнительная (светлая заливка схемы)",
      block: "Hero",
      props: HERO,
      role: "secondary",
      look: look("#eeeeee", "#26311c"),
    },
    {
      name: "Основной текст на главной («К покупкам» — белый контур)",
      block: "MainText",
      props: { colorScheme: "scheme-5", button: btn("К покупкам") },
      role: "primary",
      look: look("#3a4530", "#ffffff", "#ffffff"),
    },
    {
      name: "Основной текст, добавленный мерчантом",
      block: "MainText",
      props: { button: btn("Кнопка") },
      role: "primary",
      look: look("#3a4530", "#ffffff", "#ffffff"),
    },
    {
      name: "Изображение с текстом (белый контур)",
      block: "ImageWithText",
      props: { button: btn("Кнопка") },
      role: "primary",
      look: look("#3a4530", "#ffffff", "#ffffff"),
    },
    {
      name: "Подписка («Отправить» — белая)",
      block: "Newsletter",
      props: { buttonText: "Отправить" },
      role: "primary",
      look: look("#ffffff", "#3a4530"),
    },
    {
      name: "Мультиколонны",
      block: "MultiColumns",
      props: COLUMNS,
      role: "primary",
      look: look("#3a4530", "#ffffff"),
    },
  ],
  flux: [
    {
      name: "Hero · основная («Новинки 2026»)",
      block: "Hero",
      props: HERO,
      role: "primary",
      look: look("#1e2952", "#ffffff"),
    },
    {
      name: "Товар · «Добавить в корзину» — контур",
      block: "Product",
      props: PRODUCT,
      role: "primary",
      look: look("#ffffff", "#1e2952", "#1e2952"),
    },
    {
      name: "Товар · «Купить сейчас» — заливка",
      block: "Product",
      props: PRODUCT,
      role: "secondary",
      look: look("#1e2952", "#ffffff"),
    },
    {
      name: "Изображение с текстом («Смотреть новинки»)",
      block: "ImageWithText",
      props: { button: btn("Кнопка") },
      role: "primary",
      look: look("#1e2952", "#ffffff"),
    },
    {
      name: "Основной текст",
      block: "MainText",
      props: { button: btn("Кнопка") },
      role: "primary",
      look: look("#1e2952", "#ffffff"),
    },
    {
      name: "Мультиколонны",
      block: "MultiColumns",
      props: COLUMNS,
      role: "primary",
      look: look("#1e2952", "#ffffff"),
    },
  ],
  satin: [
    {
      name: "Hero · основная («Новые поступления»)",
      block: "Hero",
      props: HERO,
      role: "primary",
      look: look("#000000", "#ffffff"),
    },
    {
      name: "Мультиколонны",
      block: "MultiColumns",
      props: COLUMNS,
      role: "primary",
      look: look("#000000", "#ffffff"),
    },
    {
      name: "Слайд-шоу · кнопка читается на фото (схема 4)",
      block: "Slideshow",
      props: SLIDE,
      role: "primary",
      look: look("#ffffff", "#000000"),
    },
  ],
  bloom: [
    {
      name: "Hero на главной («Начать ритуал»)",
      block: "Hero",
      props: { ...HERO, colorScheme: "scheme-3" },
      role: "primary",
      look: look("#cf7a8b", "#ffffff"),
    },
    {
      name: "Основной текст на розовом («Подробнее» — белая, чёрный текст)",
      block: "MainText",
      props: { colorScheme: "scheme-2", button: btn("Подробнее") },
      role: "primary",
      look: look("#ffffff", "#000000"),
    },
    {
      name: "Изображение с текстом на розовом («К продукции»)",
      block: "ImageWithText",
      props: { colorScheme: "scheme-2", button: btn("К продукции") },
      role: "primary",
      look: look("#ffffff", "#000000"),
    },
    {
      name: "Мультиряды · дополнительная",
      block: "MultiRows",
      props: ROW("secondary"),
      role: "secondary",
      look: look("#cf7a8b", "#ffffff"),
    },
  ],
};

/** Схема секции — как у композера страницы (resolveBlockScheme): проп, иначе blockDefaults темы. */
function schemeOf(
  theme: string,
  block: string,
  props: Record<string, unknown>,
): string | null {
  const manifest = JSON.parse(
    readFileSync(
      resolve(SITES_ROOT, `packages/theme-${theme}/theme.json`),
      "utf8",
    ),
  );
  const raw = props.colorScheme ?? manifest.blockDefaults?.[block]?.colorScheme;
  return raw ? String(raw).replace(/^(?:color-)?scheme-/, "") : null;
}

const hex = (rgb: string): string => {
  const n = rgb.match(/\d+/g) ?? [];
  if (/^rgba\(0, 0, 0, 0\)/.test(rgb)) return "прозрачный";
  return (
    "#" +
    n
      .slice(0, 3)
      .map((x) => Number(x).toString(16).padStart(2, "0"))
      .join("")
  );
};

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
});

const strip = (h: string): string =>
  h.replace(/<script\b[\s\S]*?<\/script>/gi, "");

async function measure(theme: string): Promise<string[]> {
  const cases = ETALON[theme];
  const rendered = renderSections(
    theme,
    cases.map((c, i) => ({
      block: c.block,
      props: { id: `${c.block}-${i}`, ...c.props },
    })),
  );
  const body = rendered
    .map((r, i) => {
      const sc = schemeOf(theme, cases[i].block, cases[i].props);
      const inner = strip(r.html ?? "");
      return `<div data-probe="${i}">${sc ? `<div class="color-scheme-${sc}" data-block-scheme="${sc}">${inner}</div>` : inner}</div>`;
    })
    .join("");
  const ctx = await (
    await browser()
  ).newContext({ viewport: { width: 1440, height: 1600 } });
  const page = await ctx.newPage();
  await page.route("**/*", (r) =>
    /^(data:|about:)/.test(r.request().url()) ? r.continue() : r.abort(),
  );
  try {
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${themeCss(theme)}</style>` +
        `<style id="__merfy_tokens_css">${buildTokensCss({}, theme)}</style>` +
        `<style>*,*::before,*::after{transition:none!important;animation:none!important}</style></head><body>${body}</body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    const problems: string[] = [];
    for (const [i, c] of cases.entries()) {
      const got = await page.evaluate(
        ([i, role]) => {
          const el = document.querySelector(
            `[data-probe="${i}"] [data-scheme-button="${role}"]`,
          );
          if (!el) return null;
          const s = getComputedStyle(el);
          return {
            bg: s.backgroundColor,
            text: s.color,
            border: s.borderTopColor,
            bw: parseFloat(s.borderTopWidth) || 0,
          };
        },
        [i, c.role] as [number, string],
      );
      if (!got) {
        problems.push(
          `${c.name}: кнопка не найдена (${rendered[i]?.error ?? "нет разметки"})`,
        );
        continue;
      }
      const bg = hex(got.bg);
      const drawn = {
        bg,
        text: hex(got.text),
        border: got.bw > 0 && hex(got.border) !== bg ? hex(got.border) : AS_BG,
      };
      if (JSON.stringify(drawn) !== JSON.stringify(c.look)) {
        problems.push(
          `${c.name}: нарисовано ${JSON.stringify(drawn)}, вёрстка ${JSON.stringify(c.look)}`,
        );
      }
    }
    return problems;
  } finally {
    await ctx.close();
  }
}

describe("кнопки по умолчанию = вёрстка верстальщиков", () => {
  it.each(Object.keys(ETALON))(
    "%s",
    async (theme) => {
      expect(await measure(theme)).toEqual([]);
    },
    180_000,
  );
});
