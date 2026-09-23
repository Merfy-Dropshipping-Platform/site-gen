/**
 * Canonical tokens.css generator — SHARED by preview endpoint and live build.
 *
 * Inputs:
 *   - `themeSettings` (typically `revision.data.themeSettings`) — merchant's
 *     customizations from the constructor's theme panel.
 *   - `themeId` — site's theme id; theme manifest (`packages/theme-<id>/theme.json`)
 *     provides defaults.
 *
 * Output: CSS string to inject as `<style>` or write as `src/styles/tokens.css`.
 *
 * Parity guarantee: if preview iframe and live build both call this function
 * with the same themeSettings + themeId, they emit identical CSS.
 *
 * This file is the single source of truth. Previous implementations (in
 * `preview.controller.ts` as `buildTokensCss` and in
 * `assemble-from-packages.ts` as `generateTokensCssV2`-based emission)
 * converge here.
 */
import { getThemeManifest } from './theme-manifest-loader';
import { BASE_DEFAULTS } from '../../packages/theme-contract/tokens/base-defaults';
import { generateGoogleFontsUrl } from '../generator/constructor-theme-bridge';
import { CONTENT_SURFACE_CSS } from './content-surface-css';
import { resolveCartDrawerSchemeId } from './cart-drawer-contract';

/**
 * Корни секций-страниц личного кабинета. Ровно эти четыре страницы конструктор
 * отдаёт мерчанту как «страницу целиком, одна секция на ней»
 * (`ACCOUNT_SECTION_THEMES` / `LOGIN_SECTION_THEMES` в page-registry), поэтому
 * их поверхность обязана занимать всё место между шапкой и подвалом.
 *
 * Список — маркеры `data-block` корня секции. Они одинаковы у скаффолда
 * theme-base и у портов всех пяти тем (проверяет
 * `account-surface-fills-main.spec.ts` живым рендером), поэтому правило одно на
 * пять тем и не требует ни классов тем, ни правки вёрстки.
 *
 * Корзины здесь НЕТ намеренно: у `page-cart` своя раскладка (spec 110) и свой
 * автор; лезть туда этой правкой нельзя.
 */
export const ACCOUNT_SURFACE_BLOCKS = [
  'account-section',
  'orders-section',
  'wishlist-section',
  'login-section',
] as const;

/** `[data-block="a"],[data-block="b"],…` — список поверхностей для селекторов. */
const ACCOUNT_SURFACES = ACCOUNT_SURFACE_BLOCKS.map(
  (b) => `[data-block="${b}"]`,
).join(',');

/**
 * Область — та же, что у sticky-footer (см. `stickyFooterRule` ниже):
 * полностраничный рендер с подвалом, кроме чекаута. Шире брать нельзя —
 * одиночный `preview/block` обязан сайзиться по контенту, а чекаут ведёт
 * свой автор.
 */
const ACCOUNT_SURFACE_SCOPE = 'body:has(footer):not(:has(main main))';

/**
 * ПОВЕРХНОСТЬ СТРАНИЦЫ АККАУНТА = ВСЯ ВЫСОТА МЕЖДУ ШАПКОЙ И ПОДВАЛОМ.
 *
 * Владелец, 14.09: «Секция заказы не применяется до конца цветовая схема»,
 * «Секция Личный кабинет не применяется до конца цветовая схема». Цветная
 * область обрывается по высоте текста, ниже — светлая полоса фона страницы,
 * ещё ниже подвал.
 *
 * Замер «ДО» (Chromium 1280×1400, задеплоенное превью sites, main ed3d5948,
 * тема каждого стенда определена маркерами разметки в момент замера). ЩЕЛЬ =
 * низ `<main>` − низ секции, то есть высота светлой полосы:
 *
 *   тема      page-orders  page-profile  page-wishlist  page-login
 *   rose          422          91            424           314
 *   flux          149           0            140            49
 *   vanilla       398          73            459           298
 *   bloom         339          14            325           239
 *   satin         314           0            308           214
 *
 * Схема тут ни при чём — она применялась: у rose page-orders фон секции был
 * rgb(171,54,159), это и есть scheme-3. Не доставало РАСТЯЖЕНИЯ. `stickyFooterRule`
 * делает `<body>` flex-колонкой ≥ вьюпорта и растягивает `<main>`, но дальше
 * цепочка обрывалась: `<main>` оставался `display:block`, а обёртка схемы
 * (её вешает composeV2Page) и сама секция сайзились по контенту. Растянутый
 * `<main>` под секцией и показывал фон страницы.
 *
 * Лечение — приём чекаута (канон «схема красит КОЛОНКУ: поверхность от края до
 * края и на всю высоту, а не карточка внутри»; правка `fix/b8-checkout-col`):
 * меру держит СОДЕРЖИМОЕ, а поверхность забирает всё доступное место. Здесь это
 * три звена одной цепочки:
 *
 *   1. `<main>` страницы аккаунта → flex-колонка. Без этого его блочные дети
 *      сайзятся по контенту, сколько бы места ни было.
 *   2. прямой ребёнок `<main>`, ВНУТРИ которого лежит поверхность (обёртка
 *      `.color-scheme-N` от composeV2Page), → `flex:1 0 auto` и сам колонка.
 *      `:has()` вместо `>*` — чтобы остаток забирала именно страница аккаунта,
 *      а не любая соседняя секция, если мерчант добавит её сверху.
 *   3. сама секция → `flex:1 0 auto`. Работает и когда обёртки схемы нет
 *      (блок без `colorScheme`): тогда секция — прямой ребёнок `<main>` и
 *      растягивается этим же правилом.
 *
 * Чего правило НЕ делает, намеренно:
 *   • не задаёт высоту числом (`100vh`/`height:100%`) — доступное место равно
 *     вьюпорт минус шапка минус подвал, его знает только flex; жёсткая высота
 *     дала бы полосу НИЖЕ подвала и скролл на пустом месте;
 *   • не трогает padding/margin/gap — внутренние отступы секции остаются на
 *     `.account-page-container`, поэтому контент не сдвигается ни на пиксель:
 *     секция растёт только вниз;
 *   • не трогает `<main>` страниц без поверхности аккаунта — главная, каталог,
 *     товар остаются блочным потоком.
 *
 * Unlayered (как и sticky-footer) → перебивает `@layer base` из global.css тем.
 */
export const ACCOUNT_SURFACE_CSS =
  `${ACCOUNT_SURFACE_SCOPE}>main:has(${ACCOUNT_SURFACES}){display:flex;flex-direction:column}` +
  `${ACCOUNT_SURFACE_SCOPE}>main>*:has(${ACCOUNT_SURFACES}){flex:1 0 auto;display:flex;flex-direction:column}` +
  `${ACCOUNT_SURFACE_SCOPE}>main ${ACCOUNT_SURFACE_BLOCKS.map((b) => `[data-block="${b}"]`).join(`,${ACCOUNT_SURFACE_SCOPE}>main `)}{flex:1 0 auto}`;

/**
 * Bare id (без `scheme-` префикса) новой «схемы» чекаута — используется как
 * `.color-scheme-${CHECKOUT_SCHEME_ID}`. Зеркало (держать байт-в-байт синхронно
 * при переименовании): `CHECKOUT_SCHEME_PROP` в `src/utils/revision-migrations.ts`
 * (значение свойства `colorScheme`, которое сеет мигратор чекаута) — та строка
 * идёт через `schemeIdOf`/`schemeIdFromProp` (оба: `value.replace(/^scheme-/, '')`),
 * поэтому `${CHECKOUT_SCHEME_PROP}` → id `${CHECKOUT_SCHEME_ID}` → класс
 * `.color-scheme-${CHECKOUT_SCHEME_ID}`, который эта константа и красит.
 */
export const CHECKOUT_SCHEME_ID = 'checkout';

/**
 * ЧЕКАУТ ВСЕГДА СВЕТЛЫЙ — НЕЗАВИСИМО ОТ СХЕМЫ ТЕМЫ (Figma 1:13398).
 *
 * Баг-репорт b35 (16.09, локальный стенд): секции «Оформление заказа» /
 * «Сводка заказа» сидировались `colorScheme: 'scheme-2'`
 * (`migrateCheckoutPage`, `revision-migrations.ts`) — платформенная константа,
 * которая молча предполагала, что Схема 2 темы = светлая. Неверно: у vanilla
 * заводская Схема 2 тёмно-оливковая (`58 69 48`), у bloom — розовая
 * (`227 142 159`). Мерчант открывал чекаут и видел его перекрашенным в чужую
 * акцентную схему — «тон подложки различается», «схема не применяется к
 * кнопке» (кнопка красилась акцентом Схемы 2, а не схемой магазина по
 * умолчанию), «тёмные очертания по периметру» (контраст поля/подложки другой
 * у Схемы 2). `.color-scheme-N` стампуется НА ОБЕИХ колонках одним и тем же
 * generic-механизмом что в превью (`preview.service.ts` per-block wrap +
 * `chrome-assembler.patchCheckoutColumnScheme`), что на витрине
 * (`unifyChromeInDist` зовёт тот же `chrome-assembler`) — оба пути читают ОДНО
 * значение `props.colorScheme` из ревизии, поэтому проблема была идентична в
 * превью и на витрине (не расхождение путей, а неверный сид).
 *
 * У bloom уже стояла локальная заплатка — `checkout.astro` оборачивал
 * страницу в `<div style="--color-bg:255 255 255;...">` — НО она не долетала
 * до самих колонок: `.color-scheme-2`, стампованный ПОВЕРХ `[data-checkout-
 * pane]`/`[data-block="checkout-*"]` этим же механизмом, декларирует
 * `--color-bg` на том же узле и потому побеждает унаследованное от предка
 * инлайн-значение (правило каскада: своя декларация всегда сильнее
 * унаследованной, специфичность тут ни при чём). Локальная заплатка красила
 * только фон СТРАНИЦЫ вне колонок — не сами панели.
 *
 * РЕШЕНИЕ: снять платформенную константу `scheme-2` с сида/ревизий чекаута
 * (см. `retagSeededCheckoutScheme`, `revision-migrations.ts`) и завести
 * СОБСТВЕННУЮ, НЕЧИСЛОВУЮ «схему» `scheme-checkout` — она не входит в
 * редактируемый мерчантом список 1..5, поэтому не путается с реальным выбором
 * мерчанта и не зависит от того, что тема положила под номером 2. Правило
 * ниже — ЕДИНСТВЕННЫЙ источник её цветов, общий для превью и витрины (эта
 * функция — общий источник tokens.css для обоих путей). Состав переменных
 * ДОСЛОВНО повторяет прежнюю инлайн-заплатку bloom (кнопка/акцент
 * НЕ переопределяются — наследуются от `:root`, то есть от схемы магазина по
 * умолчанию, как и требует «схему чекаута определяет магазин, а не
 * константа»).
 *
 * Гард паритета: `checkout-scheme-parity.spec.ts` — сверяет байт-в-байт, что
 * (а) это правило одинаково для всех 5 тем (константа, не завязана на
 * мерчантские схемы), (б) сид в `revision-migrations.ts` больше НЕ содержит
 * литерал `'scheme-2'` на `CheckoutForm`/`CheckoutSummary`.
 */
export const CHECKOUT_SCHEME_CSS =
  `.color-scheme-${CHECKOUT_SCHEME_ID} {` +
  ' --color-bg: 255 255 255;' +
  ' --color-text: 0 0 0;' +
  ' --color-heading: 0 0 0;' +
  ' --color-surface: 246 246 247;' +
  ' --color-muted: 138 138 138;' +
  // Точка 3 (5b552fc3, 16.09): рамка поля ВСЕГДА цвета поля — `inputBorderOf`
  // для ЛЮБОЙ схемы любой темы возвращает `themeInputBg`, а `--color-input-bg`
  // у ВСЕХ пяти тем эффективно "255 255 255" (BASE_DEFAULTS, rose дублирует
  // тем же значением). Без этой строки `.color-scheme-checkout` унаследовала
  // бы `--color-input-border` от `:root` (схема магазина по умолчанию,
  // необязательно светлая) — тёмная рамка поля на белой подложке чекаута,
  // ровно баг, который Точка 3 уже закрыла для мерчантских схем 1..5.
  ' --color-input-border: 255 255 255;' +
  ' }';

