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
    | "--color-button-text"
    | "--color-button-2-bg"
    | "--color-button-2-text"
    | "--color-muted";
  /**
   * Пропы, без которых мишень не рендерится вовсе. С 20.09 подвал не собирает
   * копирайт сам (владелец: «идёт только из блока информации, если заполнено»),
   * и узел копирайта появляется, только когда мерчант его задал. Без пропа
   * проверка падала бы «узел не найден» — а сторожить она должна цвет.
   */
  props?: Record<string, unknown>;
};

const THEMES_5 = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

const CASES: Case[] = [
  { theme: "flux", block: "Product", label: "Товар", target: "фон секции", marker: 'data-block="featured-product"', prop: "background-color", expect: "--color-bg" },
  { theme: "flux", block: "Product", label: "Товар", target: "заголовок", marker: "data-cfg-name", prop: "color", expect: "--color-heading" },
  // Цена ждёт роль «текст», а не «заголовок»: прямая просьба владельца
  // 2026-09-16 — «Цена должна принимать цвет текста». До неё стояла роль
  // заголовка, и на схемах, где заголовок и текст разные, цена шла за чужим
  // цветом (замер до правки: rgb(0,0,0) вместо rgb(153,153,153)).
  { theme: "flux", block: "Product", label: "Товар", target: "цена", marker: "data-cfg-price", prop: "color", expect: "--color-text" },
  // Фон/текст покоя и наведения «дополнительной» (динамической, «Купить
  // сейчас») кнопки — на канон `--color-button-secondary-*` через инлайн
  // (та же схема, что у theme-base ProductActions.astro) — проверяет
  // отдельный блок ниже: "дополнительная кнопка «Купить сейчас» несёт
  // токены секондари + меняет цвет при наведении".
  // [5] «Товар» — цена ДО скидки. ПОПРАВКА 19.09: было «--color-muted» по
  // решению 16.09 (тогда эталоном считалось «Приглушённое» — та же роль в
  // rose WishlistSection). Владелец 19.09 сменил требование: «цвет скидки
  // должен быть как у текста, а не браться из заголовка», и приглушённый —
  // это НЕ текст, а смесь текста с фоном (60/40). Старая цена во всех темах
  // и на всех путях рендера теперь берёт сам «--color-text»; сплошной обход
  // сторожит «old-price-follows-text.spec.ts» (57 мишеней в 56 файлах).
  { theme: "flux", block: "Product", label: "Товар", target: "цена ДО скидки", marker: "data-cfg-oldprice", prop: "color", expect: "--color-text" },
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

  // [b64-1] Владелец, 17.09: «Секция слайд-шоу поломана» в bloom — заголовок
  // красный, подзаголовок зелёный, кнопка бордовая на голубом фоне (Схема 3).
  // Пустое состояние (плейсхолдер, без слайдов мерчанта) — ровно тот экран,
  // что видел владелец. Роли те же, что у flux выше + заголовок/подзаголовок.
  { theme: "bloom", block: "Slideshow", label: "Слайд-шоу", target: "заголовок слайда", marker: "текст:Слайд-шоу", prop: "color", expect: "--color-heading" },
  { theme: "bloom", block: "Slideshow", label: "Слайд-шоу", target: "подзаголовок слайда", marker: "текст:Добавь несколько изображений с информацией о своём бренде", prop: "color", expect: "--color-text" },
  { theme: "bloom", block: "Slideshow", label: "Слайд-шоу", target: "фон кнопки слайда", marker: "текст:Кнопка", prop: "background-color", expect: "--color-button-bg" },
  { theme: "bloom", block: "Slideshow", label: "Слайд-шоу", target: "текст кнопки слайда", marker: "текст:Кнопка", prop: "color", expect: "--color-button-text" },

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

  // ── ПАЧКА 15.09 (b21): «палитра Tailwind вместо роли схемы» ─────────────
  // 58 клеток матрицы одного рода: цвет приходил из --color-white/--color-black
  // (`bg-white`, `text-white`, `bg-black`, `text-black`). Переменная ЕСТЬ, но
  // схемы в ней нет и не будет — мишень замирает при ЛЮБОЙ схеме. Замер: та же
  // матрица (`pnpm scheme-matrix:bad`, схемы-зонды 1 → 4, у которых различаются
  // ВСЕ девять полей: «Фон» 17,0,0 → 0,17,0, «Заголовок» 51,0,0 → 0,51,0,
  // «Текст» 68,0,0 → 0,68,0, «Кнопка» 102,0,0 → 0,102,0, «Текст кнопки»
  // 119,0,0 → 0,119,0). До правки каждая мишень ниже давала #fff → #fff или
  // #000 → #000; после — числа выше. Ниже — точечные кейсы на самое заметное:
  // шапка и подвал видны на КАЖДОЙ странице.
  //
  // [шторка меню] Полотно мобильного бургера. У bloom это ещё и невидимое меню:
  // на заводской схеме темы «Фон» розовый, «Текст» белый — белые пункты лежали
  // на белом полотне.
  { theme: "rose", block: "Header", label: "Шапка", target: "полотно шторки меню", marker: 'id="rose-burger"', prop: "background-color", expect: "--color-bg" },
  { theme: "bloom", block: "Header", label: "Шапка", target: "полотно шторки меню", marker: 'id="bloom-burger"', prop: "background-color", expect: "--color-bg" },
  { theme: "flux", block: "Header", label: "Шапка", target: "полотно шторки меню", marker: 'id="flux-burger"', prop: "background-color", expect: "--color-bg" },
  // [подсказки поиска] Выпадашка satin сидела белой, пока её собственная панель
  // ([data-search-panel]) уже ехала за схемой. Поле и кнопку поиска НЕ трогали:
  // их владелец прибил к Схеме 1 (см. search-always-scheme-1.spec.ts).
  { theme: "satin", block: "Header", label: "Шапка", target: "фон подсказок поиска", marker: "data-search-results", prop: "background-color", expect: "--color-bg" },
  // [подвал] Поле подписки — единственная белая заплата на полотне подвала.
  ...(["rose", "bloom", "flux"] as const).map((theme) => (
    { theme, block: "Footer", label: "Подвал", target: "фон поля подписки", marker: "data-newsletter-form", prop: "background-color", expect: "--color-bg" } as Case
  )),
  // [подвал vanilla] Копирайт: полоса под ним шла за схемой, буквы стояли.
  { theme: "vanilla", block: "Footer", label: "Подвал", target: "копирайт", marker: 'data-puck-subsection-field="copyright"', prop: "color", expect: "--color-text", props: { copyright: "© 2026 Тестовый магазин" } },
  // [корзина] Полотно секции и кнопки. Кнопки переводились ПАРОЙ (заливка +
  // надпись): перекрасить одну половину значит завести новый дефект —
  // чёрное на чёрном.
  ...(["bloom", "satin", "vanilla"] as const).map((theme) => (
    { theme, block: "CartSection", label: "Корзина", target: "фон секции", marker: 'data-block="cart-section"', prop: "background-color", expect: "--color-bg" } as Case
  )),
  ...(["bloom", "satin", "flux"] as const).flatMap((theme) => [
    { theme, block: "CartSection", label: "Корзина", target: "фон кнопки «Оформить заказ»", marker: 'data-action="checkout"', prop: "background-color", expect: "--color-button-bg" },
    { theme, block: "CartSection", label: "Корзина", target: "текст кнопки «Оформить заказ»", marker: 'data-action="checkout"', prop: "color", expect: "--color-button-text" },
  ] as Case[]),
  // [контактная форма] Поле ввода белело во ВСЕХ пяти темах при том, что корень
  // секции вокруг уже ехал. Роль та же, что у поля промокода «Сводки заказа».
  ...THEMES_5.map((theme) => (
    { theme, block: "ContactForm", label: "Контактная форма", target: "фон поля ввода", marker: "css:textarea", prop: "background-color", expect: "--color-bg" } as Case
  )),
  // [галерея vanilla] Краска всей секции: полоса внутри ехала, текст — нет.
  { theme: "vanilla", block: "Gallery", label: "Галерея", target: "основной текст секции", marker: 'id="gallery"', prop: "color", expect: "--color-text" },
  // [каталог vanilla] Заголовок и счётчик товаров.
  { theme: "vanilla", block: "Catalog", label: "Каталог", target: "заголовок", marker: 'id="catalog-title"', prop: "color", expect: "--color-heading" },
  { theme: "vanilla", block: "Catalog", label: "Каталог", target: "счётчик товаров", marker: 'data-nt="catalog-count"', prop: "color", expect: "--color-text" },
  // [избранное] Кнопка пустого состояния: у flux ехала только заливка, у satin
  // не ехало ничего.
  ...(["flux", "satin"] as const).flatMap((theme) => [
    { theme, block: "WishlistSection", label: "Избранное", target: "фон кнопки", marker: "текст:Перейти в каталог", prop: "background-color", expect: "--color-button-bg" },
    { theme, block: "WishlistSection", label: "Избранное", target: "текст кнопки", marker: "текст:Перейти в каталог", prop: "color", expect: "--color-button-text" },
  ] as Case[]),

  // ── b74 17.09: «Изображение с текстом» flux — рендерится Puk.astro (НЕ
  // sibling ImageWithText.astro), до этой волны проверен только фон секции.
  // Заголовок/кнопка уже были на токенах (--color-heading/--color-button-2-*);
  // «текст»-абзац стоял на `--color-muted` — реально ехал вместе со схемой
  // (роль объявлена во всех схемах), но НЕ той ролью, что заголовок/кнопка —
  // рядом с перекрашенным заголовком/кнопкой абзац выглядел «не тронутым».
  // Эталон rose (ImageWithText.astro:160) — тело секции на `--color-text`.
  { theme: "flux", block: "ImageWithText", label: "Изображение с текстом", target: "заголовок", marker: 'data-puck-subsection-field="heading"', prop: "color", expect: "--color-heading" },
  { theme: "flux", block: "ImageWithText", label: "Изображение с текстом", target: "текст", marker: 'data-puck-subsection-field="text"', prop: "color", expect: "--color-text" },
  { theme: "flux", block: "ImageWithText", label: "Изображение с текстом", target: "фон кнопки", marker: 'data-puck-subsection-field="button"', prop: "background-color", expect: "--color-button-2-bg" },
  { theme: "flux", block: "ImageWithText", label: "Изображение с текстом", target: "текст кнопки", marker: 'data-puck-subsection-field="button"', prop: "color", expect: "--color-button-2-text" },

  // ── b74 17.09: «Подвал» flux — заголовок колонки (`FooterColumn.astro`,
  // «Навигация»/«Информация») стоял на литерале `text-black`: на ЛЮБОЙ схеме
  // оставался чёрным, пока фон подвала и ссылки колонки уже ехали. Эталон
  // rose — тот же узел красится ролью «Заголовок» через общий `.rose-title`.
  { theme: "flux", block: "Footer", label: "Подвал", target: "заголовок колонки", marker: "css:h3", prop: "color", expect: "--color-heading" },

  // ── b74 17.09: «Слайд-шоу» flux — заголовок/подзаголовок пустого слайда УЖЕ
  // ехали токеном (`slideHeadingCls`/`slideTextCls`), но кейса на них не было —
  // ставим сторож, чтобы регрессия не проскочила молча (кнопка слайда уже
  // сторожилась выше, CASES «фон/текст кнопки слайда»).
  { theme: "flux", block: "Slideshow", label: "Слайд-шоу", target: "заголовок слайда", marker: "текст:Слайд-шоу", prop: "color", expect: "--color-heading" },
  { theme: "flux", block: "Slideshow", label: "Слайд-шоу", target: "подзаголовок слайда", marker: "текст:Добавь несколько изображений с информацией о своём бренде", prop: "color", expect: "--color-text" },

  // ── b74 17.09: «Личный кабинет»/«Заказы» flux — ссылка «Вернуться назад»
  // (`.account-back-link`, global.css) — текст ВНЕ кнопки, жалоба владельца
  // [12] звучит и про текст, не только про кнопку. Заголовки (`<h1>` без
  // класса, красится ролью через descendant-селектор `.account-title h1`) —
  // отдельный describe ниже (общая таблица не умеет descendant-селекторы).
  { theme: "flux", block: "AccountSection", label: "Личный кабинет", target: "ссылка «Вернуться назад»", marker: "css:.account-back-link", prop: "color", expect: "--color-muted" },
  { theme: "flux", block: "OrdersSection", label: "Заказы", target: "ссылка «Вернуться назад»", marker: "css:.account-back-link", prop: "color", expect: "--color-muted" },
];

