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
  expect:
    | "--color-bg"
    | "--color-heading"
    | "--color-text"
    | "--color-button-bg"
    | "--color-button-text";
};

const THEMES_5 = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

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
  // Эталон платформы — rose («как пример работы можешь брать у розы»,
  // владелец 15.09). У самой rose общий заголовок секций тоже висел на
  // литерале #000000 (ui/RoseSectionHeading.astro) — те же 0,0,0 на обеих
  // схемах у четырёх секций сразу.
  { theme: "rose", block: "PopularProducts", label: "Коллекция товаров", target: "заголовок", marker: 'id="popular-title"', prop: "color", expect: "--color-heading" },
  { theme: "rose", block: "Collections", label: "Список коллекций", target: "заголовок", marker: 'id="collections-title"', prop: "color", expect: "--color-heading" },
  { theme: "rose", block: "Gallery", label: "Галерея", target: "заголовок", marker: 'id="gallery-title"', prop: "color", expect: "--color-heading" },

  // ── ПАЧКА 15.09: «цвет зашит литералом вместо токена схемы» ──────────────
  // Восемь жалоб тестировщика одной природы. Числа «до» сняты Chromium 1440 на
  // ТЕХ ЖЕ двух схемах, что и выше (scheme-2 → scheme-3): «Фон» 255,255,255 →
  // 113,192,255, «Поверхность» 251,251,251 → 90,175,255, «Заголовок» 0,0,0 →
  // 255,255,255, «Кнопка» 0,0,0 → 222,56,56, текст кнопки 255,255,255 →
  // 113,192,255.
  //
  // [12, 54] «Вход»/«Личный кабинет»/«Заказы» — кнопка. До: фон 0,0,0 → 0,0,0 и
  // текст 255,255,255 → 255,255,255 во всех пяти темах; у кнопки аккаунта фон
  // 17,17,17 → 17,17,17. Причин было три, и мимо двух из них проверка «класс
  // ссылается на переменную» прошла бы молча: инлайн на кнопке, инлайн-перебивка
  // переменных на обёртке auth-shell и `--color-primary`, которого мерчантская
  // схема не печатает.
  ...THEMES_5.flatMap((theme) => [
    { theme, block: "LoginSection", label: "Вход", target: "фон кнопки", marker: 'id="btn-magic"', prop: "background-color", expect: "--color-button-bg" },
    { theme, block: "LoginSection", label: "Вход", target: "текст кнопки", marker: 'id="btn-magic"', prop: "color", expect: "--color-button-text" },
    { theme, block: "AccountSection", label: "Личный кабинет", target: "фон кнопки", marker: 'id="btn-save"', prop: "background-color", expect: "--color-button-bg" },
    { theme, block: "AccountSection", label: "Личный кабинет", target: "текст кнопки", marker: 'id="btn-save"', prop: "color", expect: "--color-button-text" },
  ] as Case[]),

  // [10, 36] Подвал. До: flux и satin шли за «Поверхностью» (251,251,251 →
  // 90,175,255), а у СВЕЖЕГО магазина flux вообще не двигались — 250,250,250 на
  // всех четырёх схемах, включая две тёмные (полотно 0,0,0 и 11,11,11), потому
  // что в сиде flux поля surfaceBg нет и `--color-surface` падал в :root.
  // Эталон rose и ещё две темы красят подвал «Фоном» — теперь все пять.
  // [8] То же у секции «Изображение с текстом» (во flux её рисует Puk.astro).
  ...THEMES_5.flatMap((theme) => [
    // У vanilla корень <footer> прозрачный (flex-столбец), фон несут ПОЛОСЫ
    // внутри — цепляем красящий узел, а не корень: «красится не то, что видно».
    { theme, block: "Footer", label: "Подвал", target: "фон",
      marker: theme === "vanilla" ? "класс:vanilla-pad shrink-0 border-0 bg-" : 'data-puck-component-id="Footer-1"',
      prop: "background-color", expect: "--color-bg" },
    { theme, block: "ImageWithText", label: "Изображение с текстом", target: "фон секции", marker: 'data-puck-component-id="ImageWithText-1"', prop: "background-color", expect: "--color-bg" },
  ] as Case[]),

  // [29, 53] Заголовок «Избранного». До: bloom 0,0,0 → 0,0,0 (литерал
  // `text-[#000000]`), vanilla 10,10,10 → 10,10,10 (`text-[var(--vanilla-dark)]`
  // — алиас темы, а не роль схемы). rose/flux/satin уже шли — держим все пять.
  ...THEMES_5.map((theme) => (
    { theme, block: "WishlistSection", label: "Избранное", target: "заголовок", marker: 'id="wishlist-title"', prop: "color", expect: "--color-heading" } as Case
  )),

  // [9] Кнопка слайда «Слайд-шоу» во flux. До: фон 0,0,0 → 0,0,0 (`bg-black`),
  // текст 255,255,255 → 255,255,255 (`text-white`). Эталон rose — те же роли.
  { theme: "flux", block: "Slideshow", label: "Слайд-шоу", target: "фон кнопки слайда", marker: "текст:Кнопка", prop: "background-color", expect: "--color-button-bg" },
  { theme: "flux", block: "Slideshow", label: "Слайд-шоу", target: "текст кнопки слайда", marker: "текст:Кнопка", prop: "color", expect: "--color-button-text" },

  // [47] Цена карточки «Коллекции товаров» у vanilla. До: 0,0,0 → 0,0,0
  // (`text-black`; Tailwind 4 печатает его как `var(--color-black)` — переменная
  // есть, но её нет ни в одной схеме). Имя карточки стояло на ТОМ ЖЕ литерале
  // строкой выше, поэтому сторожим обе: чинить одну значит оставить карточку
  // наполовину чёрной. Эталон rose красит обе `--color-text`.
  { theme: "vanilla", block: "PopularProducts", label: "Коллекция товаров", target: "цена карточки", marker: "текст:2 500 ₽", prop: "color", expect: "--color-text" },
  { theme: "vanilla", block: "PopularProducts", label: "Коллекция товаров", target: "имя карточки", marker: "текст:Товар", prop: "color", expect: "--color-text" },
  { theme: "rose", block: "PopularProducts", label: "Коллекция товаров", target: "цена карточки (эталон)", marker: "текст:2 500 ₽", prop: "color", expect: "--color-text" },

  // [52] «Сводка заказа»: поле промокода и строка «промокод применён». До:
  // 255,255,255 → 255,255,255 на всех пяти темах, при том что обёртка колонки
  // шла за схемой. Узлы общие для пяти тем (блок theme-base), поэтому кейс на
  // каждую тему — он ловит и тему, которая уедет со своим портом.
  ...THEMES_5.flatMap((theme) => [
    { theme, block: "CheckoutSummary", label: "Сводка заказа", target: "фон поля промокода", marker: "data-checkout-promo", prop: "background-color", expect: "--color-bg" },
    { theme, block: "CheckoutSummary", label: "Сводка заказа", target: "фон строки «промокод применён»", marker: "data-checkout-promo-applied", prop: "background-color", expect: "--color-bg" },
  ] as Case[]),
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
 * Открывающий тег узла. Маркер — либо data-атрибут/id (первый в разметке), либо
 * `текст:XXX` — тег, сразу за которым идёт этот текст. Второй вид нужен там, где
 * у мишени нет своего атрибута: имя и цена карточки «Коллекции товаров» — просто
 * <span>, и цеплять их приходится по содержимому.
 *
 * Граница после имени атрибута обязательна: `data-cfg-thumb` без неё ловил
 * `data-cfg-thumbs-track`, и «плитка» мерилась по ЛЕНТЕ — проверка падала не
 * на том узле (поймано 15.09 на первом же прогоне).
 */