/**
 * БАГ-РЕПОРТ ВЛАДЕЛЬЦА (16.09, п.1), дословно: «чекаут нигде не должен
 * применяться цвет текста и заголовка. Идут только от нас. Цвет текста
 * только к юр инфе.»
 *
 * КОНТЕКСТ. `CHECKOUT_SCHEME_CSS` выше — константа для узлов, у которых
 * «Цветовая схема» НЕ задана (сид `scheme-checkout`). Но «Оформление заказа»/
 * «Сводка заказа»/«Шапка оформления» — обычные Puck-блоки с полем «Цветовая
 * схема» (канон, не убираем), и мерчант МОЖЕТ выбрать там реальную схему
 * 1..5. `chrome-assembler.patchCheckoutColumnScheme`/`patchCheckoutBlockScheme`
 * тогда стампуют `.color-scheme-N` ПРЯМО на колонку/кнопку/шапку — а
 * `.color-scheme-N` объявляет ВСЕ токены схемы разом, включая
 * `--color-text`/`--color-heading`. До этой правки выбор мерчанта окрашивал
 * заголовки полей формы, итоги суммы, шапку оформления и т.д. в текст/
 * заголовок ЛЮБОЙ схемы темы — платформенная типографика чекаута переставала
 * быть платформенной. Единственное место, где текст МОЖЕТ прийти из схемы —
 * юр.инфа (блок условий под кнопкой, узел «Подвал» страницы чекаута,
 * `checkout-terms`/`data-checkout-slot="terms"`) — её отдельно завела правка
 * 14.09 («присвоить к юр инфе», см. `chrome-assembler.ts`).
 *
 * РЕШЕНИЕ. Форсим `--color-text`/`--color-heading` платформенным чёрным
 * (тем же значением, что уже в `CHECKOUT_SCHEME_CSS`) на каждом узле, который
 * умеет нести мерчантский `.color-scheme-N`: обе колонки (`[data-checkout-
 * pane]`), «Кнопка оплаты» (`checkout-submit` — схема формы ставится и на
 * неё), «Сводка заказа» (схема ставится и на саму секцию, не только на
 * колонку) и «Шапка оформления» (`data-checkout-slot="header"` — схема
 * приходит напрямую пропом в CheckoutHeader.astro, не патчем). Юр.инфа
 * (`checkout-terms`) ИСКЛЮЧЕНА из лока `--color-text` — ей разрешён цвет
 * схемы (дословно «Цвет текста только к юр инфе»); `--color-heading`
 * форсим и там — заголовков в юр.инфе нет, но инвариант «заголовок только
 * платформенный» держим без исключений, раз владелец не оговорил обратное.
 *
 * `!important` — тот же приём, что у `typographyOverrides` выше в этом же
 * файле: гарантирует победу над `.color-scheme-N` независимо от того, в каком
 * порядке они окажутся в итоговом CSS (схемы эмитятся раньше, но полагаться
 * на порядок — хрупко, а `!important` делает инвариант структурным).
 *
 * Гард: `checkout-typography-lock.spec.ts`.
 */
export const CHECKOUT_TYPOGRAPHY_LOCK_CSS =
  '[data-checkout-pane],' +
  '[data-checkout-slot="header"],' +
  '[data-block="checkout-summary"],' +
  '[data-block="checkout-submit"],' +
  '[data-block="checkout-terms"]' +
  '{--color-heading:0 0 0!important}' +
  '[data-checkout-pane],' +
  '[data-checkout-slot="header"],' +
  '[data-block="checkout-summary"],' +
  '[data-block="checkout-submit"]' +
  '{--color-text:0 0 0!important}';

/**
 * БАГ-РЕПОРТ ВЛАДЕЛЬЦА (16.09, п.2), дословно: «Кнопка не должна применять
 * на себя при наведении цвет кнопки при наведении, но выбранный цвет кнопки
 * должен оживлять когда на него наводишь.»
 *
 * КОНТЕКСТ. `CheckoutSubmit.classes.ts` (packages/theme-base — общий блок,
 * все пять тем зовут его verbatim, своих портов кнопки оплаты нет) раньше
 * красил `:hover` отдельными токенами схемы `--color-button-bg-hover`/
 * `--color-button-text-hover` — ровно то «применяет цвет кнопки при
 * наведении», которое владелец запретил. Правка снимает эти классы
 * (`CheckoutSubmit.classes.ts`, `buttonFill`) и заменяет их этим правилом:
 * на `:hover` фон кнопки — её ЖЕ выбранный `--color-button-bg`, смешанный с
 * белым (`color-mix`) — «оживление» БЕЗ обращения к отдельному hover-токену
 * схемы. `color-mix`, а не `filter:brightness()`: у чекаута по Figma
 * дефолтная кнопка чёрная (`#000000`), а `brightness()` не меняет чистый
 * чёрный (0×любое=0) — эффекта не было бы вовсе на дефолтном виде.
 * `color-mix(...,white)` осветляет ЛЮБОЙ цвет, включая чёрный.
 *
 * `.checkout-submit-btn-fill` — маркер-класс ТОЛЬКО на `buttonFill` (см.
 * `CheckoutSubmit.classes.ts`): `outline`/`gradient` этот баг не имели
 * (outline уже осветлял `--color-text` на hover, gradient hover не красил
 * вовсе) — не расширяем правку туда, где её не просили.
 *
 * Гард: `checkout-submit-hover-lighten.spec.ts` (+ DOM-саботаж на
 * `!important`/селектор).
 */
export const CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS =
  '.checkout-submit-btn-fill:hover:not(:disabled){' +
  'background-color:color-mix(in srgb, rgb(var(--color-button-bg)) 82%, white)!important' +
  '}';

/**
 * Превью-вариант токенов: тот же CSS + @import Google Fonts, когда мерчант выбрал
 * шрифты. Пришло из main (там его зовут preview.service и тест preview-fonts);
 * при слиянии линий разработки функция была только на той стороне.
 */
export function previewTokensCssWithFonts(
  themeSettings: unknown,
  themeId: string | null,
): string {
  const css = buildTokensCss(
    (themeSettings as Record<string, unknown>) ?? {},
    themeId,
  );
  return googleFontsImportCss(themeSettings) + css;
}

/**
 * `@import` Google Fonts под шрифты, выбранные мерчантом в панели
 * (`headingFont` / `bodyFont`), или пустая строка. Стоит ПЕРВОЙ строкой
 * токенов: `@import` действует, только пока перед ним нет других правил.
 */
export function googleFontsImportCss(themeSettings: unknown): string {
  const s = themeSettings as { headingFont?: unknown; bodyFont?: unknown } | null;
  const hf = typeof s?.headingFont === 'string' ? s.headingFont : '';
  const bf = typeof s?.bodyFont === 'string' ? s.bodyFont : '';
  if (!hf && !bf) return '';
  const url = generateGoogleFontsUrl(hf, bf);
  return url ? `@import url("${url}");\n` : '';
}

/**
 * Токены сайта — ОДНА функция на все пути: превью конструктора (первая
 * загрузка страницы, правка настроек темы, особые страницы) и живая сборка.
 *
 * До неё токены строились в пяти местах по-разному: первая загрузка страницы
 * в превью несла шрифты мерчанта, но не схему выдвижной корзины; правка
 * настроек и особые страницы превью — наоборот (и после первой же правки
 * шрифты мерчанта в конструкторе пропадали); живая сборка шрифтов мерчанта не
 * грузила вовсе — шрифт, выбранный в панели, на витрине подменялся запасным.
 *
 * Эталон — конструктор при загрузке страницы, плюс схема корзины, которую
 * конструктор уже показывает после первой правки: шрифты мерчанта + схема
 * дровера с явной настройки либо со страницы корзины (`cart-drawer-contract`).
 * Включается выключателем `PARITY_TOKENS` (см. parity-switch.ts).
 */
export function siteTokensCss(
  themeSettings: unknown,
  revisionData: unknown,
  themeId: string | null,
  opts: { logoRule?: boolean } = {},
): string {
  const ts = isPlainObject(themeSettings) ? themeSettings : {};
  const cartDrawerScheme =
    (ts as { cartDrawerScheme?: unknown }).cartDrawerScheme ??
    resolveCartDrawerSchemeId(revisionData);
  const css =
    googleFontsImportCss(ts) + buildTokensCss({ ...ts, cartDrawerScheme }, themeId);
  return opts.logoRule ? `${css}\n${LOGO_SIZE_CSS}\n` : css;
}

/**
 * Размер логотипа-картинки — ровно то правило, которое агент превью
 * (PREVIEW_NAV_AGENT_INLINE в preview.service.ts) вставляет в конструктор:
 * высота = настройка «Размер логотипа» (`--size-logo-width`, токены задают её
 * всегда), ширина — по пропорции до 160px.
 *
 * Пункт 2 сближения «витрина = конструктор» (владелец 23.09, эталон —
 * конструктор): у vanilla порт держит потолок ширины `max-w-[89px]` (десктоп) /
 * `max-w-[76px]` (мобайл), и на витрине логотип при высоте из панели сжимался
 * (замер стенда: 127×40 в конструкторе → 89 в ширину на витрине). У bloom /
 * flux / rose / satin потолок порта уже 160px — для них правило ничего не
 * меняет. Правило вне @layer: перебивает утилиты Tailwind так же, как
 * вставка агента в превью. Включается выключателем `PARITY_LOGO` поверх
 * общей функции токенов (siteTokensCss). Текст обязан совпадать со строкой
 * агента символ в символ — сторож logo-rule-parity.spec.ts.
 */
export const LOGO_SIZE_CSS =
  '[class*="h-[var(--size-logo-width"]{height:var(--size-logo-width,24px);width:auto;max-width:160px;object-fit:contain}';


// Список tokens которые emit'ятся явно в rootRules (с merchant cascade).
// Catch-all iterator ниже пропускает их, чтобы не было дубликата.
const ROOT_RULES_EXPLICIT = new Set<string>([
  '--radius-button', '--radius-card', '--radius-input', '--radius-media', '--radius-field',
  '--font-heading', '--font-body', '--weight-body', '--weight-heading',
  '--section-padding', '--spacing-section-y', '--section-gap', '--spacing-grid-col-gap', '--spacing-grid-row-gap',
  '--catalog-sidebar-w', '--catalog-grid-row-gap',
  '--size-catalog-title', '--size-catalog-subtitle', '--weight-catalog-title',
  '--size-hero-heading', '--size-hero-button-h', '--slide-min-height',
  '--color-header-bg', '--size-header-h',
  '--size-nav-link', '--size-section-heading', '--size-logo-width',
  '--size-newsletter-form-w', '--container-max-width',
  '--color-error', '--color-muted', '--color-primary',
  '--text-transform-heading',
  '--font-cart-counter', '--font-powered-by',
  '--size-card-border',
  '--button-style', '--footer-layout', '--contact-form-layout',
  '--cart-type', '--card-style', '--card-alignment',
  '--product-card-bw', '--product-card-radius', '--product-card-padding',
  '--product-card-align', '--product-card-justify', '--product-card-bg',
  '--product-card-media-radius',
  '--color-bottom-strip-bg', '--color-bottom-strip-text',
  '--promo-banner-h-thin',
  '--cart-drawer-title', '--cart-drawer-checkout-text', '--cart-drawer-empty-text',
]);

