/**
 * Мишени секции обязаны краситься ТОКЕНОМ СХЕМЫ, который схема реально несёт.
 *
 * Жалобы владельца 15.09 (магазин `695f190f…`, схемы переключаются, тема
 * меняется — один сайт на все пять тем):
 *   flux  — «Товар»: не применяется цветовая схема к секции (+ сломан макет
 *           «Сложенный»); «Корзина»: не применяется схема; «Избранное»: не
 *           применяется к ЗАГОЛОВКУ;
 *   bloom — «Коллекция товаров»: не применяется схема к ЗАГОЛОВКУ.
 *
 * ЗАМЕР «ДО» (chromium 1440, реальный CSS темы + схемы САМОГО магазина,
 * снятые с живого стенда из `<style id="__merfy_tokens_css">`:
 * схема-1 «Фон» #d14d4d / «Заголовок» #ffffff, схема-4 «Фон» #f5f0eb /
 * «Заголовок» #1a1a1a):
 *
 *   секция                   мишень        схема-1 → схема-4
 *   flux Товар               фон секции    255,255,255 → 255,255,255  (bg-white)
 *   flux Товар               фон кнопки    255,255,255 → 255,255,255  (bg-white)
 *   flux Товар               текст кнопки  30,41,82    → 30,41,82     (#1e2952)
 *   flux Товар               заголовок     0,0,0       → 0,0,0        (#000000)
 *   flux Корзина             фон секции    255,255,255 → 255,255,255  (bg-white)
 *   flux Корзина             заголовок     0,0,0       → 0,0,0        (text-black)
 *   flux Избранное           заголовок     0,0,0       → 0,0,0        (#000000)
 *   bloom Коллекция товаров  заголовок     0,0,0       → 0,0,0        (#000000)
 *
 * ПОЧЕМУ ДВА УСЛОВИЯ, А НЕ ОДНО. «Класс ссылается на переменную» — мало:
 *   • литерал `bg-white` в Tailwind 4 компилируется в `var(--color-white)`,
 *     то есть переменная ЕСТЬ, а схемы в ней нет;
 *   • `--color-primary` объявлен в схемах `theme.json`, но мерчантская схема
 *     (`schemeToVars` в `src/themes/tokens-css.ts`) его НЕ печатает — значит у
 *     магазина, где схему правили, узел молча падает на `:root`.
 * Поэтому проверка требует, чтобы токен был объявлен в правиле
 * `.color-scheme-N` МЕРЧАНТСКОЙ схемы и нёс её цвет.
 *
 * Считаем цвет теми же двумя артефактами, из которых его собирает браузер:
 *   1) `dist/theme-css/<тема>.css` — какая переменная стоит за утилитой;
 *   2) `buildTokensCss(themeSettings, тема)` — какое ЧИСЛО лежит в переменной.
 * Класс берётся из ЖИВОГО рендера порта (та же лестница, что у витрины:
 * manifest темы → пакет темы → theme-base), а не из исходного текста.
 *
 * Рендер требует сборки:
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildTokensCss } from "../tokens-css";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
/** flux/bloom/vanilla резолвят товар HTTP-запросом во фронтматтере. */
const CATALOG_STUB = resolve(SITES_ROOT, "scripts/qa/product-six-images-stub.mjs");

/**
 * Схемы РЕАЛЬНОГО магазина тестировщика. Важно, что они МЕРЧАНТСКИЕ: заводские
 * схемы темы печатаются другим путём (`buildThemeSchemeRule`) и несут больше
 * токенов — на них баг с `--color-primary` не воспроизводится вовсе.
 */
const SCHEMES = JSON.parse(
  readFileSync(resolve(SITES_ROOT, "scripts/qa/tester-schemes.json"), "utf8"),
) as Array<Record<string, unknown>>;
const SCHEME_A = "1"; // «Фон» #d14d4d, «Заголовок» #ffffff
const SCHEME_B = "4"; // «Фон» #f5f0eb, «Заголовок» #1a1a1a