function tagOf(html: string, marker: string): string {
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (marker.startsWith("текст:")) {
    const txt = esc(marker.slice("текст:".length));
    const tag = new RegExp(`<[a-z0-9]+[^>]*>(?=\\s*${txt})`, "i").exec(html)?.[0];
    if (!tag) throw new Error(`узел с текстом «${marker.slice(6)}» в разметке не найден`);
    return tag;
  }
  if (marker.startsWith("класс:")) {
    const needle = esc(marker.slice("класс:".length));
    const tag = new RegExp(`<[a-z0-9]+[^>]*class="[^"]*${needle}[^"]*"[^>]*>`, "i").exec(html)?.[0];
    if (!tag) throw new Error(`узел с классом «${marker.slice(6)}» в разметке не найден`);
    return tag;
  }
  const e = esc(marker);
  const bounded = /=/.test(marker) ? e : `${e}(?![a-z0-9-])`;
  const tag = new RegExp(`<[a-z0-9]+[^>]*${bounded}[^>]*>`, "i").exec(html)?.[0];
  if (!tag) throw new Error(`узел ${marker} в разметке не найден`);
  return tag;
}

function classesOf(html: string, marker: string): string[] {
  return (/class="([^"]*)"/.exec(tagOf(html, marker))?.[1] ?? "").split(/\s+/).filter(Boolean);
}