export function buildTokensCss(
  settings: unknown,
  themeId: string | null,
): string {
  const manifest = themeId ? getThemeManifest(themeId) : null;
  const s = isPlainObject(settings) ? settings : {};

  // Track whether merchant explicitly set each field — needed to distinguish
  // "user typed 0/empty" from "absent/unset" (the latter must fall through to
  // manifest defaults). We can't infer this from the converted value alone.
  const buttonRadiusSet = typeof s.buttonRadius === 'number';
  const cardRadiusSet = typeof s.cardRadius === 'number';
  const inputRadiusSet = typeof s.inputRadius === 'number';
  const mediaRadiusSet = typeof s.mediaRadius === 'number';
  const fieldRadiusSet = typeof s.fieldRadius === 'number';
  const headingFontSet = typeof s.headingFont === 'string' && !!s.headingFont;
  const bodyFontSet = typeof s.bodyFont === 'string' && !!s.bodyFont;
  const sectionPaddingSet = typeof s.sectionPadding === 'number';
  const sectionGapSet = typeof s.sectionGap === 'number';
  const bodyWeightSet = typeof s.bodyWeight === 'number';
  const headingWeightSet = typeof s.headingWeight === 'number';
  const logoWidthSet = typeof s.logoWidth === 'number';
  const heroHeadingSizeSet = typeof s.heroHeadingSize === 'number';
  const navLinkSizeSet = typeof s.navLinkSize === 'number';

  const buttonRadius = toPx(s.buttonRadius, 0);
  const cardRadius = toPx(s.cardRadius, 8);
  const inputRadius = toPx(s.inputRadius, 8);
  const mediaRadius = toPx(s.mediaRadius, 8);
  const fieldRadius = toPx(s.fieldRadius, 4);
  const headingFont = fontFamily(s.headingFont, 'system-ui');
  const bodyFont = fontFamily(s.bodyFont, 'system-ui');
  const sectionPadding =
    typeof s.sectionPadding === 'number' ? `${s.sectionPadding}px` : '80px';
  const sectionGap =
    typeof s.sectionGap === 'number' ? `${s.sectionGap}px` : '0px';
  const bodyWeight = typeof s.bodyWeight === 'number' ? s.bodyWeight : 400;
  const headingWeight =
    typeof s.headingWeight === 'number' ? s.headingWeight : 400;
  const logoWidth = toPx(s.logoWidth, 40);
  const heroHeadingSize = toPx(s.heroHeadingSize, 48);
  const navLinkSize = toPx(s.navLinkSize, 14);
  const errorColor = hexToRgbTriple(s.errorColor) ?? '252 165 165';

  // Cascade: merchant override (revision.themeSettings) → theme manifest →
  // hardcoded fallback. Merchant ThemeSettingsPanel saves customizations
  // in revision.data.themeSettings (constructor); preview + build pipelines
  // both call buildTokensCss to apply them. Spec 082 Stage 2a N4.5 flipped
  // precedence so merchant edits actually take effect — previously theme
  // manifest defaults always won, silently discarding merchant input.
  const themeDefaults = (manifest?.defaults ?? {}) as Record<string, string>;
  // Опоры для рамки поля: фон поля и цвет рамки, как их объявила тема (иначе —
  // общие значения контракта). Обе величины нужны в каждой ветке ниже, поэтому
  // читаются один раз здесь. Разбор — в `inputBorderOf`.
  const themeInputBg = normTriple(
    themeDefaults['--color-input-bg'] ?? BASE_DEFAULTS['--color-input-bg'],
  );
  const themeInputBorder = normTriple(
    themeDefaults['--color-input-border'] ?? BASE_DEFAULTS['--color-input-border'],
  );
  const inputAnchors = { border: themeInputBorder, bg: themeInputBg };

  // Стиль карточки товара «Карточка» (productCardStyle=card): бордер+радиус+
  // паддинг+подложка на карточке товара. Дефолт из манифеста темы
  // (--card-style): flux=card (канон-плашка верстальщика #FBFBFB=surface),
  // rose/bloom/satin/vanilla=standard → 0px (нейтрально, ноль регрессии).
  // Мерчант-выбор (s.productCardStyle) перекрывает манифест. Выравнивание
  // (--card-alignment/productCardAlignment) действует в обоих стилях.
  // ⚠️ Токены whitelist'а `--card-style`/`--card-alignment` уже эмитились
  // сырым проходом (мерчант их видел в панели «Карточки товара»), но
  // производные --product-card-* (которые реально потребляет CSS карточки)
  // не считались — панель работала визуально, но карточка не реагировала.
  const cardBorder = toPx(s.cardBorder, 0);
  const cardStyled = (s.productCardStyle ?? themeDefaults['--card-style']) === 'card';
  // «Обводка» и «Скругление» — САМОСТОЯТЕЛЬНЫЕ настройки: раньше они гасились в
  // ноль при стиле «Стандарт», и мерчант видел мёртвые ползунки (значение в
  // панели меняется, карточка нет). Стиль «Карточка» отвечает только за
  // подложку (--product-card-bg) и внутренний отступ. Отступ настраивается
  // ползунком cardPadding; без него — прежнее поведение (card 12px / standard 0).
  // Порядок: ползунок мерчанта → собственный отступ темы (theme.json) → 12px в
  // стиле «Карточка» / 0 в «Стандарте». Дефолт темы нужен потому, что правило
  // карточки идёт с !important: без него у тем с собственным p-3 (flux) отступ
  // молча схлопывался бы в ноль.
  const cardPadding =
    typeof s.cardPadding === 'number'
      ? toPx(s.cardPadding, 0)
      : (themeDefaults['--product-card-padding'] ?? (cardStyled ? '12px' : '0px'));
  // Тексты панели корзины («Заголовок панели», «Текст кнопки оформления»,
  // «Текст пустой корзины»): у настроек не было НИ ОДНОГО читателя — панель
  // сохраняла их, а витрина не показывала. Едут строковыми CSS-переменными по
  // уже работающему каналу токенов (превью и live одинаково), тема подставляет
  // их в дровер через textContent — разметка дизайн-пакета не трогается.
  const cssString = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? JSON.stringify(v.trim()) : null;
  const cartTitle = cssString(s.cartDrawerTitle);
  const cartCheckout = cssString(s.cartDrawerCheckoutText);
  const cartEmpty = cssString(s.cartDrawerEmptyText);
  const _pcAlignRaw = s.productCardAlignment ?? themeDefaults['--card-alignment'];
  const pcAlign =
    _pcAlignRaw === 'center' ? 'center' : _pcAlignRaw === 'right' ? 'right' : 'left';

  // Cart variant ('drawer' | 'page'): merchant ThemeSettingsPanel choice wins,
  // then theme manifest default, then 'drawer'. Read inline at click-time by the
  // header script (Layout.astro) — 'page' navigates to /cart, 'drawer' opens the
  // slide-over panel. Pre-fix this token only mirrored the manifest default, so
  // picking "Страница" never reached :root and had no effect.
  const cartTypeChoice =
    s.cartType === 'page' || s.cartType === 'drawer'
      ? s.cartType
      : themeDefaults['--cart-type'] ?? 'drawer';

  const rootRules = `
:root {
  --radius-button: ${merchantFirst(buttonRadius, buttonRadiusSet, themeDefaults['--radius-button'], '0px')};
  --radius-card: ${merchantFirst(cardRadius, cardRadiusSet, themeDefaults['--radius-card'], '8px')};
  --radius-input: ${merchantFirst(inputRadius, inputRadiusSet, themeDefaults['--radius-input'], '8px')};
  --radius-media: ${merchantFirst(mediaRadius, mediaRadiusSet, themeDefaults['--radius-media'], '8px')};
  --radius-field: ${merchantFirst(fieldRadius, fieldRadiusSet, themeDefaults['--radius-field'], '4px')};
  --product-card-bw: ${cardBorder};
  --product-card-radius: ${merchantFirst(cardRadius, cardRadiusSet, themeDefaults['--radius-card'], '8px')};
  --product-card-padding: ${cardPadding};
  --product-card-align: ${pcAlign};
  --product-card-justify: ${pcAlign === 'center' ? 'center' : pcAlign === 'right' ? 'flex-end' : 'flex-start'};
  --product-card-bg: ${cardStyled ? 'rgb(var(--color-surface,245 245 245))' : 'transparent'};
${cartTitle ? `\n  --cart-drawer-title: ${cartTitle};` : ''}${cartCheckout ? `\n  --cart-drawer-checkout-text: ${cartCheckout};` : ''}${cartEmpty ? `\n  --cart-drawer-empty-text: ${cartEmpty};` : ''}
  --product-card-media-radius: ${cardStyled ? merchantFirst(cardRadius, cardRadiusSet, themeDefaults['--radius-card'], '8px') : merchantFirst(mediaRadius, mediaRadiusSet, themeDefaults['--radius-media'], '8px')};
  --font-heading: ${merchantFirst(headingFont, headingFontSet, themeDefaults['--font-heading'], 'system-ui')};
  --font-body: ${merchantFirst(bodyFont, bodyFontSet, themeDefaults['--font-body'], 'system-ui')};
  --weight-body: ${merchantFirst(String(bodyWeight), bodyWeightSet, themeDefaults['--weight-body'], '400')};
  --weight-heading: ${merchantFirst(String(headingWeight), headingWeightSet, themeDefaults['--weight-heading'], '400')};
  --section-padding: ${merchantFirst(sectionPadding, sectionPaddingSet, themeDefaults['--spacing-section-y'], '80px')};
  --spacing-section-y: ${merchantFirst(sectionPadding, sectionPaddingSet, themeDefaults['--spacing-section-y'], '80px')};
  --section-gap: ${merchantFirst(sectionGap, sectionGapSet, themeDefaults['--section-gap'], '0px')};
  --spacing-grid-col-gap: ${themeDefaults['--spacing-grid-col-gap'] ?? '24px'};
  --spacing-grid-row-gap: ${themeDefaults['--spacing-grid-row-gap'] ?? '32px'};
  --catalog-sidebar-w: ${themeDefaults['--catalog-sidebar-w'] ?? '220px'};
  --catalog-grid-row-gap: ${themeDefaults['--catalog-grid-row-gap'] ?? '16px'};${
    themeDefaults['--size-catalog-title']
      ? `\n  --size-catalog-title: ${themeDefaults['--size-catalog-title']};`
      : ''
  }${
    themeDefaults['--size-catalog-subtitle']
      ? `\n  --size-catalog-subtitle: ${themeDefaults['--size-catalog-subtitle']};`
      : ''
  }${
    themeDefaults['--weight-catalog-title']
      ? `\n  --weight-catalog-title: ${themeDefaults['--weight-catalog-title']};`
      : ''
  }
  --size-hero-heading: ${merchantFirst(heroHeadingSize, heroHeadingSizeSet, themeDefaults['--size-hero-heading'], '48px')};${
    heroHeadingSizeSet
      ? `\n  --merchant-hero-heading: ${heroHeadingSize};`
      : ''
  }
  --size-hero-button-h: ${themeDefaults['--size-hero-button-h'] ?? '48px'};
  --slide-min-height: ${themeDefaults['--slide-min-height'] ?? '60vh'};${
    themeDefaults['--color-header-bg']
      ? `\n  --color-header-bg: ${themeDefaults['--color-header-bg']};`
      : ''
  }${
    themeDefaults['--size-header-h']
      ? `\n  --size-header-h: ${themeDefaults['--size-header-h']};`
      : ''
  }
  --size-nav-link: ${merchantFirst(navLinkSize, navLinkSizeSet, themeDefaults['--size-nav-link'], '14px')};
  --size-section-heading: ${themeDefaults['--size-section-heading'] ?? '20px'};
  --size-logo-width: ${merchantFirst(logoWidth, logoWidthSet, themeDefaults['--size-logo-width'], '40px')};
  --size-newsletter-form-w: ${themeDefaults['--size-newsletter-form-w'] ?? '420px'};
  --container-max-width: ${themeDefaults['--container-max-width'] ?? '1320px'};
  --color-error: ${errorColor};
  --color-muted: 156 163 175;
  --color-primary: 17 17 17;
  --text-transform-heading: ${themeDefaults['--text-transform-heading'] ?? 'none'};${
    // 084 vanilla pilot — additive theme-scope tokens. Emitted only when the
    // active theme manifest sets them, so pre-084 themes keep relying on the
    // inline Tailwind fallbacks baked into block class strings.
    themeDefaults['--font-cart-counter']
      ? `\n  --font-cart-counter: ${themeDefaults['--font-cart-counter']};`
      : ''
  }${
    themeDefaults['--font-powered-by']
      ? `\n  --font-powered-by: ${themeDefaults['--font-powered-by']};`
      : ''
  }${
    themeDefaults['--size-card-border']
      ? `\n  --size-card-border: ${themeDefaults['--size-card-border']};`
      : ''
  }${
    themeDefaults['--button-style']
      ? `\n  --button-style: ${themeDefaults['--button-style']};`
      : ''
  }${
    themeDefaults['--footer-layout']
      ? `\n  --footer-layout: ${themeDefaults['--footer-layout']};`
      : ''
  }${
    themeDefaults['--contact-form-layout']
      ? `\n  --contact-form-layout: ${themeDefaults['--contact-form-layout']};`
      : ''
  }${
    `\n  --cart-type: ${cartTypeChoice};`
  }${
    themeDefaults['--card-style']
      ? `\n  --card-style: ${themeDefaults['--card-style']};`
      : ''
  }${
    themeDefaults['--card-alignment']
      ? `\n  --card-alignment: ${themeDefaults['--card-alignment']};`
      : ''
  }${
    themeDefaults['--color-bottom-strip-bg']
      ? `\n  --color-bottom-strip-bg: ${themeDefaults['--color-bottom-strip-bg']};`
      : ''
  }${
    themeDefaults['--color-bottom-strip-text']
      ? `\n  --color-bottom-strip-text: ${themeDefaults['--color-bottom-strip-text']};`
      : ''
  }${
    themeDefaults['--promo-banner-h-thin']
      ? `\n  --promo-banner-h-thin: ${themeDefaults['--promo-banner-h-thin']};`
      : ''
  }${
    // Catch-all: emit ВСЕ theme.json defaults которые не обработаны явно
    // выше. Это гарантирует что per-block tokens (--hero-cta-button-*,
    // --footer-newsletter-*, --gallery-* и т.д.) попадают в :root preview
    // iframe конструктора. На live этот pipeline покрывается scaffold-builder
    // через generateTokensCss(themeDefaults) → :root #3, но конструктор
    // не проходит через scaffold-builder — только через buildTokensCss.
    // Без catch-all per-block tokens были undefined → блоки в превью
    // схлопывались до content size (height/min-width var → invalid).
    // Cascade: BASE_DEFAULTS под theme.json defaults — theme override base.
    // Без BASE_DEFAULTS per-block tokens (--popular-products-root-padding-x,
    // --footer-newsletter-* etc) которые НЕ в theme.json — пропали бы из
    // :root конструктора → блоки collapse'ились бы (padding 0, height 0).
    Object.entries({ ...BASE_DEFAULTS, ...themeDefaults } as Record<string, string>)
      .filter(([k]) => !ROOT_RULES_EXPLICIT.has(k))
      .map(([k, v]) => `\n  ${k}: ${v};`)
      .join('')
  }
}`;

  // Merchant colorSchemes win — they're editable via the admin ThemeSettings
  // UI, so flipping precedence would retroactively change the look of every
  // existing site. Theme manifest schemes fill the gap only for ids the
  // merchant hasn't defined (rare: themes ship 3-4 schemes, merchants seed 5).
  const merchantSchemes = Array.isArray(s.colorSchemes) ? s.colorSchemes : [];
  const merchantById = new Map<string, Record<string, unknown>>();
  for (const raw of merchantSchemes) {
    if (isPlainObject(raw) && typeof (raw as Record<string, unknown>).id === 'string') {
      merchantById.set(
        schemeClassId(String((raw as Record<string, unknown>).id)),
        raw as Record<string, unknown>,
      );
    }
  }
  const themeSchemes = manifest?.colorSchemes ?? [];

  const schemeRuleLines: string[] = [];
  for (const themeScheme of themeSchemes) {
    const key = schemeClassId(themeScheme.id);
    const merchant = merchantById.get(key);
    // Merchant override wins when present — matches the "what you see in
    // constructor is what lands on live" contract. Fall back to theme
    // manifest tokens only when merchant didn't touch this scheme id.
    if (merchant) {
      // 096: merchant override defines basic colors (bg/heading/text/buttons);
      // accent/muted живут только в theme manifest (admin UI не имеет их
      // picker'ов). Inherit accent/muted from theme scheme когда merchant
      // не задал — иначе subtitle/badges остаются без CSS-var.
      const merged: Record<string, unknown> = { ...merchant };
      if (merged.accent === undefined) {
        const themeAccent = themeScheme.tokens?.['--color-accent'];
        if (themeAccent) {
          const [r, g, b] = themeAccent.trim().split(/\s+/).map((n) => parseInt(n, 10));
          if ([r, g, b].every((n) => !Number.isNaN(n))) {
            merged.accent = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
          }
        }
      }
      // Приглушённый НЕ наследуем из манифеста темы, когда мерчант задал свои
      // цвета: у `--color-muted` нет поля в редакторе схемы (состав настроек
      // канон), поэтому константа темы для мерчанта неизменяема ровно так же,
      // как был неизменяем `153 153 153`. Наследование её сюда и замораживало
      // приглушённый текст у flux (204 204 204), vanilla (200 200 200) и bloom
      // (245 245 245): фикс «muted следует схеме» работал только у rose и satin,
      // где манифест нёс тот самый серый. Замер на схеме тестировщика (фон
      // #71C0FF, текст #E91E8C): flux отдавал 204 204 204 вместо 185 95 186.
      // Оставляем undefined → schemeToVars посчитает 60 % текста + 40 % фона
      // мерчанта. Явно заданный в схеме muted (например, тёмный сайдбар
      // корзины) сюда не попадает — он !== undefined и уважается как прежде.
      if (merged.muted === undefined) {
        const canMix =
          hexToRgbTriple(merged.text) !== null && hexToRgbTriple(merged.background) !== null;
        if (!canMix) {
          // Смешивать не из чего (мерчант не дал текст/фон) — тогда константа
          // темы всё ещё лучше, чем отсутствие переменной.
          const themeMuted = themeScheme.tokens?.['--color-muted'];
          if (themeMuted) {
            const [r, g, b] = themeMuted.trim().split(/\s+/).map((n) => parseInt(n, 10));
            if ([r, g, b].every((n) => !Number.isNaN(n))) {
              merged.muted = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
            }
          }
        }
      }
      // ── Поверхность контейнера ───────────────────────────────────────
      // Наследуем `--color-surface` из манифеста темы тем же приёмом, что и
      // акцент выше. Поля «Поверхность» в редакторе схемы нет (состав настроек
      // канон), поэтому у мерчанта, который хоть раз сохранил схему, этого
      // ключа нет вовсе — и `schemeToVars` не печатал переменную СОВСЕМ.
      // Контейнер «Мультиколонн» (`bg-[rgb(var(--color-surface))]`) падал тогда
      // на общий для всех тем запасной `250 250 250`. Владелец 2026-09-16:
      // «не применяется цветовая схема к Контейнеру… берет несуществующий цвет
      // для контейнера и непонятно откуда». Замер живой витрины vanilla
      // 2026-09-17: в правилах `.color-scheme-N` переменной нет, а на странице
      // встречается посторонний `250 250 250` — при том, что в `theme.json`
      // значения уже правильные. Правка темы сайтам с сохранённой схемой не
      // помогает: помогает только наследование, как у акцента.
      if (merged.surfaceBg === undefined) {
        const themeSurface = themeScheme.tokens?.['--color-surface'];
        if (themeSurface) {
          const [r, g, b] = themeSurface.trim().split(/\s+/).map((n) => parseInt(n, 10));
          if ([r, g, b].every((n) => !Number.isNaN(n))) {
            merged.surfaceBg = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
          }
        }
      }
      // ── Поверхность правой колонки чекаута ───────────────────────────
      // 16.09: концепция снята — правая колонка красится «Фоном» той же схемы,
      // как и левая (владелец: «цвет тот же, схема та же, но они
      // различаются» — различие убрано, а не спрятано за очередным условием).
      // `merged.checkoutSurface` больше НЕ проставляем — CSS-правило колонки
      // (см. `checkout-split.ts`) читает `--color-bg` напрямую, отдельного
      // токена нет.
      // ── Рамка поля формы ─────────────────────────────────────────────
      // Тоже для КАЖДОЙ схемы — см. `inputBorderOf`. Точка 3 (16.09): рамка
      // всегда цвета поля, контраст со схемой больше не проверяем.
      merged.inputBorder = inputBorderOf(themeInputBorder, themeInputBg);
      const rule = buildSchemeRule(merged);
      if (rule) {
        schemeRuleLines.push(rule);
      } else {
        schemeRuleLines.push(buildThemeSchemeRule(themeScheme, inputAnchors));
      }
    } else {
      schemeRuleLines.push(buildThemeSchemeRule(themeScheme, inputAnchors));
    }
    merchantById.delete(key);
  }
  for (const remaining of merchantById.values()) {
    // Схема, которой в манифесте темы нет вовсе (мерчант добавил свою).
    // Поверхность больше не считаем (16.09) — колонка берёт «Фон» этой же
    // схемы напрямую.
    const rule = buildSchemeRule({
      ...remaining,
      inputBorder: inputBorderOf(themeInputBorder, themeInputBg),
    });
    if (rule) schemeRuleLines.push(rule);
  }
  const schemeRules = schemeRuleLines.filter((r) => r.length > 0).join('\n');

  // :root получает активную цветовую схему. Merchant-scheme'ы идут первыми —
  // `themeSettings.defaultSchemeIndex` ссылается на merchant порядок. Fallback
  // на theme-manifest only when merchant didn't seed any scheme.
  const schemes: Record<string, unknown>[] = [
    ...(merchantSchemes.filter(isPlainObject) as Record<string, unknown>[]),
    ...themeSchemes.map((ts) => themeSchemeToMerchantShape(ts)),
  ];
  // Тема может назвать схему по умолчанию явно (`theme.json` → `defaultScheme:
  // "scheme-2"`). Иначе дефолтом становится первая схема массива, и чтобы
  // сменить её пришлось бы ПЕРЕСТАВЛЯТЬ массив — из-за чего id перестают идти
  // подряд (scheme-2, scheme-1, ...) и расходятся с остальными темами.
  // Merchant-выбор (`themeSettings.defaultSchemeIndex`) приоритетнее.
  const themeDefaultId =
    typeof (manifest as { defaultScheme?: unknown } | null)?.defaultScheme === 'string'
      ? String((manifest as { defaultScheme?: string }).defaultScheme)
      : null;
  const themeDefaultIdx =
    themeDefaultId !== null
      ? schemes.findIndex(
          (sc) => String((sc as { id?: unknown }).id ?? '') === themeDefaultId,
        )
      : -1;
  // `defaultSchemeIndex` — индекс в MERCHANT-массиве, поэтому он авторитетен
  // только когда мерчантские схемы вообще есть. Конструктор кладёт в настройки
  // `defaultSchemeIndex: 0` всегда (это его собственный дефолт, а не выбор
  // мерчанта); при пустом массиве схем этот ноль указывал на первую схему темы
  // и молча перебивал заявленный темой `defaultScheme`.
  const merchantPickedScheme =
    merchantSchemes.length > 0 && typeof s.defaultSchemeIndex === 'number';
  const defaultIdx = merchantPickedScheme
    ? (s.defaultSchemeIndex as number)
    : themeDefaultIdx >= 0
      ? themeDefaultIdx
      : 0;
  const defaultScheme = isPlainObject(schemes[defaultIdx])
    ? (schemes[defaultIdx] as Record<string, unknown>)
    : isPlainObject(schemes[0])
      ? (schemes[0] as Record<string, unknown>)
      : null;
  const rootColorRules = defaultScheme ? schemeVarsInRoot(defaultScheme) : '';

  // Подложка карточки товара «Карточка» ОБЯЗАНА брать поверхность СВОЕЙ
  // секции, а не дефолтной схемы сайта. `--product-card-bg` в `:root` (см.
  // `rootRules` выше) объявлен как `rgb(var(--color-surface))`, а var()
  // ВНУТРИ кастомного свойства подставляется НА ТОМ элементе, где свойство
  // объявлено (`:root`) — это его КОМПЬЮТЕД-значение, и оно замораживается на
  // всю жизнь дерева: потомки наследуют уже готовое число, а не пересчитывают
  // `--color-surface` заново на себе. Поэтому карточка внутри секции со своей
  // `.color-scheme-N` (владелец задаёт схему СЕКЦИИ — каталог/популярные
  // товары/коллекции) молча несла подложку схемы сайта по умолчанию.
  //
  // Замер в браузере (playwright, dist/theme-css/<тема>.css + buildTokensCss)
  // до этой правки: rose/vanilla/bloom/satin/flux — во всех пяти
  // `--product-card-bg` и фактический `background-color` карточки совпадали
  // между схемой 1 и схемой 4 (2 для flux, см. ниже), хотя `--color-surface`
  // на самой карточке (обычная переменная, БЕЗ второго уровня var()) уже
  // ловил свою секцию корректно — то есть обёртка `.color-scheme-N` работает,
  // а ломается именно двойной var() у `--product-card-bg`.
  //
  // Чинится тем же приёмом, что уже применён ниже у `productCardSchemeRule`
  // (мерчантский выбор схемы ИМЕННО для карточки) — переобъявлением на самом
  // селекторе карточки. Разница: это правило БЕЗУСЛОВНОЕ (не зависит от
  // `productCardScheme`), чтобы карточка следовала АМБИЕНТНОЙ схеме секции по
  // умолчанию, без явного мерчантского оверрайда. `productCardSchemeRule` идёт
  // ПОСЛЕ этого правила в общем CSS (см. return в конце функции) и при
  // одинаковой специфичности побеждает по порядку — явный выбор мерчанта
  // по-прежнему выигрывает у амбиентной схемы секции.
  const productCardBgSelfRule = `[data-nt$="-product-card"]{--product-card-bg:${
    cardStyled ? 'rgb(var(--color-surface,245 245 245))' : 'transparent'
  };}`;

  // «Настройки темы» → «Карточки товара» → «Цветовая схема» (пункт 4 пачки
  // тестировщика 13.09: «под всеми параметрами добавить выбор цветовой схемы,
  // как в сайдбарах»). Схема применяется к КАРТОЧКЕ ТОВАРА по всему магазину —
  // селектор `[data-nt$="-product-card"]` есть у всех пяти тем и в SSR, и в
  // клиентских дорисовках (storefront-hydrate, wishlist).
  //
  // Почему правило переобъявляет `--product-card-bg`: в `:root` он объявлен как
  // `rgb(var(--color-surface))`, а var() внутри кастомного свойства
  // подставляется НА ТОМ элементе, где свойство объявлено. То есть карточка
  // унаследовала бы подложку активной схемы САЙТА, а не выбранной. Объявление
  // на самой карточке подставляет её собственный `--color-surface`.
  //
  // Нет выбора (или выбрана несуществующая схема) → правила нет вовсе, то есть
  // у существующих магазинов ничего не меняется.
  const productCardSchemeId =
    typeof s.productCardScheme === 'string' && s.productCardScheme
      ? schemeClassId(s.productCardScheme)
      : '';
  const productCardScheme = productCardSchemeId
    ? (schemes.find(
        (sc) =>
          isPlainObject(sc) &&
          schemeClassId(String((sc as { id?: unknown }).id ?? '')) === productCardSchemeId,
      ) as Record<string, unknown> | undefined)
    : undefined;
  const productCardSchemeVars = productCardScheme ? schemeToVars(productCardScheme) : '';
  const productCardSchemeRule = productCardSchemeVars
    ? `[data-nt$="-product-card"] {${productCardSchemeVars} --product-card-bg: ${
        cardStyled ? 'rgb(var(--color-surface,245 245 245))' : 'transparent'
      };}`
    : '';

  // «Настройки темы» → «Корзина» → «Цветовая схема» (владелец, 13.09: «добавить
  // цветовую схему сайдбара при настройке "сайдбар" и придать ей живость, то
  // есть применение»). Правило красит КОРЕНЬ дровера, а панель внутри читает
  // --color-* по наследованию — теми самыми правилами, что уже лежат в
  // global.css каждой темы ([data-nt="cart-drawer"] [data-cart-panel] и т.д.).
  //
  // Селектор снят замером по собранным дистам: корней два —
  // `data-nt="cart-drawer"` (rose/flux/bloom/satin) и
  // `data-nt="vanilla-cart-drawer"`. Суффиксный селектор ловит оба, ровно как
  // [data-nt$="-product-card"] у карточки товара.
  //
  // Зачем CSS, когда есть оконный глобал __MERFY_CART_DRAWER_SCHEME__. Глобал
  // читают Layout.astro четырёх тем; у rose такого читателя НЕТ вовсе, а в
  // превью конструктора глобалы не инжектятся ни одной теме. tokens.css —
  // единственный канал, общий и для пяти тем, и для превью, и для витрины.
  //
  // Нет выбора (или схемы с таким id не существует) → правила нет вовсе: у
  // существующих магазинов дровер остаётся ровно прежним.
  const cartDrawerSchemeId =
    typeof s.cartDrawerScheme === 'string' && s.cartDrawerScheme
      ? schemeClassId(s.cartDrawerScheme)
      : '';
  const cartDrawerScheme = cartDrawerSchemeId
    ? (schemes.find(
        (sc) =>
          isPlainObject(sc) &&
          schemeClassId(String((sc as { id?: unknown }).id ?? '')) === cartDrawerSchemeId,
      ) as Record<string, unknown> | undefined)
    : undefined;
  const cartDrawerSchemeVars = cartDrawerScheme ? schemeToVars(cartDrawerScheme) : '';
  // Одних переменных МАЛО — это показал браузерный замер, а не рассуждение.
  // Панель дровера приходит из дизайн-пакета с утилитой `bg-white`, а правила
  // портов, которые красят её токенами схемы, лежат в `@layer base`. Утилиты у
  // Tailwind — слой `utilities`, он старше base, поэтому правила портов
  // проигрывают ВСЕГДА: замер дал белую панель даже с классом `.color-scheme-3`
  // на корне. То есть схема дровера не работала ни у rose, ни у flux, ни у
  // bloom, ни у satin — «мёртвая настройка» ровно в том смысле, про который
  // говорил владелец.
  //
  // tokens.css — БЕЗ слоя, поэтому бьёт и утилиты. Объявления ниже дословно
  // повторяют блок портов (themes/<t>/src/styles/global.css), включая набор
  // селекторов, — расхождение роняет cart-drawer-scheme.spec.ts.
  // `border-radius` сознательно не трогаем: скругление кнопки — отдельная
  // настройка темы, к схеме отношения не имеет.
  //
  // Правило появляется ТОЛЬКО при выбранной схеме: магазины, где её не
  // выбирали, не меняются ни на пиксель.
  /** Корень дровера в любой из пяти тем (см. замер по дистам выше). */
  const DRAWER = '[data-nt$="cart-drawer"]';
  const cartDrawerPaintRule = cartDrawerSchemeVars
    ? [
        `${DRAWER} [data-cart-panel]{background-color:rgb(var(--color-bg));color:rgb(var(--color-text))}`,
        `${DRAWER} [data-cart-panel] h2{color:rgb(var(--color-heading))}`,
        `${DRAWER} [data-cart-panel] > div > button[data-cart-close]{color:rgb(var(--color-muted))}`,
        `${DRAWER} [data-cart-empty] p{color:rgb(var(--color-muted))}`,
        `${DRAWER} [data-cart-empty] p a{color:rgb(var(--color-text))}`,
        `${DRAWER} [data-cart-summary] > div{color:rgb(var(--color-text))}`,
        `${DRAWER} [data-cart-empty] > a,${DRAWER} [data-cart-summary] > a{background-color:rgb(var(--color-button-bg));color:rgb(var(--color-button-text))}`,
      ].join('')
    : '';
  const cartDrawerSchemeRule = cartDrawerSchemeVars
    ? `${DRAWER} {${cartDrawerSchemeVars}${
        themeId === 'vanilla' ? VANILLA_CART_DRAWER_ALIASES : ''
      }}${cartDrawerPaintRule}`
    : '';

  // ── Поиск всегда красится Схемой 1 ────────────────────────────────────
  // Владелец, 15.09 (дословно): «Во всех темах Поиск должен брать на себя цвет
  // фона, текста, цвет текста в кнопке и цвет кнопки из Цветовой схемы 1».
  // Решение принято им же явно: «Всегда Схема 1, жёстко» — что бы ни стояло у
  // секции-шапки вокруг. Побочный эффект («на тёмной шапке белое поле поиска
  // будет выбиваться») озвучен и принят.
  //
  // Замер «до» (Chromium 1440, пять живых стендов, шапка обёрнута в
  // .color-scheme-1..5 поочерёдно; фон поля | текст поля | фон кнопки | текст
  // кнопки):
  //   rose    255 255 255 | 0 0 0 | СКАЧЕТ 0 0 0→255 255 255 | СКАЧЕТ
  //   vanilla 255 255 255 | 0 0 0 | 58 69 48    | 255 255 255  (замерло)
  //   bloom   255 255 255 | 0 0 0 | 227 142 159 | 255 255 255  (замерло)
  //   satin   255 255 255 | 0 0 0 | 0 0 0       | 255 255 255  (замерло)
  //   flux    255 255 255 | 0 0 0 | 30 41 82    | 255 255 255  (замерло)
  // То есть ни одна из двадцати величин не приходила из Схемы 1: фон и текст
  // поля — литералы `bg-white` / `text-[#000000]` в каждом порту
  // (themes/rose/src/components/Header.astro:477,485;
  //  themes/vanilla/…:565,573; themes/bloom/…:673,679;
  //  themes/satin/…:295,296; themes/flux/…:489,495), кнопка — литерал у bloom
  // (#e38e9f, :683), satin (#000000, :297), flux (#1e2952, :499), алиас
  // --vanilla-header-bg у vanilla (:577) и наследование от ОКРУЖАЮЩЕЙ схемы у
  // rose (:489 `!bg-[rgb(var(--color-button-bg,0_0_0))]`).
  //
  // Почему правило здесь, а не копией в пяти портах: tokens.css — единственный
  // слой, общий и витрине, и превью конструктора (см. wishlistHideRule,
  // cartDrawerPaintRule). Порты не трогаем вовсе.
  //
  // Почему два блока, а не один:
  //   1) ПЕРЕМЕННЫЕ на корне формы. Нужны ради rose: её кнопка объявлена
  //      !important-утилитой (`!bg-[…]`), а для !important слой `utilities`
  //      СИЛЬНЕЕ безслойного правила — покраска бы проиграла. Зато сама
  //      утилита читает --color-button-bg, и переопределение переменной
  //      доводит до неё ровно Схему 1.
  //   2) ПОКРАСКА литералов (bloom/satin/flux/vanilla). Утилиты `bg-white`,
  //      `bg-[#1e2952]` без !important лежат в @layer utilities, а tokens.css
  //      БЕЗ слоя — безслойное обычное объявление бьёт любой слой.
  //
  // Область — ровно четыре величины владельца. Подложка самой выпадающей
  // панели ([data-search-panel] у satin/flux), рамки, тень, плашка подсказок
  // satin ([data-search-results]) НЕ трогаются.
  //
  // Кнопка красится только в выпадающей панели: в мобильном бургере
  // `button[type="submit"]` — голая иконка без фона во всех пяти темах
  // (themes/*/src/components/Header.astro, формы с aria-label="Найти"), и
  // заливка её фоном была бы изменением сверх просьбы.
  //
  // Нет схемы с id `scheme-1` (ни у мерчанта, ни в манифесте) → правила нет
  // вовсе, всё остаётся как было.
  const scheme1Tokens = pickSchemeOneTokens(schemeRules);
  const searchScheme1Rule = buildSearchScheme1Rule(scheme1Tokens);

  // Избранное (wishlist) вкл/выкл — глобальный тумблер из ThemeSettingsPanel
  // («Настройки темы» → «Избранное»). Когда выключено, скрываем весь wishlist UI
  // во ВСЕХ темах одним правилом (зеркалит live+preview, т.к. эта функция —
  // единый источник tokens.css для обоих). Селекторы универсальны:
  //   a[href$="/wishlist"]   — ссылка избранного в шапке. $= (ends-with) ловит и
  //                            live "/wishlist", и превью "/__theme/<тема>/wishlist"
  //                            (nav-агент превью переписывает root-URL).
  //   [data-wishlist-toggle] — все сердечки (карточки каталога + PDP), в т.ч.
  //                            добавленные initWishlistUI динамически.
  const wishlistHideRule =
    s.wishlistEnabled === false
      ? 'a[href$="/wishlist"],[data-wishlist-toggle]{display:none !important}'
      : '';

  // Sticky footer — прижать подвал к низу вьюпорта на коротких страницах.
  // Во всех темах Layout.astro рендерит <body> обычным блочным потоком
  // (Header + <main> + Footer, без flex-обёртки) → на страницах ниже экрана
  // (пустая корзина, аккаунт, контентные, 404) футер «всплывал» в середину.
  // Единое правило (live + preview — эта функция единый источник tokens.css
  // для обоих, как wishlistHideRule):
  //   - <body> → flex-колонка высотой ≥ вьюпорт;
  //   - <main> (прямой ребёнок) растягивается (flex-grow), толкая всё после
  //     себя (футер-обёртку) вниз. Cart-drawer (position:fixed) и <script>
  //     (display:none) вне потока — не мешают.
  // Scope:
  //   :has(footer)          — только полностраничный рендер. Одиночный
  //                           preview/block (без футера) не трогаем — блок
  //                           должен сайзиться по контенту, не на 100vh.
  //   :not(:has(main main)) — исключаем /checkout (React: Layout-<main>
  //                           оборачивает собственный <main class="flex-1">).
  //                           Память: checkout-флоу/хром ведёт его автор.
  // Unlayered → перебивает @layer base { body, main } из global.css тем.
  const stickyFooterRule =
    'body:has(footer):not(:has(main main)){min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}' +
    'body:has(footer):not(:has(main main))>main{flex:1 0 auto}';

  // Поверхность страницы аккаунта = вся высота между шапкой и подвалом.
  // Продолжает цепочку sticky-footer: тот растягивает <main>, это — то, что
  // внутри него. Разбор и замеры — у ACCOUNT_SURFACE_CSS.
  const accountSurfaceRule = ACCOUNT_SURFACE_CSS;

  // Порт origin/main (спека 2026-07-06 + «оживление слайдеров типографики»):
  // зазор МЕЖДУ секциями = margin-top прямых детей <main> кроме первого
  // (owl `* + *`); header/footer вне <main>, props.padding блоков не трогается.
  // Дефолт 0px = нулевая регрессия.
  const sectionGapRule = 'main > * + *{margin-top:var(--section-gap, 0px)}';

  // «Жирность/Шрифт заголовка-текста» — порты хардкодят font-family/weight по
  // Figma (в т.ч. `!font-normal` = !important в @layer utilities). Инжектим
  // override ТОЛЬКО когда мерчант РЕАЛЬНО задал значение (…Set) — иначе правило
  // пустое и дефолтный вид тем сохранён байт-в-байт (default-preserving).
  // КРИТИЧНО — обёртка `@layer utilities`: для !important порядок слоёв обратный,
  // и безслойное правило проигрывает слою. В том же слое решает специфичность:
  // наш (0,1,2) > (0,1,0) у `.\!font-normal`.
  // Текст, до которого доходят «Шрифт текста» и «Жирность текста». Кроме
  // абзацев, пунктов, кнопок и подписей — все надписи карточки товара: название,
  // цена и плашки там <a>, <span>, <div>, и до 23.09 выбор мерчанта не менял
  // карточки ни в одной секции («Коллекция товаров», «Группа товаров» и др.).
  // Владелец: «надо сделать как везде — такая же секция, по таким же правилам».
  // Карточку во всём магазине узнаём по той же метке, что и её схему
  // (`[data-nt$="-product-card"]`, см. productCardSchemeRule); заголовки внутри
  // карточки — роль заголовка, их правило текста не трогает.
  const bodyTextSelectors =
    'main p[class],main li[class],main button[class],main label[class],' +
    'main [data-nt$="-product-card"] [class]:not(h1,h2,h3,h4,h5,h6)';
  const weightHeadingRule = headingWeightSet
    ? 'main h1[class],main h2[class],main h3[class],main h4[class],main h5[class],main h6[class],footer h1[class],footer h2[class],footer h3[class],footer h4[class],footer h5[class],footer h6[class]{font-weight:var(--weight-heading) !important}'
    : '';
  const weightBodyRule = bodyWeightSet
    ? `${bodyTextSelectors}{font-weight:var(--weight-body) !important}`
    : '';
  const fontHeadingRule = headingFontSet
    ? 'main h1[class],main h2[class],main h3[class],main h4[class],main h5[class],main h6[class],footer h1[class],footer h2[class],footer h3[class],footer h4[class],footer h5[class],footer h6[class]{font-family:var(--font-heading) !important}'
    : '';
  const fontBodyRule = bodyFontSet
    ? `${bodyTextSelectors}{font-family:var(--font-body) !important}`
    : '';
  const typographyOverrides = [
    weightHeadingRule,
    weightBodyRule,
    fontHeadingRule,
    fontBodyRule,
  ]
    .filter(Boolean)
    .join('');
  const typographyLayer = typographyOverrides
    ? `@layer utilities{${typographyOverrides}}`
    : '';

  return [
    rootRules,
    rootColorRules,
    schemeRules,
    productCardBgSelfRule,
    productCardSchemeRule,
    cartDrawerSchemeRule,
    searchScheme1Rule,
    wishlistHideRule,
    stickyFooterRule,
    accountSurfaceRule,
    // Поверхность контентной страницы («Страница») = вся высота между шапкой
    // и подвалом. Продолжает ту же цепочку sticky-footer, что и поверхность
    // аккаунта. Разбор, замеры «до/после» и причинность — у CONTENT_SURFACE_CSS.
    CONTENT_SURFACE_CSS,
    sectionGapRule,
    typographyLayer,
    // Чекаут ВСЕГДА светлый (Figma 1:13398) — константа, не завязанная ни на
    // одну мерчантскую схему темы. Разбор — у CHECKOUT_SCHEME_CSS.
    CHECKOUT_SCHEME_CSS,
    // Текст/заголовок чекаута — ТОЛЬКО платформенные, независимо от того,
    // какую схему мерчант выбрал для формы/сводки/шапки/кнопки (владелец,
    // 16.09, п.1). Разбор — у CHECKOUT_TYPOGRAPHY_LOCK_CSS.
    CHECKOUT_TYPOGRAPHY_LOCK_CSS,
    // Кнопка оплаты «оживает» на hover своим ЖЕ цветом (не отдельным hover-
    // токеном схемы) — владелец, 16.09, п.2. Разбор — у
    // CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS.
    CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS,
  ]
    .filter(Boolean)
    .join('\n');
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function toPx(v: unknown, fallback: number): string {
  return `${typeof v === 'number' ? v : fallback}px`;
}

function fontFamily(v: unknown, fallback: string): string {
  if (typeof v !== 'string' || !v) return fallback;
  // Known constructor keys → font stacks.
  const known: Record<string, string> = {
    comfortaa: '"Comfortaa", system-ui, sans-serif',
    manrope: '"Manrope", system-ui, sans-serif',
    inter: '"Inter", system-ui, sans-serif',
    'playfair-display': '"Playfair Display", Georgia, serif',
    roboto: '"Roboto", system-ui, sans-serif',
  };
  return known[v] ?? `"${v}", ${fallback}`;
}

/**
 * Merchant-first cascade: returns merchant-derived value if user set it,
 * otherwise theme manifest token, otherwise hardcoded fallback.
 *
 * `merchantSet` = was the merchant key actually present in settings?
 * (We can't distinguish "user set 0" from "absent" without explicit flag.)
 */
function merchantFirst(
  merchantValue: string,
  merchantSet: boolean,
  themeDefault: string | undefined,
  hardcoded: string,
): string {
  if (merchantSet) return merchantValue;
  return themeDefault ?? hardcoded;
}

/**
 * Алиасы дровера vanilla. Её панель читает НЕ --color-*, а собственные
 * --vanilla-*; порт переназначает их сам
 * (themes/vanilla/src/styles/global.css), но ТОЛЬКО при классе
 * `.color-scheme-N`, который вешает JS из оконного глобала. В превью
 * конструктора глобалов нет, поэтому те же алиасы обязано выдавать tokens.css —
 * иначе «живость» настройки у vanilla была бы только на витрине.
 *
 * Объявления совпадают с портом дословно; расхождение роняет
 * cart-drawer-scheme.spec.ts («алиасы дровера vanilla совпадают с портом»).
 */
const VANILLA_CART_DRAWER_ALIASES = [
  '--vanilla-surface: rgb(var(--color-bg));',
  '--vanilla-dark: rgb(var(--color-heading));',
  '--vanilla-muted: rgb(var(--color-muted));',
  '--vanilla-header-bg: rgb(var(--color-button-bg, var(--color-heading)));',
  '--vanilla-line: rgb(var(--color-muted) / 0.3);',
]
  .map((d) => ` ${d}`)
  .join('');

function schemeClassId(id: string): string {
  return id.replace(/^scheme-/, '');
}

/**
 * РАМКА ПОЛЯ ФОРМЫ для ОДНОЙ схемы.
 *
 * Жалоба 15.09: «убрать тёмные очертания по периметру». Замер собранной витрины
 * (Chromium 1440×1400, схема с «Фоном» #71C0FF): каждое поле чекаута обведено
 * рамкой 1px — rose `rgb(153,153,153)`, остальные четыре `rgb(210,210,210)`. На
 * светло-голубой подложке этот серый читается как чужая тёмная обводка.
 *
 * ПРИЧИНА. `--color-input-border` объявлен в реестре токенов
 * (`packages/theme-contract/tokens/registry.ts`) как `scope: 'scheme'`, но НИ
 * ОДНА тема не кладёт его в `colorSchemes[].tokens`: rose задаёт его один раз в
 * `defaults` (`153 153 153`), остальные берут `BASE_DEFAULTS` (`210 210 210`).
 * Генератор печатал его только в `:root` — то есть рамка была одна на все схемы
 * и на смену схемы не реагировала вовсе. Ровно та же болезнь, что была у
 * замороженного `--color-muted: 153 153 153`.
 *
 * ПОПРАВКА 16.09. 15.09 сюда встал контраст-порог: рамку оставляли там, где
 * белое поле сливалось с белой/светлой подложкой (13 связок из 21 — rose
 * 1/2/3/5, vanilla 3/4, bloom 3/4, satin 1/2/3, flux 2/3), и снимали там, где
 * поле читалось само. Владелец 16.09 отменил условие целиком: «убрать» —
 * дословно и без исключений. Рамка теперь ВСЕГДА цвета самого поля
 * (`--color-input-bg`), то есть невидима на любой схеме любой темы.
 *
 * ЧЕМ ПЛАТИМ. Контраст «поле ↔ подложка» в тех же 13 связках остаётся
 * НИЖЕ 1.5 (диапазон 1.00–1.16 — считает `checkout-summary-scheme-surface.
 * spec.ts`, раздел «точка 3»): без рамки границы поля на белой/светлой схеме
 * не видно вовсе, различим только курсор фокуса. Это принятое владельцем
 * решение, а не забытый баг — сторож проверяет ЧИСЛОМ, что деградация
 * произошла именно там и только там.
 */
function inputBorderOf(
  themeBorder: string | null,
  inputBg: string | null,
): string | null {
  if (!themeBorder) return null;
  const field = normTriple(inputBg);
  return field ?? themeBorder;
}

function buildThemeSchemeRule(
  scheme: {
    id: string;
    tokens: Record<string, string>;
  },
  inputAnchors?: { border: string | null; bg: string | null },
): string {
  const tokens = { ...scheme.tokens };
  // Тот же закон, что и для схемы мерчанта (buildSchemeRule): замороженный серый
  // пересчитываем из текста и фона ЭТОЙ схемы.
  //
  // Сюда попадают схемы, которые мерчант не переопределял, — и до 14.09 их
  // токены перекладывались из манифеста один в один, вместе с `153 153 153`.
  // Замер живой витрины satin (8afc7b1ed6ee, 14.09): в корне (схема 1)
  // --color-muted уже 102 102 102, а внутри секции со схемой 2 — по-прежнему
  // 153 153 153, и шесть надписей («6 товаров», «Общая», текст коллекции)
  // выходили серыми. Жалоба тестировщика: «во всех секциях вместо используемого
  // цвета для текста применяется Серый».
  //
  // Осознанно заданный приглушённый (например 187 187 187 у тёмного дровера
  // корзины) не трогаем — он не равен замороженному и уходит как есть.
  const declared = tokens['--color-muted']?.trim();
  if (declared === FROZEN_GREY_MUTED) {
    const пересчитанный = mixRgbTriples(
      tokens['--color-text']?.trim() ?? null,
      tokens['--color-bg']?.trim() ?? null,
      0.6,
    );
    if (пересчитанный) tokens['--color-muted'] = пересчитанный;
  }
  // 16.09: `--color-checkout-surface` снят — правая колонка чекаута красится
  // тем же `--color-bg`, что и левая (см. разбор в `checkout-split.ts`). Токен
  // сюда больше не пишем, схема мерчанта его печатает сама только если он там
  // физически есть (старые ревизии) — см. `schemeToVars`.
  // Рамка поля — инвариант «объявлена у каждой схемы» остаётся, значение
  // теперь ВСЕГДА цвет самого поля (точка 3, 16.09: «убрать» — без исключений).
  // Опоры темы приходят параметром: `buildThemeSchemeRule` манифеста не видит.
  const inputBorder = inputBorderOf(inputAnchors?.border ?? null, inputAnchors?.bg ?? null);
  if (inputBorder) tokens['--color-input-border'] = inputBorder;
  // Наведение для схем, которые мерчант не переопределял. Значения приезжают из
  // `theme.json` как есть (все 21 схема пяти тем их объявляют с 17.09); вывод
  // из самого цвета кнопки — запасной путь для темы, которая их не объявила:
  // иначе `--color-button-*-hover` на уровне схемы не было бы ВОВСЕ и кнопка
  // наследовала бы наведение из `:root`, то есть цвет ЧУЖОЙ схемы по умолчанию
  // (замер 17.09: у bloom кнопка схемы 3 при наведении становилась белой —
  // это цвет кнопки схемы 1).
  //
  // Выводим ТОЛЬКО для тех семейств, чей обычный цвет эта схема объявляет.
  // Иначе у vanilla/bloom/satin, где `--color-button-secondary-bg` на уровне
  // схемы нет, покой брался бы из `:root`, а наведение — из схемы, и кнопка
  // прыгала бы между двумя разными источниками.
  for (const family of ['--color-button', '--color-button-secondary', '--color-button-2']) {
    const bg = tokens[`${family}-bg`];
    if (!bg) continue;
    const text = tokens[`${family}-text`];
    if (!tokens[`${family}-bg-hover`]) {
      const derived = deriveHoverTriple(normTriple(bg), normTriple(text));
      if (derived) tokens[`${family}-bg-hover`] = derived;
    }
    if (text && !tokens[`${family}-text-hover`]) {
      const derived = deriveHoverText(
        normTriple(text),
        normTriple(bg),
        normTriple(tokens[`${family}-bg-hover`]),
      );
      if (derived) tokens[`${family}-text-hover`] = derived;
    }
  }
  const pairs = Object.entries(tokens).map(([k, v]) => `${k}: ${v}`);
  if (pairs.length === 0) return '';
  return `.color-scheme-${schemeClassId(scheme.id)} { ${pairs.join('; ')}; }`;
}

export function themeSchemeToMerchantShape(scheme: {
  id: string;
  name: string;
  tokens: Record<string, string>;
}): Record<string, unknown> {
  const t = scheme.tokens;
  const rgbTripleToHex = (v: string | undefined): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const parts = v.trim().split(/\s+/).map((n) => parseInt(n, 10));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined;
    const [r, g, b] = parts;
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  };
  return {
    id: scheme.id,
    name: scheme.name,
    background: rgbTripleToHex(t['--color-bg']),
    surfaceBg: rgbTripleToHex(t['--color-surface']),
    heading: rgbTripleToHex(t['--color-heading']),
    text: rgbTripleToHex(t['--color-text']),
    // 096: preserve accent + muted tokens — Figma 905-19049 flux subtitle
    // "M Phone" (orange) и multiple block rendering paths используют
    // --color-accent / --color-muted. Без этих полей merchant-shape
    // conversion стрипит их при сериализации в CSS.
    accent: rgbTripleToHex(t['--color-accent']),
    muted: rgbTripleToHex(t['--color-muted']),
    // Наведение. До 17.09 конвертер переносил у кнопок только background/text/
    // border — и это был ПЕРВЫЙ разрыв цепочки «тема → редактор схем → CSS».
    // Именно отсюда конструктор сидирует палитру мерчанта
    // (`theme-puck-config.controller.ts`), поэтому поля «При наведении» в
    // редакторе схем стояли пустыми во всех темах — не потому, что их некуда
    // записать, а потому, что значению неоткуда было взяться. Пустое поле и
    // приводило к `?? background` в `schemeToVars`, то есть к наведению,
    // неотличимому от покоя. Значения берём из `theme.json`; если тема их не
    // объявила — выводим из самого цвета кнопки, чтобы поле не осталось пустым.
    primaryButton: {
      background: rgbTripleToHex(t['--color-button-bg']),
      text: rgbTripleToHex(t['--color-button-text']),
      border: rgbTripleToHex(t['--color-button-border']),
      backgroundHover: rgbTripleToHex(
        t['--color-button-bg-hover'] ??
          deriveHoverTriple(
            normTriple(t['--color-button-bg']),
            normTriple(t['--color-button-text']),
          ) ??
          undefined,
      ),
      textHover: rgbTripleToHex(
        t['--color-button-text-hover'] ??
          deriveHoverText(
            normTriple(t['--color-button-text']),
            normTriple(t['--color-button-bg']),
            normTriple(t['--color-button-bg-hover']) ??
              deriveHoverTriple(
                normTriple(t['--color-button-bg']),
                normTriple(t['--color-button-text']),
              ),
          ) ??
          undefined,
      ),
    },
    secondaryButton: {
      background: rgbTripleToHex(t['--color-button-2-bg']),
      text: rgbTripleToHex(t['--color-button-2-text']),
      border: rgbTripleToHex(t['--color-button-2-border']),
      backgroundHover: rgbTripleToHex(
        t['--color-button-2-bg-hover'] ??
          deriveHoverTriple(
            normTriple(t['--color-button-2-bg']),
            normTriple(t['--color-button-2-text']),
          ) ??
          undefined,
      ),
      textHover: rgbTripleToHex(
        t['--color-button-2-text-hover'] ??
          deriveHoverText(
            normTriple(t['--color-button-2-text']),
            normTriple(t['--color-button-2-bg']),
            normTriple(t['--color-button-2-bg-hover']) ??
              deriveHoverTriple(
                normTriple(t['--color-button-2-bg']),
                normTriple(t['--color-button-2-text']),
              ),
          ) ??
          undefined,
      ),
    },
  };
}

