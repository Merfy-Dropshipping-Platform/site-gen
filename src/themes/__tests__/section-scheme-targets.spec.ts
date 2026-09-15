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
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  classesOfAllMarker,
  declaredVar,
  inlineDecl,
  inlineStylesOfAllMarker,
  loadTesterSchemes,
  renderBlock,
  schemeValue,
  themeCss,
  tokensCssFor,
  varShadowedInMarkup,
} from "../../../scripts/qa/lib";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");

/**
 * Схемы РЕАЛЬНОГО магазина тестировщика. Важно, что они МЕРЧАНТСКИЕ: заводские
 * схемы темы печатаются другим путём (`buildThemeSchemeRule`) и несут больше
 * токенов — на них баг с `--color-primary` не воспроизводится вовсе.
 */
const SCHEMES = loadTesterSchemes();
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
      marker: theme === "vanilla"
        ? 'css:[class*="vanilla-pad shrink-0 border-0 bg-"]'
        : 'data-puck-component-id="Footer-1"',
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
  ] as Case[]),];

const THEMES = [...new Set(CASES.map((c) => c.theme))];

const built = (theme: string) =>
  existsSync(resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"));

/**
 * Живой рендер порта — та же лестница, что у витрины. Рендер, разбор разметки,
 * экранирование селекторов Tailwind и чтение схем делает общая библиотека
 * зондов `scripts/qa/lib` (её README — список ловушек, на которых это ломалось).
 */
const renderLive = (theme: string, block: string, layout?: string): string =>
  renderBlock(theme, block, {
    productId: "p1",
    colorScheme: `scheme-${SCHEME_A}`,
    padding: { top: 40, bottom: 40 },
    ...(layout ? { layout } : {}),
  });

/**
 * Классы КАЖДОГО узла, помеченного маркером.
 *
 * Две ловушки закрыты разом:
 *   • узел ищется настоящим CSS-селектором по разобранной разметке, а не
 *     регуляркой по тексту: `data-cfg-thumb` без границы ловил
 *     `data-cfg-thumbs-track`, и «плитка» мерилась по ЛЕНТЕ (15.09);
 *   • берётся НЕ ПЕРВЫЙ совпавший узел, а ВСЕ. У flux «Товар» две ветки
 *     раскладки, и `data-cfg-name`/`data-cfg-price`/`data-cfg-buy` стоят на
 *     обеих: саботаж ВТОРОГО заголовка (литерал вместо токена) оставлял эту
 *     проверку зелёной — поймано 15.09 при переводе гарда на библиотеку.
 */
const classesOfAll = (html: string, marker: string): string[][] =>
  classesOfAllMarker(html, marker);

/** Классы первого совпавшего узла — там, где узел заведомо один. */
const classesOf = (html: string, marker: string): string[] => classesOfAll(html, marker)[0];

describe("мишени секций красятся токеном МЕРЧАНТСКОЙ схемы", () => {
  const tokensOf = new Map<string, string>();
  const cssOf = new Map<string, string>();
  const htmlOf = new Map<string, string>();

  beforeAll(() => {
    for (const theme of THEMES) {
      if (!built(theme)) continue;
      tokensOf.set(theme, tokensCssFor(theme, SCHEMES));
      cssOf.set(theme, themeCss(theme));
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
      const nodes = classesOfAll(html, c.marker);
      const styles = inlineStylesOfAllMarker(html, c.marker);
      expect(nodes.length).toBeGreaterThan(0);
      // Проверяются ВСЕ узлы с этим маркером, а не первый попавшийся.
      nodes.forEach((classes, i) => {
        const where = `${c.theme}/${c.label}/${c.target} узел №${i + 1} из ${nodes.length}`;
        // 0. ИНЛАЙН НА САМОМ УЗЛЕ. Он бьёт любой класс, поэтому смотрим первым:
        //    у кнопки «Вход» пяти тем стоял `style="background:#000000;color:#FFFFFF"`,
        //    и проверка «класс ссылается на переменную» проходила бы мимо.
        const inline = inlineDecl(styles[i] ?? "", c.prop);
        expect({ where, инлайн: inline }).toEqual({ where, инлайн: null });
        const { cls, token, chain } = declaredVar(cssOf.get(c.theme)!, classes, c.prop);
        // 1. Цвет обязан приходить переменной, а не литералом.
        expect({ where, cls, литерал: token === null }).toEqual({ where, cls, литерал: false });
        // 2. Это обязана быть та роль схемы, которую ждёт мишень.
        expect({ where, token }).toEqual({ where, token: c.expect });
        // 3. Переменная обязана быть объявлена В МЕРЧАНТСКОЙ схеме, а не только
        //    в :root (иначе все схемы дают один и тот же цвет).
        const a = schemeValue(tokensOf.get(c.theme)!, SCHEME_A, token!);
        const b = schemeValue(tokensOf.get(c.theme)!, SCHEME_B, token!);
        expect({ where, нетA: a === null, нетB: b === null }).toEqual({ where, нетA: false, нетB: false });
        // 4. И две схемы обязаны давать РАЗНЫЕ числа — иначе мишень замрёт.
        expect({ where, одинаково: a === b }).toEqual({ where, одинаково: false });
        // 5. НИ ОДНУ переменную цепочки не перебивает инлайн внутри блока.
        //    Вторая причина «Входа»: обёртка auth-shell печатала
        //    `--color-primary`/`--color-button-text` своим style и накрывала
        //    кнопку каскадом — класс выглядел правильным, цвет был константой.
        const shadowed = chain.filter((t) => varShadowedInMarkup(html, t));
        expect({ where, перебито: shadowed }).toEqual({ where, перебито: [] });
      });
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
    // ГЕНЕРАТОРЕ больше никого не держит — но она никуда не делась. Проверка
    // держит факт зафиксированным: когда генератор починят, она станет
    // красной и её нужно перевернуть.
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
    const { token } = declaredVar(
      themeCss("vanilla"),
      cls!.split(/\s+/).filter(Boolean),
      "background-color",
    );
    expect(token).toBe("--color-surface");
    const tokens = tokensCssFor("vanilla", SCHEMES);
    const a = schemeValue(tokens, SCHEME_A, token!);
    const b = schemeValue(tokens, SCHEME_B, token!);
    expect({ нетA: a === null, нетB: b === null }).toEqual({ нетA: false, нетB: false });
    expect({ одинаково: a === b }).toEqual({ одинаково: false });
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