/** Инлайновый `style` узла — он бьёт ЛЮБОЙ класс, поэтому его смотрим первым. */
function inlineStyleOf(html: string, marker: string): string {
  return /style="([^"]*)"/.exec(tagOf(html, marker))?.[1] ?? "";
}

/**
 * Объявляет ли ХОТЬ ОДИН инлайновый style в разметке блока переменную `token`.
 *
 * Зачем отдельная проверка. У секции «Вход» причин было ДВЕ, и вторая ни одним
 * замером на самом узле не ловится: обёртка `auth-shell` печатала
 * `--color-primary: 0,0,0; --color-button-text: 255,255,255` своим инлайном, и
 * каскадом это накрывало кнопку внутри. Класс кнопки при этом выглядел
 * безупречно — `rgb(var(--color-button-text))`, — а цвет всё равно был
 * константой. Пока предок перебивает переменную, мишень к схеме не подключена.
 */
function varShadowedInMarkup(html: string, token: string): boolean {
  for (const m of html.matchAll(/style="([^"]*)"/g)) {
    if (new RegExp(`${token}\\s*:`).test(m[1])) return true;
  }
  return false;
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
): { cls: string; token: string | null; chain: string[] } {
  // Варианты (`hover:`, `md:`, `2xl:`) — не базовое состояние. Без фильтра
  // `hover:bg-[…]` выигрывал у обычного `bg-[…]`, и «фон кнопки» читался как
  // цвет НАВЕДЕНИЯ (поймано 15.09: у основной кнопки вместо --color-bg
  // возвращался --color-button-bg из hover-правила).
  for (const cls of [...classes].reverse()) {
    if (cls.includes(":")) continue;
    const rule = new RegExp(`${forRegExp(cssSelectorOf(cls))}\\s*\\{([^}]*)\\}`).exec(themeCss);
    if (!rule) continue;
    // Граница объявления обязательна: без неё `border-color:` сходит за `color:`.
    // `background-color` пишут и сокращённо — `.account-button` и
    // `.auth-button-primary` объявлены как `background: rgb(var(…))`, и без этой
    // ветки проверка падала «ни один класс не объявляет background-color»
    // (поймано 15.09 на первом прогоне расширенного списка).
    const names = prop === "background-color" ? "background-color|background" : prop;
    const decl = new RegExp(`(?:^|[;{\\s])(?:${names}):\\s*([^;]+)`, "i").exec(rule[1]);
    if (!decl) continue;
    // Цепочка целиком: `rgb(var(--color-button-bg, var(--color-primary)))` даёт
    // [--color-button-bg, --color-primary]. Первая — роль схемы, остальные —
    // фолбэки; перебить инлайном предка нельзя НИ ОДНУ из них.
    const chain = [...decl[1].matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]);
    return { cls, token: chain[0] ?? null, chain };
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
      const html = htmlOf.get(`${c.theme}/${c.block}`)!;
      // 0. ИНЛАЙН НА САМОМ УЗЛЕ. Он бьёт любой класс, поэтому смотрим первым:
      //    у кнопки «Вход» пяти тем стоял `style="background:#000000;color:#FFFFFF"`,
      //    и проверка «класс ссылается на переменную» проходила бы мимо.
      const short = c.prop === "background-color" ? "background" : c.prop;
      const inline = inlineStyleOf(html, c.marker);
      const own = new RegExp(`(?:^|;)\\s*(?:${short}|${c.prop})\\s*:\\s*([^;]+)`, "i").exec(inline);
      expect(
        own ? `${c.target}: инлайн задаёт ${short}: ${own[1].trim()}` : `${c.target}: инлайна нет`,
      ).toBe(`${c.target}: инлайна нет`);
      const classes = classesOf(html, c.marker);
      const { cls, token, chain } = resolveVar(cssOf.get(c.theme)!, classes, c.prop);
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
      // 5. НИ ОДНУ переменную цепочки не перебивает инлайн внутри блока.
      //    Вторая причина «Входа»: обёртка auth-shell печатала
      //    `--color-primary`/`--color-button-text` своим style и накрывала
      //    кнопку каскадом — класс выглядел правильным, цвет был константой.
      const shadowed = chain.filter((t) => varShadowedInMarkup(html, t));
      expect(`${c.target}: перебито инлайном — ${shadowed.join(", ") || "ничего"}`).toBe(
        `${c.target}: перебито инлайном — ничего`,
      );
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
    // scope: 'scheme', но `schemeToVars` его не эмитит. На нём висели
    // `.auth-button-primary` и `.account-button` всех пяти тем — это и была
    // причина жалоб [12, 54] «Вход/Заказы/Личный кабинет — кнопка». 15.09
    // кнопки переведены на `--color-button-bg` (фолбэком `--color-primary`
    // оставлен, чтобы магазин без своих схем не менялся), поэтому дыра в
    // ГЕНЕРАТОРЕ больше никого не держит — но она никуда не делась.
    // Проверка держит факт зафиксированным: когда генератор починят, она
    // станет красной и её нужно перевернуть.
    for (const theme of THEMES) {
      if (!built(theme)) continue;
      expect(schemeValue(tokensOf.get(theme)!, SCHEME_A, "--color-primary")).toBeNull();
    }
  });
});