/**
 * Корень поиска в любой из пяти тем. Замер по портам (grep `role="search"` по
 * themes/<t>/src): ровно две формы на тему — выпадающая панель шапки и форма в
 * мобильном бургере, и ничего больше. В общем пакете (theme-base
 * blocks/Header/Header.astro:338) — та же разметка.
 */
export const SEARCH_FORM_SELECTOR = 'form[role="search"]';

/** Кнопка «Найти» выпадающей панели (в бургере она — голая иконка). */
export const SEARCH_PANEL_SUBMIT_SELECTOR = `[data-search-panel] ${SEARCH_FORM_SELECTOR} button[type="submit"]`;

/**
 * Четыре токена Схемы 1 — и ничего сверх них: фон поля, цвет текста в поле,
 * цвет кнопки, цвет текста кнопки. Ровно объём просьбы владельца.
 */
const SEARCH_SCHEME_TOKENS = [
  '--color-bg',
  '--color-text',
  '--color-button-bg',
  '--color-button-text',
] as const;

/**
 * Достаёт объявления уже собранного правила `.color-scheme-1`.
 *
 * Читаем именно текст правила, а не исходную схему, чтобы значения совпадали с
 * `.color-scheme-1` побайтно, какой бы веткой оно ни строилось — мерчантской
 * (buildSchemeRule, где текст и фон ещё пересчитывают приглушённый) или
 * манифестной (buildThemeSchemeRule). Иначе «Схема 1» в поиске и «Схема 1» в
 * секции могли бы разойтись.
 *
 * `(?![\d-])` — чтобы `.color-scheme-10` мерчанта не читалось как схема 1.
 */