const THEMES = [...new Set(CASES.map((c) => c.theme))];

const built = (theme: string) =>
  existsSync(resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"));

/**
 * Живой рендер порта — та же лестница, что у витрины. Рендер, разбор разметки,
 * экранирование селекторов Tailwind и чтение схем делает общая библиотека
 * зондов `scripts/qa/lib` (её README — список ловушек, на которых это ломалось).
 */
const renderLive = (
  theme: string,
  block: string,
  layout?: string,
  extra?: Record<string, unknown>,
): string =>
  renderBlock(theme, block, {
    productId: "p1",
    colorScheme: `scheme-${SCHEME_A}`,
    padding: { top: 40, bottom: 40 },
    ...(layout ? { layout } : {}),
    ...(extra ?? {}),
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

/** Ключ кэша рендера: тема + блок + пропы случая. */
const caseKey = (c: Case): string => `${c.theme}/${c.block}/${JSON.stringify(c.props ?? null)}`;

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
      // Ключ несёт и пропы: иначе рендер без них обслужил бы случай, который
      // без них не рисует свою мишень.
      const key = caseKey(c);
      if (!htmlOf.has(key) && built(c.theme)) {
        htmlOf.set(key, renderLive(c.theme, c.block, undefined, c.props));
      }
    }
  });

  it.each(CASES.map((c) => [`${c.theme} · «${c.label}» · ${c.target}`, c] as const))(
    "%s",
    (_name, c) => {
      if (!built(c.theme)) throw new Error(`тема ${c.theme} не собрана`);
      const html = htmlOf.get(caseKey(c))!;
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

/**
 * b74 17.09: заголовок/подпись «Вход» и заголовки «Личный кабинет»/«Заказы» —
 * текст ВНЕ кнопки секций аккаунта (жалоба владельца [12] «текст в кнопке И
 * ТЕКСТ» — до этой волны сторожилась только кнопка). Общая таблица CASES их не
 * ловит по двум разным причинам:
 *   • «Вход» красит заголовок/подпись ИНЛАЙНОМ (`style="color: rgb(var(...))"`)
 *     — сам инлайн ссылается на переменную схемы (не литерал), но общая
 *     проверка «инлайн обязан отсутствовать» рассчитана на литералы-константы
 *     (`style="color:#000"`) и на любой инлайн падает — здесь нужен отдельный
 *     разбор «на что именно ссылается инлайн»;
 *   • «Личный кабинет»/«Заказы» красят заголовок descendant-селектором
 *     `.account-title h1` — сам `<h1>` без класса, `declaredVar()` ищет
 *     правило СРЕДИ КЛАССОВ УЗЛА и падает («ни один класс не объявляет»).
 *
 * Расследование подтвердило: обе секции УЖЕ токенизированы (см.
 * `.account-title h1`/`.auth-label` в themes/flux/src/styles/global.css и
 * инлайн LoginSection.astro) — здесь только сторож, не правка.
 */
describe("flux · «Вход»/«Личный кабинет»/«Заказы» · текст ВНЕ кнопки идёт токеном схемы", () => {
  const followsRole = (
    where: string,
    inline: string | null,
    expectToken: "--color-heading" | "--color-muted",
  ) => {
    const m = inline ? /var\((--color-[a-z-]+)/.exec(inline) : null;
    expect({ where, найден: !!m, инлайн: inline }).toEqual({ where, найден: true, инлайн: inline });
    expect({ where, token: m![1] }).toEqual({ where, token: expectToken });
    const tokens = tokensCssFor("flux", SCHEMES);
    const a = schemeValue(tokens, SCHEME_A, expectToken);
    const b = schemeValue(tokens, SCHEME_B, expectToken);
    expect({ where, нетA: a === null, нетB: b === null }).toEqual({ where, нетA: false, нетB: false });
    expect({ where, одинаково: a === b }).toEqual({ where, одинаково: false });
  };

  it("«Вход» · заголовок · инлайн ссылается на --color-heading", () => {
    if (!built("flux")) throw new Error("тема flux не собрана");
    const html = renderLive("flux", "LoginSection");
    const styles = inlineStylesOfAllMarker(html, "css:h1");
    followsRole("Вход/заголовок", inlineDecl(styles[0] ?? "", "color"), "--color-heading");
  });

  it("«Вход» · подпись · инлайн ссылается на --color-muted", () => {
    const html = renderLive("flux", "LoginSection");
    const styles = inlineStylesOfAllMarker(html, "css:p");
    followsRole("Вход/подпись", inlineDecl(styles[0] ?? "", "color"), "--color-muted");
  });

  it.each(["AccountSection", "OrdersSection"] as const)(
    "%s · заголовок (.account-title h1) · CSS-правило объявляет --color-heading",
    (block) => {
      const css = themeCss("flux");
      const rule = /\.account-title\s+h1\s*\{([^}]*)\}/.exec(css)?.[1];
      expect({ block, найдено: !!rule }).toEqual({ block, найдено: true });
      expect(rule).toMatch(/color:\s*rgb\(var\(--color-heading/);
      const tokens = tokensCssFor("flux", SCHEMES);
      const a = schemeValue(tokens, SCHEME_A, "--color-heading");
      const b = schemeValue(tokens, SCHEME_B, "--color-heading");
      expect({ block, нетA: a === null, нетB: b === null }).toEqual({ block, нетA: false, нетB: false });
      expect({ block, одинаково: a === b }).toEqual({ block, одинаково: false });
    },
  );
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

describe("vanilla · карточка товара РЕАЛЬНОЙ коллекции · имя/цена идут за «Текстом»", () => {
  /**
   * [11] «Коллекция товаров» у vanilla: названия и цены реальных товаров
   * мелкие и тёмные вместо роли «Текст» схемы (жалоба владельца 16.09,
   * магазин со схемой «Фон» #26311c / «Текст» #FF0909).
   *
   * ПОЧЕМУ СУЩЕСТВУЮЩИЙ КЕЙС ВЫШЕ («текст:Товар» / «текст:2 500 ₽») ЭТОТ БАГ
   * НЕ ЛОВИЛ. `renderLive("vanilla", "PopularProducts")` не передаёт
   * `collection`/`siteId`, поэтому Popular.astro всегда падает в ветку
   * ПУСТОГО СОСТОЯНИЯ (плейсхолдер-куртка, Figma 1:19335) — та ветка уже
   * чинена 15.09 и стоит на `--color-text`. Карточка РЕАЛЬНОГО товара —
   * другой узел (`VanillaProductCard.astro`, `data-nt="vanilla-product-card"`,
   * рендерится когда `realProducts.length > 0`) — и стояла на литеральном
   * `text-black` нетронутой. Второй узел с ТЕМ ЖЕ литералом — `renderCardHtml`
   * в `lib/storefront-hydrate.ts`: карточки Popular/Collections/Wishlist на
   * ЖИВОМ сайте перерисовывает инлайн-скрипт из `/data/products.json` уже в
   * браузере (README ловушка №1 «часть краски рисуется инлайн-скриптом») —
   * статический SSR-рендер его не видит вовсе, поэтому класс берём ИЗ
   * ИСХОДНИКА, тем же приёмом, что у плитки корзины выше.
   *
   * Замер qa:probe scheme (Chromium 1440, схемы демо-зонда 1→2, «Текст»
   * 255,255,255 → 0,0,0): ДО правки имя и цена SSR-карточки — «замерла»,
   * оба замера rgb(0,0,0) (см. HANDOFF b34, замер зафиксирован числами при
   * саботаже ниже). Эталон rose — `.rose-product-name`/`.rose-product-price`
   * → `text-[rgb(var(--color-text,0_0_0))]`.
   */
  const SRC_CARD = resolve(
    SITES_ROOT,
    "themes/vanilla/src/components/products/VanillaProductCard.astro",
  );
  const SRC_HYDRATE = resolve(SITES_ROOT, "themes/vanilla/src/lib/storefront-hydrate.ts");

  const assertFollowsText = (where: string, cls: string | undefined) => {
    expect({ where, найден: !!cls }).toEqual({ where, найден: true });
    const { token } = declaredVar(themeCss("vanilla"), cls!.split(/\s+/).filter(Boolean), "color");
    expect({ where, литерал: token === null }).toEqual({ where, литерал: false });
    expect({ where, token }).toEqual({ where, token: "--color-text" });
    const tokens = tokensCssFor("vanilla", SCHEMES);
    const a = schemeValue(tokens, SCHEME_A, token!);
    const b = schemeValue(tokens, SCHEME_B, token!);
    expect({ where, нетA: a === null, нетB: b === null }).toEqual({ where, нетA: false, нетB: false });
    expect({ where, одинаково: a === b }).toEqual({ where, одинаково: false });
  };

  it("SSR-компонент VanillaProductCard.astro · имя товара", () => {
    if (!built("vanilla")) throw new Error("тема vanilla не собрана");
    const src = readFileSync(SRC_CARD, "utf8");
    const cls = /<a\s+href=\{href\}\s+class="([^"]+)"\s*>\s*\{product\.name\}/s.exec(src)?.[1];
    assertFollowsText("vanilla/VanillaProductCard/имя", cls);
  });

  it("SSR-компонент VanillaProductCard.astro · цена товара", () => {
    const src = readFileSync(SRC_CARD, "utf8");
    const cls = /<span class="([^"]+)">\s*\{product\.price\}/s.exec(src)?.[1];
    assertFollowsText("vanilla/VanillaProductCard/цена", cls);
  });

  it("инлайн-гидрация storefront-hydrate.renderCardHtml · имя товара", () => {
    const src = readFileSync(SRC_HYDRATE, "utf8");
    const cls = /class="([^"]+)">\$\{name\}<\/a>/.exec(src)?.[1];
    assertFollowsText("vanilla/renderCardHtml/имя", cls);
  });

  it("инлайн-гидрация storefront-hydrate.renderCardHtml · цена товара", () => {
    const src = readFileSync(SRC_HYDRATE, "utf8");
    const cls = /class="([^"]+)">\$\{price\}<\/span>/.exec(src)?.[1];
    assertFollowsText("vanilla/renderCardHtml/цена", cls);
  });
});