type Case = {
  theme: string;
  block: string;
  /** Как называется секция в конструкторе — для читаемого имени проверки. */
  label: string;
  /** Подпись мишени. */
  target: string;
  /** data-атрибут или id узла в отпечатанной разметке. */
  marker: string;
  /** Какое свойство меряем. */
  prop: "background-color" | "color";
  /** Какое поле схемы обязано победить. */
  expect: "--color-bg" | "--color-heading" | "--color-button-bg" | "--color-button-text";
};

const CASES: Case[] = [
  { theme: "flux", block: "Product", label: "Товар", target: "фон секции", marker: 'data-block="featured-product"', prop: "background-color", expect: "--color-bg" },
  { theme: "flux", block: "Product", label: "Товар", target: "заголовок", marker: "data-cfg-name", prop: "color", expect: "--color-heading" },
  { theme: "flux", block: "Product", label: "Товар", target: "цена", marker: "data-cfg-price", prop: "color", expect: "--color-heading" },
  { theme: "flux", block: "Product", label: "Товар", target: "фон динамической кнопки", marker: "data-cfg-buy", prop: "background-color", expect: "--color-button-bg" },
  { theme: "flux", block: "Product", label: "Товар", target: "текст динамической кнопки", marker: "data-cfg-buy", prop: "color", expect: "--color-button-text" },
  { theme: "flux", block: "Product", label: "Товар", target: "фон основной кнопки", marker: "data-add-to-cart", prop: "background-color", expect: "--color-bg" },
  { theme: "flux", block: "Product", label: "Товар", target: "текст основной кнопки", marker: "data-add-to-cart", prop: "color", expect: "--color-button-bg" },
  { theme: "flux", block: "CartSection", label: "Корзина", target: "фон секции", marker: 'data-block="cart-section"', prop: "background-color", expect: "--color-bg" },
  { theme: "flux", block: "CartBody", label: "Корзина (тело)", target: "фон секции", marker: 'data-block="cart-body"', prop: "background-color", expect: "--color-bg" },
  { theme: "flux", block: "CartSummary", label: "Промежуточный итог", target: "фон секции", marker: 'data-block="cart-summary"', prop: "background-color", expect: "--color-bg" },
  { theme: "flux", block: "CartSection", label: "Корзина", target: "заголовок", marker: 'id="cart-title"', prop: "color", expect: "--color-heading" },
  { theme: "flux", block: "WishlistSection", label: "Избранное", target: "заголовок", marker: 'id="wishlist-title"', prop: "color", expect: "--color-heading" },
  { theme: "bloom", block: "PopularProducts", label: "Коллекция товаров", target: "заголовок", marker: 'id="popular-title"', prop: "color", expect: "--color-heading" },
];

const THEMES = [...new Set(CASES.map((c) => c.theme))];