export function pickSchemeOneTokens(
  schemeRules: string,
): Record<string, string> | null {
  const m = schemeRules.match(/\.color-scheme-1(?![\d-])\s*\{([^}]*)\}/);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const decl of m[1].split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const name = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    if (name.startsWith('--') && value) out[name] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Правило «поиск всегда в Схеме 1». Разбор — у места вызова в buildTokensCss.
 * Объявление появляется только для тех токенов, которые у Схемы 1 РЕАЛЬНО есть:
 * иначе `rgb(var(--color-bg))` подхватил бы значение по наследству, то есть
 * ровно ту окружающую схему, от которой поиск и отвязывают.
 */
export function buildSearchScheme1Rule(
  tokens: Record<string, string> | null,
): string {
  if (!tokens) return '';
  const has = (n: (typeof SEARCH_SCHEME_TOKENS)[number]) =>
    typeof tokens[n] === 'string' && tokens[n].length > 0;
  const vars = SEARCH_SCHEME_TOKENS.filter(has)
    .map((n) => `${n}:${tokens[n]};`)
    .join('');
  if (!vars) return '';
  const rules: string[] = [];
  rules.push(
    `${SEARCH_FORM_SELECTOR}{${vars}${
      has('--color-bg') ? 'background-color:rgb(var(--color-bg));' : ''
    }}`,
  );
  if (has('--color-text')) {
    rules.push(
      `${SEARCH_FORM_SELECTOR} input[type="search"]{color:rgb(var(--color-text));}`,
    );
  }
  const button = [
    has('--color-button-bg')
      ? 'background-color:rgb(var(--color-button-bg));'
      : '',
    has('--color-button-text') ? 'color:rgb(var(--color-button-text));' : '',
  ].join('');
  if (button) rules.push(`${SEARCH_PANEL_SUBMIT_SELECTOR}{${button}}`);
  return rules.join('');
}

