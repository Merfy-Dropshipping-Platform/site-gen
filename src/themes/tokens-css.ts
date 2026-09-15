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
  const s = themeSettings as { headingFont?: unknown; bodyFont?: unknown } | null;
  const hf = typeof s?.headingFont === 'string' ? s.headingFont : '';
  const bf = typeof s?.bodyFont === 'string' ? s.bodyFont : '';
  if (!hf && !bf) return css;
  const url = generateGoogleFontsUrl(hf, bf);
  return url ? `@import url("${url}");\n${css}` : css;
}


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
      // ── Поверхность правой колонки чекаута ───────────────────────────
      // Считается ВСЕГДА, для каждой схемы — см. `checkoutSurfaceOf`.
      merged.checkoutSurface = checkoutSurfaceOf(themeScheme.tokens, merged);
      // ── Рамка поля формы ─────────────────────────────────────────────
      // Тоже для КАЖДОЙ схемы — см. `inputBorderOf`. Подложка берётся из фона
      // ЭТОЙ схемы (мерчантский, если он его перекрасил).
      merged.inputBorder = inputBorderOf(
        themeInputBorder,
        themeInputBg,
        hexToRgbTriple(merged.background) ?? normTriple(themeScheme.tokens?.['--color-bg']),
      );
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
    // Схема, которой в манифесте темы нет вовсе (мерчант добавил свою). Близнеца
    // для сверки не существует — поверхность берём из самой схемы мерчанта.
    const rule = buildSchemeRule({
      ...remaining,
      checkoutSurface: checkoutSurfaceOf(undefined, remaining),
      inputBorder: inputBorderOf(
        themeInputBorder,
        themeInputBg,
        hexToRgbTriple(remaining.background) ?? normTriple(remaining.background),
      ),
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
  const weightHeadingRule = headingWeightSet
    ? 'main h1[class],main h2[class],main h3[class],main h4[class],main h5[class],main h6[class],footer h1[class],footer h2[class],footer h3[class],footer h4[class],footer h5[class],footer h6[class]{font-weight:var(--weight-heading) !important}'
    : '';
  const weightBodyRule = bodyWeightSet
    ? 'main p[class],main li[class],main button[class],main label[class]{font-weight:var(--weight-body) !important}'
    : '';
  const fontHeadingRule = headingFontSet
    ? 'main h1[class],main h2[class],main h3[class],main h4[class],main h5[class],main h6[class],footer h1[class],footer h2[class],footer h3[class],footer h4[class],footer h5[class],footer h6[class]{font-family:var(--font-heading) !important}'
    : '';
  const fontBodyRule = bodyFontSet
    ? 'main p[class],main li[class],main button[class],main label[class]{font-family:var(--font-body) !important}'
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
    productCardSchemeRule,
    cartDrawerSchemeRule,
    wishlistHideRule,
    stickyFooterRule,
    accountSurfaceRule,
    // Поверхность контентной страницы («Страница») = вся высота между шапкой
    // и подвалом. Продолжает ту же цепочку sticky-footer, что и поверхность
    // аккаунта. Разбор, замеры «до/после» и причинность — у CONTENT_SURFACE_CSS.
    CONTENT_SURFACE_CSS,
    sectionGapRule,
    typographyLayer,
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
 * ПОЧЕМУ НЕЛЬЗЯ ПРОСТО УБРАТЬ. Фон поля — `--color-input-bg`, сегодня во всех
 * пяти темах это белый `255 255 255`. Считаем контраст «поле ↔ подложка схемы»
 * по всей матрице 21 связки: он ниже 1.2 в ТРИНАДЦАТИ связках (rose 1/2/3/5,
 * vanilla 3/4, bloom 3/4, satin 1/2/3, flux 2/3) — там белое поле лежит на
 * белой или почти белой подложке, и рамка ЕДИНСТВЕННОЕ, что его очерчивает.
 * Снять её значит потерять поля на 13 экранах из 21.
 *
 * ПРАВИЛО. Рамка нужна ровно тогда, когда поле само по себе не читается:
 *   контраст(поле, подложка) < 1.5 → рамка темы, как была (13 заводских связок
 *       остаются байт в байт);
 *   иначе                          → рамка цвета САМОГО ПОЛЯ, то есть её не
 *       видно: поле уже очерчено собственным фоном.
 * Порог 1.5 взят из данных, а не с потолка: «нужные» связки лежат в 1.00–1.16,
 * «ненужные» начинаются с 1.96 (случай жалобы) и 2.43 (bloom scheme-2) — запас
 * с обеих сторон 0.34 и 0.46. Геометрия не меняется: рамка остаётся 1px,
 * меняется только её цвет.
 */
function inputBorderOf(
  themeBorder: string | null,
  inputBg: string | null,
  schemeBg: string | null,
): string | null {
  if (!themeBorder) return null;
  const field = normTriple(inputBg);
  const back = normTriple(schemeBg);
  if (!field || !back) return themeBorder;
  return contrastRatio(field, back) >= INPUT_BORDER_VISIBLE_AT ? field.trim() : themeBorder;
}

/** Порог «поле читается само» — см. разбор в `inputBorderOf`. */
const INPUT_BORDER_VISIBLE_AT = 1.5;

/** WCAG-контраст двух триплетов «r g b». */
function contrastRatio(a: string, b: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = (v: string) => {
    const [r, g, bl] = v.trim().split(/\s+/).map(Number);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  };
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * ПОВЕРХНОСТЬ ПРАВОЙ КОЛОНКИ ЧЕКАУТА для ОДНОЙ схемы. Тотальная функция: у любой
 * схемы любой темы ответ есть всегда, «промолчать» она не умеет.
 *
 * Зачем тотальная. Предыдущая редакция считала токен ТОЛЬКО когда мерчант
 * перекрасил «Фон», а его поверхность задана и равна заводской:
 *
 *     surfaceUntouched = merchantSurface !== null && merchantSurface === themeSurface
 *
 * «Поверхность задана» — это поле `surfaceBg`, которого в редакторе схем нет и не
 * будет (состав настроек — канон). В сидах магазинов оно есть только у rose и
 * satin: `src/generator/templates/defaults/{vanilla,bloom,flux}.json` несут схемы
 * БЕЗ него. Для трёх тем из пяти «поля нет» — единственно возможное состояние, и
 * условие молча выключалось: токен не появлялся никогда. Хуже того, без
 * `surfaceBg` правило `.color-scheme-N` вообще не объявляло `--color-surface`
 * (`schemeToVars` печатает его только при заданном поле), и правая колонка
 * садилась на унаследованное значение, одинаковое для ВСЕХ схем.
 *
 * Замер на сидовых данных (Chromium 1440×1400, мишень — две схемы с максимально
 * разной заводской поверхностью): vanilla 250,250,250 → 250,250,250;
 * bloom 246,246,247 → 246,246,247 (инлайновый набор из
 * `themes/bloom/src/pages/checkout.astro`); flux 250,250,250 → 250,250,250.
 * Те же числа тестер снял на живых стендах — замер сошёлся.
 *
 * Порядок ответов (первый подошедший выигрывает):
 *   1. мерчант ОСОЗНАННО задал свою поверхность (в редакторе поля нет, но в
 *      данных магазина она встречается — например тёмный сайдбар корзины) —
 *      уважаем её и не перебиваем «Фоном»;
 *   2. мерчант перекрасил «Фон» схемы — поверхность идёт за ним (п.4 владельца
 *      14.09: «при измении их не принимает новые условия»);
 *   3. схему не трогали — ЗАВОДСКАЯ поверхность ИМЕННО ЭТОЙ схемы из манифеста.
 *      Это и чинит vanilla/bloom/flux: раньше на её месте было унаследованное
 *      значение, не зависящее от схемы.
 *
 * Почему отдельный токен, а не `--color-surface`: на последнем висят карточки
 * товара, плитки коллекций и прочие поверхности витрины — их никто менять не
 * просил. `--color-checkout-surface` читает ровно одно правило
 * (`checkout-split.ts`, `[data-checkout-pane="summary"]`).
 */
function checkoutSurfaceOf(
  themeTokens: Record<string, string> | undefined,
  merchant: Record<string, unknown> | null | undefined,
): string | null {
  const themeSurface = normTriple(themeTokens?.['--color-surface']);
  const themeBg = normTriple(themeTokens?.['--color-bg']);
  const merchantSurface =
    hexToRgbTriple(merchant?.surfaceBg) ?? normTriple(merchant?.surfaceBg);
  const merchantBg =
    hexToRgbTriple(merchant?.background) ?? normTriple(merchant?.background);
  if (merchantSurface !== null && merchantSurface !== themeSurface)
    return merchantSurface;
  if (merchantBg !== null && themeBg !== null && merchantBg !== themeBg)
    return merchantBg;
  return themeSurface ?? merchantSurface ?? merchantBg;
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
  // Схема, которую мерчант не переопределял. Поверхность чекаута — заводская,
  // но объявить её надо ЯВНО: инвариант «каждое правило `.color-scheme-N` несёт
  // `--color-checkout-surface`» должен держаться на обеих ветках, иначе колонка
  // снова начнёт брать унаследованное значение там, где ветки разошлись.
  const checkoutSurface = checkoutSurfaceOf(scheme.tokens, null);
  if (checkoutSurface) tokens['--color-checkout-surface'] = checkoutSurface;
  // Рамка поля — тот же инвариант «объявлена у каждой схемы», что и поверхность.
  // Опоры темы приходят параметром: `buildThemeSchemeRule` манифеста не видит.
  const inputBorder = inputBorderOf(
    inputAnchors?.border ?? null,
    inputAnchors?.bg ?? null,
    normTriple(scheme.tokens?.['--color-bg']),
  );
  if (inputBorder) tokens['--color-input-border'] = inputBorder;
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
    primaryButton: {
      background: rgbTripleToHex(t['--color-button-bg']),
      text: rgbTripleToHex(t['--color-button-text']),
      border: rgbTripleToHex(t['--color-button-border']),
    },
    secondaryButton: {
      background: rgbTripleToHex(t['--color-button-2-bg']),
      text: rgbTripleToHex(t['--color-button-2-text']),
      border: rgbTripleToHex(t['--color-button-2-border']),
    },
  };
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
  // Поверхность правой колонки чекаута — её считает `checkoutSurfaceOf` (см.
  // подробный разбор там же). Токен объявлен у КАЖДОЙ схемы: пока он появлялся
  // выборочно, колонка у vanilla/bloom/flux садилась на унаследованное значение
  // и на смену схемы не реагировала вовсе.
  // Значение приходит из `checkoutSurfaceOf` уже триплетом («245 245 245»), но
  // шестнадцатеричную запись тоже принимаем — в ревизиях магазинов цвета лежат
  // в hex, и схема мерчанта может прийти сюда напрямую.
  const checkoutSurface =
    hexToRgbTriple(scheme.checkoutSurface) ?? normTriple(scheme.checkoutSurface);
  if (checkoutSurface) parts.push(`--color-checkout-surface: ${checkoutSurface}`);
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
  // Hover variants — fallback на non-hover если backgroundHover/textHover не задан.
  const primaryBgHover = hexToRgbTriple(primary.backgroundHover) ?? primaryBg;
  const primaryTextHover = hexToRgbTriple(primary.textHover) ?? primaryText;
  if (primaryBgHover) parts.push(`--color-button-bg-hover: ${primaryBgHover}`);
  if (primaryTextHover) parts.push(`--color-button-text-hover: ${primaryTextHover}`);
  const secondaryBg = hexToRgbTriple(secondary.background);
  const secondaryText = hexToRgbTriple(secondary.text);
  const secondaryBorder = hexToRgbTriple(secondary.border);
  if (secondaryBg) parts.push(`--color-button-secondary-bg: ${secondaryBg}`);
  if (secondaryText) parts.push(`--color-button-secondary-text: ${secondaryText}`);
  if (secondaryBorder) parts.push(`--color-button-secondary-border: ${secondaryBorder}`);
  const secondaryBgHover = hexToRgbTriple(secondary.backgroundHover) ?? secondaryBg;
  const secondaryTextHover = hexToRgbTriple(secondary.textHover) ?? secondaryText;
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
