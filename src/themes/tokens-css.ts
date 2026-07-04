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
import { resolveFontFamily } from '../generator/constructor-theme-bridge';

// Список tokens которые emit'ятся явно в rootRules (с merchant cascade).
// Catch-all iterator ниже пропускает их, чтобы не было дубликата.
const ROOT_RULES_EXPLICIT = new Set<string>([
  '--radius-button', '--radius-card', '--radius-input', '--radius-media', '--radius-field',
  '--font-heading', '--font-body', '--weight-body', '--weight-heading',
  '--section-padding', '--spacing-section-y', '--spacing-grid-col-gap', '--spacing-grid-row-gap',
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
  '--color-bottom-strip-bg', '--color-bottom-strip-text',
  '--promo-banner-h-thin',
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
  --font-heading: ${merchantFirst(headingFont, headingFontSet, themeDefaults['--font-heading'], 'system-ui')};
  --font-body: ${merchantFirst(bodyFont, bodyFontSet, themeDefaults['--font-body'], 'system-ui')};
  --weight-body: ${merchantFirst(String(bodyWeight), bodyWeightSet, themeDefaults['--weight-body'], '400')};
  --weight-heading: ${merchantFirst(String(headingWeight), headingWeightSet, themeDefaults['--weight-heading'], '400')};
  --section-padding: ${merchantFirst(sectionPadding, sectionPaddingSet, themeDefaults['--spacing-section-y'], '80px')};
  --spacing-section-y: ${merchantFirst(sectionPadding, sectionPaddingSet, themeDefaults['--spacing-section-y'], '80px')};
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
  --size-hero-heading: ${merchantFirst(heroHeadingSize, heroHeadingSizeSet, themeDefaults['--size-hero-heading'], '48px')};
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
      if (merged.muted === undefined) {
        const themeMuted = themeScheme.tokens?.['--color-muted'];
        if (themeMuted) {
          const [r, g, b] = themeMuted.trim().split(/\s+/).map((n) => parseInt(n, 10));
          if ([r, g, b].every((n) => !Number.isNaN(n))) {
            merged.muted = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
          }
        }
      }
      const rule = buildSchemeRule(merged);
      if (rule) {
        schemeRuleLines.push(rule);
      } else {
        schemeRuleLines.push(buildThemeSchemeRule(themeScheme));
      }
    } else {
      schemeRuleLines.push(buildThemeSchemeRule(themeScheme));
    }
    merchantById.delete(key);
  }
  for (const remaining of merchantById.values()) {
    const rule = buildSchemeRule(remaining);
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
  const defaultIdx =
    typeof s.defaultSchemeIndex === 'number' ? s.defaultSchemeIndex : 0;
  const defaultSchemeRaw = isPlainObject(schemes[defaultIdx])
    ? (schemes[defaultIdx] as Record<string, unknown>)
    : isPlainObject(schemes[0])
      ? (schemes[0] as Record<string, unknown>)
      : null;
  // :root несёт АКТИВНУЮ merchant-схему, но merchant-схемы не хранят accent/
  // muted (admin ThemeSettings их не редактирует — 096). Для `.color-scheme-N`
  // правил эти токены наследуются из theme manifest (inherit-ветка выше); тот
  // же inherit ОБЯЗАН применяться к :root, иначе секция БЕЗ scheme-обёртки
  // (preview одиночного блока без colorScheme prop — preview.service ~632; и
  // любой :root-контекст) берёт accent из BASE_DEFAULTS (17 17 17) → напр.
  // vanilla Slideshow контрол-бар `bg-[rgb(var(--color-accent,38_49_28))]`
  // рендерится чёрным вместо зелёного манифеста (58 69 48). На live scheme-
  // обёртка композитора это маскировала — баг проявляется только на :root.
  const defaultScheme = defaultSchemeRaw
    ? inheritSchemeAccentMuted(defaultSchemeRaw, themeSchemes)
    : null;
  const rootColorRules = defaultScheme ? schemeVarsInRoot(defaultScheme) : '';

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

  // «Жирность заголовка / текста» (Типографика) — оживление слайдеров. Порты тем
  // хардкодят font-weight по Figma (в т.ч. Tailwind `!font-normal` = !important),
  // поэтому одной эмиссии --weight-* было мало — слайдер не влиял. Инжектим
  // override ТОЛЬКО когда мерчант РЕАЛЬНО сдвинул слайдер (headingWeightSet /
  // bodyWeightSet); иначе правило пустое → дефолтный вид тем байт-в-байт сохранён
  // (default-preserving, как wishlistHideRule). Скоуп `main` — контент секций, НЕ
  // header/footer/nav-хром. `[class]`-квалификатор поднимает специфичность до
  // (0,1,2) > (0,1,0) у `!font-normal`, а !important перебивает !important-класс.
  // Заголовок — все h1..h6; текст — параграфы <p> (кнопки/бейджи это <a>/<button>,
  // не трогаем). Unlayered → перебивает @layer base { h*, p } из global.css тем.
  const weightHeadingRule = headingWeightSet
    ? 'main h1[class],main h2[class],main h3[class],main h4[class],main h5[class],main h6[class]{font-weight:var(--weight-heading) !important}'
    : '';
  const weightBodyRule = bodyWeightSet
    ? 'main p[class]{font-weight:var(--weight-body) !important}'
    : '';

  // «Шрифт заголовка / текста» (Типографика) — применение во ВСЕХ секциях. Часть
  // портов верстала заголовки секций/карточек через body-класс `font-manrope`
  // (`.font-manrope → var(--font-body)`) → эти заголовки следовали за «Шрифтом
  // ТЕКСТА», а не заголовка (эталон — PopularProducts, где заголовки на
  // --font-heading). Форсим роль по семантике тега: h1..h6 → --font-heading,
  // текст (p/li/button/label) → --font-body. Гейт на «мерчант задал шрифт»
  // (headingFontSet/bodyFontSet) → дефолтный вид тем сохранён байт-в-байт.
  // Специфичность (0,1,2)+!important перебивает `font-manrope`/литеральные классы.
  const fontHeadingRule = headingFontSet
    ? 'main h1[class],main h2[class],main h3[class],main h4[class],main h5[class],main h6[class],footer h1[class],footer h2[class],footer h3[class],footer h4[class],footer h5[class],footer h6[class]{font-family:var(--font-heading) !important}'
    : '';
  const fontBodyRule = bodyFontSet
    ? 'main p[class],main li[class],main button[class],main label[class]{font-family:var(--font-body) !important}'
    : '';

  return [
    rootRules,
    rootColorRules,
    schemeRules,
    wishlistHideRule,
    stickyFooterRule,
    weightHeadingRule,
    weightBodyRule,
    fontHeadingRule,
    fontBodyRule,
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
  // Resolve ALL 44 constructor font keys → proper CSS family via the shared
  // map (constructor-theme-bridge). Раньше здесь был локальный список из 5
  // шрифтов (comfortaa/manrope/inter/playfair/roboto), и любой другой ключ
  // (e.g. 'exo-2') отдавался как есть → font-family:"exo-2" (несуществующее
  // семейство) → браузер сваливался в фолбэк → шрифт мерчанта не применялся.
  return resolveFontFamily(v);
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

function schemeClassId(id: string): string {
  return id.replace(/^scheme-/, '');
}

function buildThemeSchemeRule(scheme: {
  id: string;
  tokens: Record<string, string>;
}): string {
  const pairs = Object.entries(scheme.tokens).map(([k, v]) => `${k}: ${v}`);
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

/**
 * Обогащает merchant-схему accent/muted из theme manifest по совпадающему id.
 * Merchant color-schemes (из ревизии) хранят только bg/heading/text/buttons —
 * accent/muted недоступны в admin ThemeSettings UI (096), поэтому приходят из
 * манифеста темы. Для `.color-scheme-N` правил inherit уже есть в buildTokensCss;
 * этот хелпер даёт тот же inherit активной :root-схеме (иначе :root accent/muted
 * падают в BASE_DEFAULTS — 17 17 17 / серый — и секции без scheme-обёртки красятся
 * generic-чёрным вместо цвета манифеста). No-op когда accent+muted уже заданы или
 * в манифесте нет схемы с таким id.
 */
function inheritSchemeAccentMuted(
  scheme: Record<string, unknown>,
  themeSchemes: { id: string; name: string; tokens: Record<string, string> }[],
): Record<string, unknown> {
  if (scheme.accent !== undefined && scheme.muted !== undefined) return scheme;
  const id = typeof scheme.id === 'string' ? schemeClassId(scheme.id) : '';
  if (!id) return scheme;
  const ts = themeSchemes.find((t) => schemeClassId(t.id) === id);
  if (!ts) return scheme;
  const shape = themeSchemeToMerchantShape(ts);
  return {
    ...scheme,
    accent: scheme.accent ?? shape.accent,
    muted: scheme.muted ?? shape.muted,
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
  const muted = hexToRgbTriple(scheme.muted);
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