function buildSchemeRule(scheme: Record<string, unknown>): string {
  const id = typeof scheme.id === 'string' ? scheme.id : '';
  if (!id) return '';
  const vars = schemeToVars(scheme);
  if (!vars) return '';
  return `.color-scheme-${schemeClassId(id)} {${vars}}`;
}

function schemeVarsInRoot(scheme: Record<string, unknown>): string {
  const vars = schemeToVars(scheme);
  return vars ? `:root {${vars}}` : '';
}

function schemeToVars(scheme: Record<string, unknown>): string {
  const bg = hexToRgbTriple(scheme.background);
  const surface = hexToRgbTriple(scheme.surfaceBg);
  const heading = hexToRgbTriple(scheme.heading);
  const text = hexToRgbTriple(scheme.text);
  const primary = isPlainObject(scheme.primaryButton)
    ? (scheme.primaryButton as Record<string, unknown>)
    : {};
  const secondary = isPlainObject(scheme.secondaryButton)
    ? (scheme.secondaryButton as Record<string, unknown>)
    : {};

  const parts: string[] = [];
  if (bg) parts.push(`--color-bg: ${bg}`);
  if (surface) {
    parts.push(`--color-bg-alt: ${surface}`);
    parts.push(`--color-surface: ${surface}`);
  }
  if (heading) parts.push(`--color-heading: ${heading}`);
  if (text) parts.push(`--color-text: ${text}`);
  // 096: emit accent + muted CSS-vars (preserved from theme manifest via
  // themeSchemeToMerchantShape). Used by Catalog subtitle, sale badges,
  // muted text variants — Figma 905-19049 flux electronics.
  const accent = hexToRgbTriple(scheme.accent);
  if (accent) parts.push(`--color-accent: ${accent}`);
  // 16.09: `--color-checkout-surface` больше не эмитится — правая колонка
  // чекаута берёт `--color-bg` этой же схемы напрямую (см. `checkout-split.
  // ts`). Токена `scheme.checkoutSurface` в данных мерчанта не бывает: его
  // единственный писатель (`buildTokensCss`) убран этим же патчем.
  // Рамка поля формы — реестр токенов объявляет её `scope: 'scheme'`, но до
  // 15.09 генератор печатал её только в `:root`, одну на все схемы. Считает
  // `inputBorderOf`.
  const inputBorder =
    hexToRgbTriple(scheme.inputBorder) ?? normTriple(scheme.inputBorder);
  if (inputBorder) parts.push(`--color-input-border: ${inputBorder}`);
  // Приглушённый текст — это ТЕКСТ схемы, разбавленный её фоном, а не отдельный
  // фиксированный серый. Раньше `--color-muted` приезжал готовым из theme.json
  // (у всех схем `153 153 153`), поэтому подзаголовки секций, описания и телефон
  // оставались серыми, какой бы цвет текста мерчант ни выбрал, — а поля для
  // самого muted в редакторе схемы нет и не планируется (состав настроек канон).
  // Жалоба тестировщика 14.09: «во всех секциях вместо используемого цвета для
  // текста применяется Серый». Считаем сами: 60 % текста + 40 % фона — та же
  // пропорция, которой уже приглушены описание и старая цена в секции «Товар».
  // Осознанно заданный приглушённый уважаем (например, схема сайдбара корзины
  // несёт свой `187 187 187` под тёмный дровер). Пересчитываем ТОЛЬКО тот самый
  // серый `153 153 153`, который стоял во всех схемах всех пяти тем и которого
  // мерчант изменить не мог — поля для него в редакторе схемы нет.
  const declaredMuted = hexToRgbTriple(scheme.muted);
  const muted =
    declaredMuted === null || declaredMuted === FROZEN_GREY_MUTED
      ? (mixRgbTriples(text, bg, 0.6) ?? declaredMuted)
      : declaredMuted;
  if (muted) parts.push(`--color-muted: ${muted}`);
  const primaryBg = hexToRgbTriple(primary.background);
  const primaryText = hexToRgbTriple(primary.text);
  const primaryBorder = hexToRgbTriple(primary.border);
  if (primaryBg) parts.push(`--color-button-bg: ${primaryBg}`);
  if (primaryText) parts.push(`--color-button-text: ${primaryText}`);
  if (primaryBorder) parts.push(`--color-button-border: ${primaryBorder}`);
  // Наведение. Раньше здесь стоял `?? primaryBg` — «нет своего наведения,
  // значит берём обычный цвет», и наведение было мертво у КАЖДОЙ схемы, у
  // которой поле не заполнено (а не заполнено оно было везде: значение туда не
  // доезжало — см. `themeSchemeToMerchantShape`). Теперь запасной путь —
  // ВЫВЕСТИ цвет из самого фона кнопки, чтобы наведение работало и у схем,
  // сохранённых мерчантом до правки, и у любого цвета, который мерчант выберет,
  // не тронув поле наведения. Явно заданное значение по-прежнему сильнее вывода.
  const primaryBgHover =
    hexToRgbTriple(primary.backgroundHover) ??
    deriveHoverTriple(primaryBg, primaryText) ??
    primaryBg;
  const primaryTextHover =
    hexToRgbTriple(primary.textHover) ??
    deriveHoverText(primaryText, primaryBg, primaryBgHover) ??
    primaryText;
  if (primaryBgHover) parts.push(`--color-button-bg-hover: ${primaryBgHover}`);
  if (primaryTextHover) parts.push(`--color-button-text-hover: ${primaryTextHover}`);
  const secondaryBg = hexToRgbTriple(secondary.background);
  const secondaryText = hexToRgbTriple(secondary.text);
  const secondaryBorder = hexToRgbTriple(secondary.border);
  if (secondaryBg) parts.push(`--color-button-secondary-bg: ${secondaryBg}`);
  if (secondaryText) parts.push(`--color-button-secondary-text: ${secondaryText}`);
  if (secondaryBorder) parts.push(`--color-button-secondary-border: ${secondaryBorder}`);
  const secondaryBgHover =
    hexToRgbTriple(secondary.backgroundHover) ??
    deriveHoverTriple(secondaryBg, secondaryText) ??
    secondaryBg;
  const secondaryTextHover =
    hexToRgbTriple(secondary.textHover) ??
    deriveHoverText(secondaryText, secondaryBg, secondaryBgHover) ??
    secondaryText;
  if (secondaryBgHover) parts.push(`--color-button-secondary-bg-hover: ${secondaryBgHover}`);
  if (secondaryTextHover) parts.push(`--color-button-secondary-text-hover: ${secondaryTextHover}`);
  // Алиасы button-2 ≡ secondary: .color-scheme-N правила theme.json несут --color-button-2-*,
  // :root обязан быть согласован (ревью T9).
  if (secondaryBg) parts.push(`--color-button-2-bg: ${secondaryBg}`);
  if (secondaryText) parts.push(`--color-button-2-text: ${secondaryText}`);
  if (secondaryBorder) parts.push(`--color-button-2-border: ${secondaryBorder}`);
  if (secondaryBgHover) parts.push(`--color-button-2-bg-hover: ${secondaryBgHover}`);
  if (secondaryTextHover) parts.push(`--color-button-2-text-hover: ${secondaryTextHover}`);

  return parts.length > 0 ? ' ' + parts.join('; ') + ';' : '';
}