describe("мишени, которые рисует инлайн-скрипт секции", () => {
  /**
   * [50] Плитка товара в корзине vanilla.
   *
   * Строки корзины рисует инлайн-скрипт из cart-store уже в браузере, поэтому в
   * статическом рендере их НЕТ — проверка выше их не видит вовсе. Замер
   * (Chromium 1440, схемы мерчанта scheme-2 → scheme-3): корень секции
   * 255,255,255 → 113,192,255 идёт, а плитка 236,235,231 → 236,235,231 замерла:
   * она стояла на алиасе `--vanilla-card`, которого нет в наборе, что
   * themes/vanilla/src/styles/global.css ремапит на токены схемы для
   * [data-block="cart-body"] (там surface, dark, muted, header-bg, line).
   *
   * Класс берём ИЗ ИСХОДНИКА шаблона, а цвет считаем теми же двумя артефактами,
   * что и остальные мишени: правило в dist/theme-css/vanilla.css плюс значение
   * переменной в правиле мерчантской схемы. Копию класса в тест не кладём —
   * копия молча устаревает и сторожит саму себя.
   */
  it("vanilla · «Корзина» · плитка товара идёт за «Поверхностью» схемы", () => {
    if (!built("vanilla")) throw new Error("тема vanilla не собрана");
    const src = readFileSync(
      resolve(SITES_ROOT, "themes/vanilla/src/components/sections/CartBody.astro"),
      "utf8",
    );
    const cls = /class="(block size-20[^"]*)"/.exec(src)?.[1];
    expect(cls).toBeDefined();
    const { token, chain } = resolveVar(
      themeCssOf("vanilla"),
      cls!.split(/\s+/).filter(Boolean),
      "background-color",
    );
    expect(chain.join(" → ")).not.toBe("");
    expect(token).toBe("--color-surface");
    const tokens = buildTokensCss({ colorSchemes: SCHEMES }, "vanilla");
    const a = schemeValue(tokens, SCHEME_A, token!);
    const b = schemeValue(tokens, SCHEME_B, token!);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
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