describe("vanilla · «Вход»/«Заказы»/«Личный кабинет» · наведение читает hover-роль схемы", () => {
  /**
   * [12] «Кнопки „Вход“, „Заказы“, „Личный кабинет“: текст в кнопке и кнопка
   * при наведении — все настройки не работают» (владелец, пункт 12). Фон и
   * базовый текст кнопки чинили 15.09 (см. комментарий у `.auth-button-primary`
   * выше и кейсы `btn-magic`/`btn-save` в CASES) — они на `--color-button-bg`/
   * `--color-button-text` и уже проверены. НЕ чинили НАВЕДЕНИЕ: обе кнопки
   * («Вход» = `.auth-button-primary`, «Заказы»/«Личный кабинет» =
   * `.account-button`, общий класс — см. OrdersSection «Перейти» и
   * AccountSection `btn-save`) стояли на `filter: brightness(0.85)`, который
   * не читает ни `--color-button-bg-hover`, ни `--color-button-text-hover` —
   * настройки панели «Фон / При наведении», «Текст / При наведении» ни на что
   * не влияли.
   *
   * Замер (Playwright, синтетическая кнопка теми же классами, схема с явно
   * заданными backgroundHover/textHover, ДВЕ различимые схемы): ДО правки
   * `getComputedStyle` на `:hover` был БИТ-В-БИТ равен состоянию покоя на
   * ОБЕИХ схемах (фон 32,64,32 / текст 238,238,238 — не менялся вовсе, потому
   * что `filter` не трогает вычисленный `background-color`/`color`). После —
   * наведение даёт ИМЕННО заданный мерчантом hover-цвет и отличается между
   * схемами. Здесь CSS-класс — общий (не привязан к конкретному рендеру
   * блока), поэтому проверяем ПРАВИЛО в исходнике, тем же приёмом, что у
   * плитки корзины/карточки товара выше.
   */
  const src = readFileSync(
    resolve(SITES_ROOT, "themes/vanilla/src/styles/global.css"),
    "utf8",
  );

  const hoverRuleOf = (cls: string): string => {
    const re = new RegExp(
      `\\.${cls.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}:hover:not\\(:disabled\\)\\s*\\{([^}]*)\\}`,
    );
    const body = re.exec(src)?.[1];
    expect({ cls, найдено: !!body }).toEqual({ cls, найдено: true });
    return body!;
  };

  it.each(["auth-button-primary", "account-button"])("%s · наведение НЕ на filter/brightness", (cls) => {
    const body = hoverRuleOf(cls);
    expect({ cls, filter: /filter\s*:/.test(body) }).toEqual({ cls, filter: false });
  });

  it.each(["auth-button-primary", "account-button"])("%s · фон наведения — --color-button-bg-hover", (cls) => {
    const body = hoverRuleOf(cls);
    expect(/background-color\s*:\s*rgb\(var\(--color-button-bg-hover/.test(body)).toBe(true);
  });

  it.each(["auth-button-primary", "account-button"])("%s · текст наведения — --color-button-text-hover", (cls) => {
    const body = hoverRuleOf(cls);
    expect(/color\s*:\s*rgb\(var\(--color-button-text-hover/.test(body)).toBe(true);
  });

  it("контроль: роль объявлена в МЕРЧАНТСКОЙ схеме, а не только в :root", () => {
    // buildTokensCss печатает --color-button-bg-hover/-text-hover в
    // .color-scheme-N ТОЛЬКО когда tokens-css.ts реально эмитит роль —
    // проверяем на тестовых схемах репозитория (те же SCHEME_A/SCHEME_B).
    const tokens = tokensOfStandalone();
    for (const role of ["--color-button-bg-hover", "--color-button-text-hover"]) {
      const a = schemeValue(tokens, SCHEME_A, role);
      const b = schemeValue(tokens, SCHEME_B, role);
      expect({ role, нетA: a === null, нетB: b === null }).toEqual({ role, нетA: false, нетB: false });
    }
  });

  function tokensOfStandalone(): string {
    return tokensCssFor("vanilla", SCHEMES);
  }
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

  it("[16.09] сетка — ДВЕ колонки, паритет с эталоном (было самодельных 3)", () => {
    // Жалоба владельца, пункт 5: «макет „Сложенный“ отображается неверно».
    // Канон — тот же общий theme-base/ProductGallery.astro, что и в тесте
    // выше: `data-thumbs-axis="grid"` → `grid-cols-2`. У flux было
    // `grid-cols-3` — заметно мельче плитка и другая высота ряда при ОДНОЙ и
    // той же настройке «Макет: Сложенный», чем у остальных четырёх тем.
    const cls = trackOf(renderLive("flux", "Product", "stacked"));
    expect(cls).toContain("grid-cols-2");
    expect(cls).not.toContain("grid-cols-3");
    const refCls = classesOf(renderLive("rose", "Product", "stacked"), 'data-thumbs-axis="grid"');
    expect(refCls).toContain("grid-cols-2");
  });
});

describe("flux · «Товар» · иконки идут инлайн-SVG (currentColor), не <img>", () => {
  /**
   * [5] «иконки» (владелец, пункт 5). `NtIcon` (design-systems-theme, общая
   * на все пять тем) рендерит `<img src="/icons/X.svg">`. Сам файл несёт
   * `stroke="var(--stroke-0, black)"` — задуман перекрашиваемым переменной,
   * но у SVG, подключённого через <img>, нет доступа к CSS-переменным
   * страницы: внутри такого документа `var()` ВСЕГДА берёт свой фолбэк
   * (`black`), какую бы схему ни выбрал мерчант. На тёмной схеме («Фон»/
   * «Кнопка» у чёрного) — чёрная иконка на чёрном, невидима (счётчик
   * количества, «Поделиться», стрелки галереи — все четыре иконки этой
   * секции). Правка — ТОЛЬКО эта секция (инлайн SVG + `currentColor` +
   * явный класс-роль на кнопке); `NtIcon`/`design-systems-theme` не тронуты
   * (используются другими темами, других секций этой темы, менять их — вне
   * узкой просьбы).
   *
   * Замер (Chromium 1440, дублирующая тестовая схема с тёмным «Фоном», см.
   * HANDOFF b34): ДО правки `getComputedStyle` иконки — `rgb(0, 0, 0)`
   * НЕЗАВИСИМО от схемы (константа файла); ПОСЛЕ — цвет узла берёт роль
   * `--color-heading` и меняется между схемами (скриншот-пруф
   * `/tmp/flux-product-stacked-dark-v2.png`, иконки читаемы на тёмном фоне).
   */
  const src = readFileSync(
    resolve(SITES_ROOT, "themes/flux/src/components/sections/FeaturedProduct.astro"),
    "utf8",
  );

  it("NtIcon (img-иконка) в файле не используется", () => {
    // `<NtIcon ` (с пробелом перед атрибутом) — реальный JSX-вызов компонента;
    // комментарий выше в исходнике пишет `<NtIcon>` без пробела и потому не
    // совпадает с этой регуляркой (саботаж намеренно проверен: убрать пробел
    // из паттерна — тест ловит собственный комментарий и краснеет вечно).
    expect(/<NtIcon\s/.test(src)).toBe(false);
    expect(src.includes('from "@merfy-dropshipping-platform/design-systems-theme/components/ui/NtIcon.astro"')).toBe(
      false,
    );
  });

  it.each(["MINUS_ICON_SVG", "PLUS_ICON_SVG", "SHARE_ICON_SVG", "ARROW_LEFT_ICON_SVG", "ARROW_RIGHT_ICON_SVG"])(
    "%s — свой stroke=\"currentColor\", не литерал",
    (constName) => {
      const re = new RegExp(`const ${constName} =[\\s\\S]*?</svg>'`);
      const decl = re.exec(src)?.[0];
      expect({ constName, найден: !!decl }).toEqual({ constName, найден: true });
      expect(decl).toContain('stroke="currentColor"');
      expect(decl).not.toMatch(/stroke="(black|#000000|var\(--stroke-0)/);
    },
  );

  it.each([
    ["qty-dec", "data-cfg-qty-dec"],
    ["qty-inc", "data-cfg-qty-inc"],
    ["thumbs-next", "data-cfg-thumbs-next"],
    ["carousel-prev", "data-cfg-prev"],
    ["carousel-next", "data-cfg-next"],
  ])("кнопка %s несёт явную роль цвета на классе", (_label, attr) => {
    // Маркер — АТРИБУТ узла (не text/css), достаточно найти окружающий
    // класс регуляркой по атрибуту — те же гарантии, что и `classesOfAll`
    // (кнопка встречается 1 раз в файле на desktop-дереве, кроме qty/next,
    // где по 2 — оба должны нести роль, `g`-флаг проверяет оба).
    const re = new RegExp(`class="([^"]*)"[^>]*${attr}(?!-)`, "g");
    const matches = [...src.matchAll(re)];
    expect({ attr, найдено: matches.length }).toEqual({ attr, найдено: matches.length > 0 ? matches.length : "НОЛЬ — не найдено" });
    for (const m of matches) {
      expect({ attr, cls: m[1] }).toEqual({ attr, cls: expect.stringContaining("--color-heading") });
    }
  });
});

describe("flux · «Товар» · вариации идут токеном схемы, не #000000/white", () => {
  /**
   * [5] «вариации» (владелец, пункт 5). Чипы/свотчи вариантов
   * (`renderVariantGroupsHtml`/`renderVariantSelectsHtml`/
   * `renderVariantListHtml`, `themes/flux/src/lib/storefront-hydrate.ts`)
   * стояли на литералах `#000000`/`white` — чёрно-белые НА ЛЮБОЙ схеме
   * магазина. Роль выбрана по эталону кнопки «Добавить в корзину» этой же
   * секции (уже едет за схемой): выбран = заливка button-bg/button-text,
   * не выбран = обводка+текст button-bg на фоне bg. Функция общая с PDP
   * (`FluxProductDetail.astro`) — фолбэк-триплеты РАВНЫ прежним литералам
   * (`0_0_0`/`255_255_255`), поэтому там, где нет обёртки схемы, вид не
   * меняется (README ловушка №19).
   */
  const src = readFileSync(resolve(SITES_ROOT, "themes/flux/src/lib/storefront-hydrate.ts"), "utf8");
  const variantsSection = src.slice(
    src.indexOf("const VARIANT_BTN_BASE"),
    src.indexOf("export function renderVariantsHtml"),
  );

  it("секция вариантов найдена (VARIANT_BTN_* … до renderVariantsHtml)", () => {
    expect(variantsSection.length).toBeGreaterThan(200);
  });

  it("ни одного #000000/#ffffff литерала не осталось", () => {
    const literalHex = [...variantsSection.matchAll(/#(000000|ffffff)\b/gi)].map((m) => m[0]);
    expect(literalHex).toEqual([]);
  });

  it("bg-white / border-[#000000] / color:#000000 текстом — не осталось", () => {
    expect(variantsSection).not.toMatch(/\bbg-white\b/);
    expect(variantsSection).not.toContain("border-[#000000]");
    expect(variantsSection).not.toContain("color:#000000");
    expect(variantsSection).not.toContain("background:#ffffff");
  });

  it("выбранный чип — заливка --color-button-bg/--color-button-text", () => {
    expect(variantsSection).toMatch(/--color-button-bg,0_0_0/);
    expect(variantsSection).toMatch(/--color-button-text,255_255_255/);
  });

  it("невыбранный чип/дропдаун — --color-bg / --color-button-bg на обводке", () => {
    expect(variantsSection).toMatch(/border-\[rgb\(var\(--color-button-bg/);
    expect(variantsSection).toMatch(/--color-bg,255_255_255/);
  });

  it("сторож общей обёртки-лейбла группы («Цвет»/«Размер») — --color-heading", () => {
    const wrapperSrc = src.slice(
      src.indexOf("function renderVariantGroupWrapper"),
      src.indexOf("function renderVariantGroupWrapper") + 500,
    );
    expect(wrapperSrc).toContain("text-[rgb(var(--color-heading,0_0_0))]");
    expect(wrapperSrc).not.toContain("text-[#000000]");
  });
});

/**
 * Жалоба владельца 17.09: «частично [наведение красится схемой]. К
 * дополнительной кнопке нет» — секция «Товар» flux, кнопка «Купить сейчас»
 * (Figma-роль «Динамическая кнопка», см. `ProductActions.astro` — там она
 * СЕКОНДАРИ, а не примари).
 *
 * ЗАМЕР ДО: класс `hover:opacity-90` — читает getComputedStyle, `opacity`
 * ≠ `background-color`/`color`: свойство не меняет СВОЁ числовое значение на
 * hover вовсе, только альфу композитинга. Кнопка не «оживала цветом».
 *
 * КАНОН — `packages/theme-base/blocks/Product/ProductActions.astro`
 * (эталон rose верстает Product через него): у «Купить сейчас» токены
 * `--color-button-secondary-bg/-text` в покое и `-hover` пара на
 * onmouseover/onmouseout (Tailwind class `hover:` тут не подходит — кнопка
 * управляется инлайном, как и канон).
 *
 * Сторож ловит и «залип на примари» (после правки марта секондари не должна
 * тайком читать `--color-button-bg`), и «наведение не меняет значение».
 */
describe("flux · «Товар» · дополнительная (динамическая) кнопка «Купить сейчас» — секондари + наведение", () => {
  const html = built("flux") ? renderBlock("flux", "Product", {
    id: "Product-1",
    productId: "p1",
    colorScheme: `scheme-${SCHEME_A}`,
  }) : "";

  beforeAll(() => {
    if (!built("flux")) throw new Error("тема flux не собрана");
  });

  it("оба узла (desktop+mobile) существуют", () => {
    const nodes = classesOfAllMarker(html, "data-cfg-buy");
    expect(nodes.length).toBeGreaterThanOrEqual(1);
  });

  it("покой: инлайн ссылается на --color-button-secondary-bg/-text, НЕ на примари и НЕ на литерал", () => {
    const styles = inlineStylesOfAllMarker(html, "data-cfg-buy");
    styles.forEach((style, i) => {
      const where = `узел №${i + 1}`;
      expect({ where, style }).toEqual({
        where,
        style: expect.stringContaining("--color-button-secondary-bg"),
      });
      expect({ where, style }).toEqual({
        where,
        style: expect.stringContaining("--color-button-secondary-text"),
      });
      // Залип на примари — регрессия к старому багу (владелец 15.09), которую
      // эта правка НЕ должна тайком воскресить.
      expect(style).not.toMatch(/background:rgb\(var\(--color-button-bg,/);
    });
  });

  it("наведение: onmouseover переключает НА -hover пару токенов (значение реально меняется)", () => {
    const doc = require("node-html-parser").parse(html);
    const nodes = doc.querySelectorAll("[data-cfg-buy]");
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    nodes.forEach((el: { getAttribute: (n: string) => string | null }, i: number) => {
      const where = `узел №${i + 1}`;
      const over = el.getAttribute("onmouseover") ?? "";
      const out = el.getAttribute("onmouseout") ?? "";
      expect({ where, over }).toEqual({
        where,
        over: expect.stringContaining("--color-button-secondary-bg-hover"),
      });
      expect({ where, over }).toEqual({
        where,
        over: expect.stringContaining("--color-button-secondary-text-hover"),
      });
      // onmouseout обязан вернуть РОВНО состояние покоя — иначе кнопка
      // «залипает» в hover-цвете после первого наведения.
      expect(out).toContain("--color-button-secondary-bg");
      expect(out).not.toContain("-hover");
    });
  });
});

/**
 * [б90] «Слайд-шоу»: не применяется цветовая схема к кнопке при наведении
 * (владелец 18.09, п.5). CTA слайда в стиле `buttonStyle=solid` уже читал
 * `--color-button-bg-hover` через общий подстрочный фикс `[class*="bg-[rgb(
 * var(--color-button-bg"]:hover` (global.css, волна 17.09) — «замерла» там не
 * воспроизводится. Ловится «обведённый» стиль (`outlined`) — канон-дефолт
 * satin и опция всех тем: рамка И текст красятся ОДНИМ токеном
 * `--color-button-bg` (заливки нет), а его подстрока — `text-[rgb(var(--
 * color-button-bg` / `border-[rgb(var(--color-button-bg` — под старый фикс не
 * попадала (он ловит только `bg-[rgb(var(--color-button-bg` и `text-[rgb(var(
 * --color-button-text`). Кнопка оставалась на голом `hover:opacity-*`,
 * который не трогает `border-color`/`color` — замер (chromium, реальный
 * `:hover`, ДВЕ различимые схемы): рамка/текст были БИТ-В-БИТ равны покою на
 * ОБЕИХ схемах. Фикс — тот же приём подстроки класса, что уже стоит для
 * `bg-`/`text-`-button/button-2 пар.
 *
 * vanilla — отдельный случай: её `outlined` CTA красит рамку/текст
 * `--color-primary` (паттерн Gallery, НЕ `--color-button-bg`), а
 * `--color-primary` мерчантская схема вообще не печатает (see «мишени секций
 * … НЕ считается токеном схемы» выше) — покой тоже не едет за схемой. Это
 * отдельный, более широкий дефект вне бюджета б90; сторож её сюда не тянет.
 */
describe("[б90] «Слайд-шоу» · CTA outlined · наведение читает --color-button-bg-hover", () => {
  const THEMES_WITH_FIX = ["rose", "bloom", "flux", "satin"] as const;

  const globalCssOf = (theme: string): string =>
    readFileSync(
      resolve(SITES_ROOT, "themes", theme, "src", "styles", "global.css"),
      "utf8",
    );

  it.each(THEMES_WITH_FIX)("%s · global.css несёт подстрочный фикс border/text по --color-button-bg", (theme) => {
    const css = globalCssOf(theme);
    const borderRule = /\[class\*="border-\[rgb\(var\(--color-button-bg"\]:hover\s*\{([^}]*)\}/.exec(css)?.[1];
    const textRule = /\[class\*="text-\[rgb\(var\(--color-button-bg"\]:hover\s*\{([^}]*)\}/.exec(css)?.[1];
    expect({ theme, найденоBorder: !!borderRule, найденоText: !!textRule }).toEqual({
      theme,
      найденоBorder: true,
      найденоText: true,
    });
    expect(borderRule).toMatch(/border-color\s*:\s*rgb\(var\(--color-button-bg-hover/);
    expect(textRule).toMatch(/color\s*:\s*rgb\(var\(--color-button-bg-hover/);
    // Саботаж «вернули на filter/opacity» ловится буквально: без rgb(var(…
    // --color-button-bg-hover…)) правило не считается найденным.
  });

  it.each(["rose", "vanilla", "bloom", "flux"] as const)(
    "%s · живой рендер Slideshow(outlined) — CTA класс реально ловится фиксом (подстрока есть в разметке)",
    (theme) => {
      if (!built(theme)) throw new Error(`тема ${theme} не собрана`);
      const html = renderBlock(theme, "Slideshow", {
        colorScheme: `scheme-${SCHEME_A}`,
        buttonStyle: "outlined",
        slides: [
          {
            id: "s1",
            imageUrl: "https://example.test/a.jpg",
            heading: "Слайд-шоу",
            buttonText: "Кнопка",
            buttonLink: "/x",
            button: { text: "Кнопка", link: "/x" },
          },
        ],
      });
      const doc = require("node-html-parser").parse(html);
      const cta = doc
        .querySelectorAll("a")
        .find((el: { text: string }) => el.text.trim() === "Кнопка");
      expect({ theme, найдена: !!cta }).toEqual({ theme, найдена: true });
      const cls = cta!.getAttribute("class") ?? "";
      if (theme === "vanilla") {
        // vanilla оставлена на --color-primary (см. комментарий выше) — фикс
        // этого дефекта в бюджет б90 не входит, гард это не должен скрывать
        // ложным зелёным по чужому классу.
        expect(cls).toContain("border-[rgb(var(--color-primary");
        return;
      }
      expect({ theme, cls }).toEqual({
        theme,
        cls: expect.stringContaining("border-[rgb(var(--color-button-bg"),
      });
      expect({ theme, cls }).toEqual({
        theme,
        cls: expect.stringContaining("text-[rgb(var(--color-button-bg"),
      });
    },
  );
});