/**
 * Смешать две RGB-тройки («R G B») в пропорции `ratio` (доля первой).
 * Возвращает null, если любая из троек не разобралась, — вызывающий код тогда
 * падает на прежнее значение и ничего не ломает.
 */
/** Тот самый серый, который приезжал из theme.json во все схемы всех тем. */
const FROZEN_GREY_MUTED = '153 153 153';

function mixRgbTriples(
  a: string | null,
  b: string | null,
  ratio: number,
): string | null {
  if (!a || !b) return null;
  const pa = a.trim().split(/\s+/).map(Number);
  const pb = b.trim().split(/\s+/).map(Number);
  if (pa.length !== 3 || pb.length !== 3) return null;
  if ([...pa, ...pb].some((n) => !Number.isFinite(n))) return null;
  const mix = pa.map((v, i) => Math.round(v * ratio + pb[i] * (1 - ratio)));
  return mix.join(' ');
}

/**
 * Величина сдвига цвета кнопки при наведении — доля пути до белого (для
 * тёмной кнопки) или до чёрного (для светлой). 0.12 = 12 %.
 *
 * ПОЧЕМУ 12 %. Замер по всем 42 кнопкам 21 схемы пяти тем (17.09): при 12 %
 * САМАЯ вялая кнопка набора сдвигается на ΔE76 = 7.7 — это ~3.3 порога
 * различимости (JND ≈ 2.3), то есть наведение видно на КАЖДОЙ кнопке, а не
 * «на глаз кажется». Медиана 10.8, максимум 12.5. Меньшие величины подходят
 * к порогу вплотную (8 % → ΔE76 4.0 у худшей кнопки), бОльшие (18–22 %) уже
 * читаются как смена цвета, а не как подсветка.
 */