const built = (theme: string) =>
  existsSync(resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"));

/** Живой рендер порта — та же лестница, что у витрины. */
function renderLive(theme: string, block: string, layout?: string): string {
  const jobs = [
    {
      block,
      cascade: true,
      live: true,
      props: {
        id: `${block}-1`,
        productId: "p1",
        colorScheme: `scheme-${SCHEME_A}`,
        padding: { top: 40, bottom: 40 },
        ...(layout ? { layout } : {}),
      },
    },
  ];
  const out = execFileSync(
    "node",
    ["--import", CATALOG_STUB, RENDERER, theme, JSON.stringify(jobs)],
    { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 128 * 1024 * 1024 },
  );
  const row = (JSON.parse(out) as Array<{ html?: string; error?: string }>)[0];
  if (!row.html) {
    throw new Error(`рендер ${block} (${theme}) не дал HTML: ${JSON.stringify(row)}`);
  }
  return row.html;
}

/**
 * Классы узла, помеченного data-атрибутом или id (первый в разметке).
 *
 * Граница после имени атрибута обязательна: `data-cfg-thumb` без неё ловил
 * `data-cfg-thumbs-track`, и «плитка» мерилась по ЛЕНТЕ — проверка падала не
 * на том узле (поймано 15.09 на первом же прогоне).
 */
function classesOf(html: string, marker: string): string[] {
  const esc = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bounded = /=/.test(marker) ? esc : `${esc}(?![a-z0-9-])`;
  const tag = new RegExp(`<[a-z0-9]+[^>]*${bounded}[^>]*>`, "i").exec(html)?.[0];
  if (!tag) throw new Error(`узел ${marker} в разметке не найден`);
  return (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

/** Селектор класса ровно в том виде, в каком его печатает Tailwind. */
const cssSelectorOf = (cls: string) =>
  `.${cls.replace(/[.[\]()#/%,:!*+~='"^$&{}|<>?\\]/g, (ch) => `\\${ch}`)}`;
const forRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * Переменная, из которой браузер возьмёт цвет узла. Классы идут в обратном
 * порядке: последний объявленный в файле выигрывает каскад. Литерал без var()
 * возвращает { token: null }.
 */
function resolveVar(
  themeCss: string,
  classes: string[],
  prop: "background-color" | "color",
): { cls: string; token: string | null } {
  // Варианты (`hover:`, `md:`, `2xl:`) — не базовое состояние. Без фильтра
  // `hover:bg-[…]` выигрывал у обычного `bg-[…]`, и «фон кнопки» читался как
  // цвет НАВЕДЕНИЯ (поймано 15.09: у основной кнопки вместо --color-bg
  // возвращался --color-button-bg из hover-правила).
  for (const cls of [...classes].reverse()) {
    if (cls.includes(":")) continue;
    const rule = new RegExp(`${forRegExp(cssSelectorOf(cls))}\\s*\\{([^}]*)\\}`).exec(themeCss);
    if (!rule) continue;
    // Граница объявления обязательна: без неё `border-color:` сходит за `color:`.
    const decl = new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)`, "i").exec(rule[1]);
    if (!decl) continue;
    const v = /var\((--[a-z0-9-]+)/i.exec(decl[1]);
    return { cls, token: v ? v[1] : null };
  }
  throw new Error(`ни один класс не объявляет ${prop} в CSS темы: ${classes.join(" ")}`);
}

/** Значение переменной в правиле `.color-scheme-N` готового tokens.css. */
function schemeValue(tokensCss: string, schemeId: string, token: string): string | null {
  const rule = new RegExp(`\\.color-scheme-${schemeId}\\s*\\{([^}]*)\\}`).exec(tokensCss)?.[1];
  if (!rule) return null;
  return new RegExp(`(?:^|;)\\s*${token}:\\s*([^;]+)`).exec(rule)?.[1]?.trim() ?? null;
}

const themeCssOf = (theme: string) => {
  const path = resolve(SITES_ROOT, "dist", "theme-css", `${theme}.css`);
  if (!existsSync(path)) throw new Error(`нет ${path} — нужен pnpm build:theme-sections:all`);
  return readFileSync(path, "utf8");
};

describe("мишени секций красятся токеном МЕРЧАНТСКОЙ схемы", () => {
  const tokensOf = new Map<string, string>();
  const cssOf = new Map<string, string>();
  const htmlOf = new Map<string, string>();

  beforeAll(() => {
    for (const theme of THEMES) {
      if (!built(theme)) continue;
      tokensOf.set(theme, buildTokensCss({ colorSchemes: SCHEMES }, theme));
      cssOf.set(theme, themeCssOf(theme));
    }
    for (const c of CASES) {
      const key = `${c.theme}/${c.block}`;
      if (!htmlOf.has(key) && built(c.theme)) htmlOf.set(key, renderLive(c.theme, c.block));
    }
  });

  it.each(CASES.map((c) => [`${c.theme} · «${c.label}» · ${c.target}`, c] as const))(
    "%s",
    (_name, c) => {
      if (!built(c.theme)) throw new Error(`тема ${c.theme} не собрана`);
      const classes = classesOf(htmlOf.get(`${c.theme}/${c.block}`)!, c.marker);
      const { cls, token } = resolveVar(cssOf.get(c.theme)!, classes, c.prop);
      // 1. Цвет обязан приходить переменной, а не литералом.
      expect(`${c.target}: ${cls}`).toEqual(expect.stringContaining(cls));
      expect(token).not.toBeNull();
      // 2. Это обязана быть та роль схемы, которую ждёт мишень.
      expect(token).toBe(c.expect);
      // 3. Переменная обязана быть объявлена В МЕРЧАНТСКОЙ схеме, а не только
      //    в :root (иначе все схемы дают один и тот же цвет).
      const a = schemeValue(tokensOf.get(c.theme)!, SCHEME_A, token!);
      const b = schemeValue(tokensOf.get(c.theme)!, SCHEME_B, token!);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      // 4. И две схемы обязаны давать РАЗНЫЕ числа — иначе мишень замрёт.
      expect(a).not.toBe(b);
    },
  );

  it("контроль: `bg-white` НЕ считается токеном схемы", () => {
    // Доказательство, что проверка ловит именно литерал, а не «наличие var()».
    // Tailwind 4 печатает `.bg-white { background-color: var(--color-white) }` —
    // переменная есть, но её нет ни в одной схеме.
    const tokens = tokensOf.get("flux")!;
    expect(schemeValue(tokens, SCHEME_A, "--color-white")).toBeNull();
    expect(schemeValue(tokens, SCHEME_A, "--color-bg")).toBe("209 77 77");
    expect(schemeValue(tokens, SCHEME_B, "--color-bg")).toBe("245 240 235");
  });

  it("контроль: `--color-primary` мерчантская схема НЕ печатает (хвост в генераторе)", () => {
    // Токен объявлен в theme.json каждой схемы и в реестре стоит со
    // scope: 'scheme', но `schemeToVars` его не эмитит. На нём висит
    // `.account-button` всех пяти тем — это ОТДЕЛЬНАЯ, незакрытая причина
    // (жалобы «Вход/Заказы/Личный кабинет — кнопка»). Проверка держит факт
    // зафиксированным: когда генератор починят, она станет красной и её
    // нужно перевернуть.
    for (const theme of THEMES) {
      if (!built(theme)) continue;
      expect(schemeValue(tokensOf.get(theme)!, SCHEME_A, "--color-primary")).toBeNull();
    }
  });
});

describe("flux · «Товар» · макет «Сложенный» заполняет колонку", () => {
  const trackOf = (html: string) => classesOf(html, "data-cfg-thumbs-track");
  const thumbOf = (html: string) => classesOf(html, "data-cfg-thumb");

  it("лента миниатюр тянется на всю ширину (w-full + grid)", () => {
    if (!built("flux")) throw new Error("тема flux не собрана");
    const cls = trackOf(renderLive("flux", "Product", "stacked"));
    expect(cls).toContain("grid");
    expect(cls).toContain("w-full");
  });

  it("плитка тянется по ячейке, а не держит фиксированную сторону", () => {
    const cls = thumbOf(renderLive("flux", "Product", "stacked"));
    expect(cls).toContain("w-full");
    expect(cls).toContain("aspect-square");
    expect(cls.filter((c) => c.startsWith("size-["))).toEqual([]);
    expect(cls.filter((c) => c.startsWith("md:size-["))).toEqual([]);
  });

  it("контроль: «Карусель» осталась на фиксированной стороне плитки", () => {
    // Узость правки. Тянуть плитку в карусели нельзя: лента прокручивается,
    // растягивать не по чему — ширина схлопнется в ширину ряда.
    const cls = thumbOf(renderLive("flux", "Product", "carousel"));
    expect(cls).toContain("size-[88px]");
    expect(cls).not.toContain("aspect-square");
  });

  it("контроль: «Миниатюрный» тоже остался фиксированным", () => {
    const cls = thumbOf(renderLive("flux", "Product", "split"));
    expect(cls).toContain("size-[88px]");
  });

  it("эталон: у общего порта «Сложенный» тоже на всю ширину колонки", () => {
    // rose/bloom/satin/vanilla рисует theme-base. Если эталон переедет —
    // падать здесь, а не молча разрешать flux уехать следом.
    const html = renderLive("rose", "Product", "stacked");
    const cls = classesOf(html, 'data-thumbs-axis="grid"');
    expect(cls).toContain("w-full");
  });
});