export const HOVER_SHIFT = 0.12;

/**
 * Порог читаемости надписи на кнопке (WCAG AA для обычного текста).
 * Ниже него наведение считаем сломавшим надпись и чиним.
 */
const READABLE_CR = 4.5;

/** Относительная яркость (WCAG) тройки «R G B»; null — если не разобралась. */
function relLuminance(triple: string | null): number | null {
  if (!triple) return null;
  const parts = triple.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const lin = parts.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Контраст (WCAG) двух троек «R G B»; null — если хоть одна не разобралась. */
export function contrastRatio(a: string | null, b: string | null): number | null {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Сдвинуть тройку на `HOVER_SHIFT` в сторону полюса («255 255 255» / «0 0 0»). */
function towards(triple: string | null, pole: string): string | null {
  return mixRgbTriples(triple, pole, 1 - HOVER_SHIFT);
}

/**
 * Фон кнопки при наведении, выведенный из её же обычного цвета.
 *
 * Правило: тёмный фон осветляем, светлый затемняем — на `HOVER_SHIFT`.
 *
 * Зачем выводить, если значения теперь лежат в `theme.json`. Это запасной путь
 * для схем, у которых своего наведения нет: схемы мерчанта, сохранённые ДО
 * 17.09 (у них поля наведения пустые — их и удалял коммит `9b1f685` в
 * конструкторе, вместо того чтобы наполнить), и любой цвет, который мерчант
 * выберет сам, не тронув поле наведения. Без вывода такая кнопка получала бы
 * `?? primaryBg`, то есть наведение, равное покою.
 *
 * ИСКЛЮЧЕНИЕ одно, и оно вынужденное. Направление ведёт фон НАВСТРЕЧУ тексту
 * (у кнопки текст контрастен фону), поэтому надпись слегка теряет контраст.
 * Обычно это незаметно — запас огромен (худший случай 7.12 при пороге 4.5).
 * Но у светло-розовой кнопки bloom с БЕЛЫМ текстом (контраст 3.08 уже в покое)
 * осветление роняет его до 2.65, а увести текст дальше некуда: он уже белый,
 * то есть в самом полюсе. Для такой кнопки — и только для неё — направление
 * переворачиваем: фон темнеет, и контраст надписи РАСТЁТ (3.08 → 3.91).
 * Замер 17.09: переворот срабатывает у 4 кнопок из 42, все — bloom.
 *
 * `text` не передан (цвет надписи неизвестен) — работает голое правило.
 */
export function deriveHoverTriple(
  base: string | null,
  text: string | null = null,
): string | null {
  const lum = relLuminance(base);
  if (lum === null || !base) return null;
  const pole = lum < 0.5 ? '255 255 255' : '0 0 0';
  const direct = towards(base, pole);
  if (!text || !direct) return direct;
  const crDirect = contrastRatio(text, direct);
  if (crDirect === null || crDirect >= READABLE_CR) return direct;
  // Надпись перестаёт читаться. Сперва надежда на сдвиг самого текста
  // (`deriveHoverText`) — он возможен, только если тексту есть куда двигаться.
  const directLum = relLuminance(direct);
  if (directLum === null) return direct;
  const textPole = directLum < 0.5 ? '255 255 255' : '0 0 0';
  if (normTriple(text) !== textPole) return direct;
  // Двигать нечего — переворачиваем фон.
  const flipped = towards(base, pole === '0 0 0' ? '255 255 255' : '0 0 0');
  const crFlipped = contrastRatio(text, flipped);
  return crFlipped !== null && crFlipped > crDirect ? flipped : direct;
}

/**
 * Цвет НАДПИСИ кнопки при наведении.
 *
 * Меняем его ТОЛЬКО когда иначе теряется читаемость: если на новом фоне
 * контраст остаётся ≥ 4.5, текст не трогаем вовсе — так ведут себя 40 кнопок
 * из 42. Где контраст падает ниже порога, отводим текст от фона тем же шагом
 * `HOVER_SHIFT`, пока не дотянем до 4.5 либо — если 4.5 недостижимо, потому
 * что кнопка и в покое была ниже порога (палитра bloom: розовая надпись на
 * белом, 3.08 и 2.43) — хотя бы до контраста покоя. Ухудшать нельзя.
 */
export function deriveHoverText(
  text: string | null,
  bgRest: string | null,
  bgHover: string | null,
): string | null {
  const crRest = contrastRatio(text, bgRest);
  const crHover = contrastRatio(text, bgHover);
  if (crRest === null || crHover === null || !text || !bgHover) return text;
  if (crHover >= READABLE_CR) return text;
  const target = Math.min(READABLE_CR, crRest);
  if (crHover >= target) return text;
  const hoverLum = relLuminance(bgHover);
  if (hoverLum === null) return text;
  const pole = hoverLum < 0.5 ? '255 255 255' : '0 0 0';
  let candidate = text;
  for (let step = 0; step < 8; step++) {
    const next = towards(candidate, pole);
    if (!next || next === candidate) break;
    candidate = next;
    const cr = contrastRatio(candidate, bgHover);
    if (cr !== null && cr >= target) return candidate;
  }
  return candidate;
}

/** «26  26   26» → «26 26 26». Для сверки токена темы с цветом мерчанта. */
function normTriple(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ');
  return /^\d{1,3} \d{1,3} \d{1,3}$/.test(t) ? t : null;
}

function hexToRgbTriple(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const hex = v.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return null;
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}
