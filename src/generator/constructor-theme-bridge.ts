/**
 * Constructor Theme Bridge
 *
 * Converts the constructor's ThemeSettings (full object with colorSchemes[],
 * headingFont, bodyFont, buttonRadius, etc.) into MerchantSettings
 * compatible with tokens-generator.ts.
 *
 * This is different from themeSettingsToMerchantSettings() in theme-bridge.ts
 * which works with schema + overrides format. The constructor saves ThemeSettings
 * as a flat object, so we need a direct conversion path.
 */

import type {
  MerchantSettings,
  ColorScheme as GeneratorColorScheme,
} from "./tokens-generator";
import { toRgbTriplet } from "./tokens-generator";

/**
 * Shape matching the constructor's ThemeColorScheme
 * (from constructor/src/contexts/ThemeContext.tsx)
 */
interface ConstructorColorScheme {
  id: string;
  name: string;
  background: string;
  heading: string;
  text: string;
  primaryButton: {
    background: string;
    backgroundHover?: string;
    text: string;
    textHover?: string;
    border?: string;
  };
  secondaryButton: {
    background: string;
    backgroundHover?: string;
    text: string;
    textHover?: string;
    border?: string;
  };
}

/**
 * Shape matching the constructor's ThemeSettings
 * (from constructor/src/contexts/ThemeContext.tsx)
 */
export interface ConstructorThemeSettings {
  headingFont: string;
  headingWeight: number;
  bodyFont: string;
  bodyWeight: number;
  logoUrl?: string | null;
  logoWidth?: number;
  sectionPadding?: number;
  buttonRadius: number;
  inputRadius: number;
  /** Auth form field radius (separate from inputRadius for catalog inputs). Figma default: 4px */
  fieldRadius?: number;
  cardBorder?: number;
  cardRadius: number;
  mediaRadius: number;
  productCardStyle?: "standard" | "card";
  productCardAlignment?: "left" | "center" | "right";
  /** Semantic error color (auth forms, validation helpers). Default: #FCA5A5 (red-300). */
  errorColor?: string;
  colorSchemes: ConstructorColorScheme[];
  /** Index of the color scheme to use for :root defaults (0-based). Defaults to 0. */
  defaultSchemeIndex?: number;
}

/**
 * Font definitions matching constructor's FONT_DEFINITIONS structure.
 * Only the fields we need for the bridge.
 */
interface FontDef {
  name: string;
  cssFamily: string;
  /**
   * Доступные веса шрифта на Google Fonts (для css2 `wght@` списка). css2
   * ОТКЛОНЯЕТ запрос веса/диапазона, которого у шрифта нет (HTTP 400 → весь
   * `<link>` падает → шрифт не грузится). Раньше все URL слали `wght@100..900`,
   * что 400-ило почти все шрифты (Comfortaa 300..700, невариативные и т.п.).
   * Значения выверены против css2 API (все → 200). undefined → грузим только
   * дефолт (`family=Name` без wght), тоже валидно.
   */
  weights?: number[];
}

/**
 * Subset of FONT_DEFINITIONS — maps font key to CSS family string.
 * This is duplicated here to avoid importing from the constructor package.
 * If a font is not found, we use the key as-is with a sans-serif fallback.
 */
// FONT_FAMILIES → CSS font-family strings emitted into tokens.css.
// Google Fonts URL грузит шрифт по семейству (e.g. `family=Comfortaa:wght@100..900`),
// а не по варианту "<Family> Variable". Если использовать "Comfortaa Variable"
// в CSS — браузер не находит шрифт и сваливается в sans-serif fallback.
// Поэтому везде имя без " Variable".
// Полный набор шрифтов конструктора (FONT_DEFINITIONS, 44 шт.) + sites-only
// дефолты тем. `weights` выверены против css2 API. Раньше карта sites была
// неполной (~27 шрифтов конструктора отсутствовали) → resolveFontName возвращал
// сырой ключ (lowercase) → неверные CSS-имя и URL → шрифт не применялся.
const FONT_FAMILIES: Record<string, FontDef> = {
  inter: { name: "Inter", cssFamily: '"Inter", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  manrope: { name: "Manrope", cssFamily: '"Manrope", sans-serif', weights: [200, 300, 400, 500, 600, 700, 800] },
  roboto: { name: "Roboto", cssFamily: '"Roboto", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  "roboto-flex": { name: "Roboto Flex", cssFamily: '"Roboto Flex", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000] },
  "roboto-condensed": { name: "Roboto Condensed", cssFamily: '"Roboto Condensed", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  raleway: { name: "Raleway", cssFamily: '"Raleway", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  oswald: { name: "Oswald", cssFamily: '"Oswald", sans-serif', weights: [200, 300, 400, 500, 600, 700] },
  "open-sans": { name: "Open Sans", cssFamily: '"Open Sans", sans-serif', weights: [300, 400, 500, 600, 700, 800] },
  montserrat: { name: "Montserrat", cssFamily: '"Montserrat", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  merriweather: { name: "Merriweather", cssFamily: '"Merriweather", serif', weights: [300, 400, 700, 900] },
  lora: { name: "Lora", cssFamily: '"Lora", serif', weights: [400, 500, 600, 700] },
  exo: { name: "Exo", cssFamily: '"Exo", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  "exo-2": { name: "Exo 2", cssFamily: '"Exo 2", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  barlow: { name: "Barlow", cssFamily: '"Barlow", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  urbanist: { name: "Urbanist", cssFamily: '"Urbanist", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  comfortaa: { name: "Comfortaa", cssFamily: '"Comfortaa", sans-serif', weights: [300, 400, 500, 600, 700] },
  unbounded: { name: "Unbounded", cssFamily: '"Unbounded", sans-serif', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  "advent-pro": { name: "Advent Pro", cssFamily: '"Advent Pro", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  "alumni-sans": { name: "Alumni Sans", cssFamily: '"Alumni Sans", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  "news-cycle": { name: "News Cycle", cssFamily: '"News Cycle", sans-serif', weights: [400, 700] },
  bitter: { name: "Bitter", cssFamily: '"Bitter", serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  "cormorant-infant": { name: "Cormorant Infant", cssFamily: '"Cormorant Infant", serif', weights: [300, 400, 500, 600, 700] },
  cuprum: { name: "Cuprum", cssFamily: '"Cuprum", sans-serif', weights: [400, 500, 600, 700] },
  "ibm-plex-sans": { name: "IBM Plex Sans", cssFamily: '"IBM Plex Sans", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700] },
  onest: { name: "Onest", cssFamily: '"Onest", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  "pt-sans-narrow": { name: "PT Sans Narrow", cssFamily: '"PT Sans Narrow", sans-serif', weights: [400, 700] },
  "pt-serif": { name: "PT Serif", cssFamily: '"PT Serif", serif', weights: [400, 700] },
  tinos: { name: "Tinos", cssFamily: '"Tinos", serif', weights: [400, 700] },
  arsenal: { name: "Arsenal", cssFamily: '"Arsenal", sans-serif', weights: [400, 700] },
  tektur: { name: "Tektur", cssFamily: '"Tektur", sans-serif', weights: [400, 500, 600, 700, 800, 900] },
  "great-vibes": { name: "Great Vibes", cssFamily: '"Great Vibes", cursive', weights: [400] },
  "sofia-sans": { name: "Sofia Sans", cssFamily: '"Sofia Sans", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  "sofia-sans-condensed": { name: "Sofia Sans Condensed", cssFamily: '"Sofia Sans Condensed", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  "sofia-sans-extra-condensed": { name: "Sofia Sans Extra Condensed", cssFamily: '"Sofia Sans Extra Condensed", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  "ysabeau-infant": { name: "Ysabeau Infant", cssFamily: '"Ysabeau Infant", sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  oranienbaum: { name: "Oranienbaum", cssFamily: '"Oranienbaum", serif', weights: [400] },
  mulish: { name: "Mulish", cssFamily: '"Mulish", sans-serif', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  "viaoda-libre": { name: "Viaoda Libre", cssFamily: '"Viaoda Libre", serif', weights: [400] },
  "source-serif-4": { name: "Source Serif 4", cssFamily: '"Source Serif 4", serif', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  "playfair-display": { name: "Playfair Display", cssFamily: '"Playfair Display", serif', weights: [400, 500, 600, 700, 800, 900] },
  philosopher: { name: "Philosopher", cssFamily: '"Philosopher", sans-serif', weights: [400, 700] },
  andika: { name: "Andika", cssFamily: '"Andika", sans-serif', weights: [400, 700] },
  "tenor-sans": { name: "Tenor Sans", cssFamily: '"Tenor Sans", sans-serif', weights: [400] },
  ubuntu: { name: "Ubuntu", cssFamily: '"Ubuntu", sans-serif', weights: [300, 400, 500, 700] },
  "ubuntu-condensed": { name: "Ubuntu Condensed", cssFamily: '"Ubuntu Condensed", sans-serif', weights: [400] },
  caveat: { name: "Caveat", cssFamily: '"Caveat", cursive', weights: [400, 500, 600, 700] },
  bellota: { name: "Bellota", cssFamily: '"Bellota", sans-serif', weights: [300, 400, 700] },
  "yanone-kaffeesatz": { name: "Yanone Kaffeesatz", cssFamily: '"Yanone Kaffeesatz", sans-serif', weights: [200, 300, 400, 500, 600, 700] },
  assistant: { name: "Assistant", cssFamily: '"Assistant", sans-serif', weights: [200, 300, 400, 500, 600, 700, 800] },
  // sites-only (дефолты тем; не среди 44 конструктора). Веса не выверены →
  // undefined → грузим `family=Name` (дефолт 400, всегда валидно).
  nunito: { name: "Nunito", cssFamily: '"Nunito", sans-serif' },
  "nunito-sans": { name: "Nunito Sans", cssFamily: '"Nunito Sans", sans-serif' },
  "pt-sans": { name: "PT Sans", cssFamily: '"PT Sans", sans-serif' },
  "source-sans-3": { name: "Source Sans 3", cssFamily: '"Source Sans 3", sans-serif' },
  "dm-sans": { name: "DM Sans", cssFamily: '"DM Sans", sans-serif' },
  "cormorant-garamond": { name: "Cormorant Garamond", cssFamily: '"Cormorant Garamond", serif' },
  "eb-garamond": { name: "EB Garamond", cssFamily: '"EB Garamond", serif' },
  "space-grotesk": { name: "Space Grotesk", cssFamily: '"Space Grotesk", sans-serif' },
  "josefin-sans": { name: "Josefin Sans", cssFamily: '"Josefin Sans", sans-serif' },
  "bad-script": { name: "Bad Script", cssFamily: '"Bad Script", cursive' },
  "kelly-slab": { name: "Kelly Slab", cssFamily: '"Kelly Slab", serif' },
  involve: { name: "Involve", cssFamily: '"Involve", sans-serif' },
};

// Имя семейства → веса (для сборки css2 URL по извлечённому из CSS имени).
const WEIGHTS_BY_NAME: Record<string, number[]> = Object.fromEntries(
  Object.values(FONT_FAMILIES)
    .filter((f) => Array.isArray(f.weights) && f.weights.length > 0)
    .map((f) => [f.name, f.weights as number[]]),
);

/**
 * Собрать корректный Google Fonts css2 href для семейств по ИМЕНАМ. Для каждого
 * шрифта — реальные веса из WEIGHTS_BY_NAME (иначе `family=Name` без wght, тоже
 * 200). display=swap — чтобы выбранный шрифт реально применялся (optional не
 * подменял фолбэк при первой загрузке). Пустой ввод → пустая строка.
 */
export function googleFontsHref(names: string[]): string {
  const uniq = [...new Set(names.map((n) => (n ?? "").trim()).filter(Boolean))];
  if (uniq.length === 0) return "";
  const params = uniq
    .map((name) => {
      const fam = name.replace(/ /g, "+");
      const weights = WEIGHTS_BY_NAME[name];
      return weights && weights.length
        ? `family=${fam}:wght@${[...weights].sort((a, b) => a - b).join(";")}`
        : `family=${fam}`;
    })
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

export function resolveFontFamily(fontKey: string): string {
  return FONT_FAMILIES[fontKey]?.cssFamily ?? `"${fontKey}", sans-serif`;
}

/**
 * Parse a hex color (#RRGGBB) to [R, G, B].
 * Returns null if parsing fails.
 */
function parseHexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return null;
  return [
    parseInt(m[1].slice(0, 2), 16),
    parseInt(m[1].slice(2, 4), 16),
    parseInt(m[1].slice(4, 6), 16),
  ];
}

/**
 * Blend two hex colors: result = fg * ratio + bg * (1 - ratio).
 * Returns hex string "#RRGGBB".
 */
function blendColors(fg: string, bg: string, ratio: number): string {
  const fgRgb = parseHexToRgb(fg);
  const bgRgb = parseHexToRgb(bg);
  if (!fgRgb || !bgRgb) return "#999999"; // safe fallback gray
  const r = Math.round(fgRgb[0] * ratio + bgRgb[0] * (1 - ratio));
  const g = Math.round(fgRgb[1] * ratio + bgRgb[1] * (1 - ratio));
  const b = Math.round(fgRgb[2] * ratio + bgRgb[2] * (1 - ratio));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function resolveFontName(fontKey: string): string {
  return FONT_FAMILIES[fontKey]?.name ?? fontKey;
}

/**
 * Generate a Google Fonts URL for the given font keys. Реальные веса per-font +
 * display=swap через googleFontsHref (см. его комментарий — почему не 100..900).
 */
export function generateGoogleFontsUrl(
  headingFont: string,
  bodyFont: string,
): string {
  return googleFontsHref([resolveFontName(headingFont), resolveFontName(bodyFont)]);
}

/**
 * Convert constructor ThemeSettings → MerchantSettings for tokens-generator.
 */
export function constructorThemeToMerchantSettings(
  theme: ConstructorThemeSettings,
): MerchantSettings {
  const tokens: Record<string, string> = {};

  // Fonts
  tokens["font-heading"] = resolveFontFamily(theme.headingFont);
  tokens["font-body"] = resolveFontFamily(theme.bodyFont);

  // Radii
  tokens["radius-button"] = `${theme.buttonRadius}px`;
  tokens["radius-input"] = `${theme.inputRadius}px`;
  tokens["radius-card"] = `${theme.cardRadius}px`;
  tokens["radius-media"] = `${theme.mediaRadius}px`;
  tokens["radius-field"] = `${theme.fieldRadius ?? 4}px`;

  // Card style «Карточка» (productCardStyle=card): бордер (Обводка) + радиус +
  // внутренний отступ на карточке товара. standard → все 0px (нейтрально, ноль
  // регрессии). Выравнивание (align/justify) применяется в ОБОИХ стилях.
  // Консумит global.css по [data-nt="rose-product-card"] → SSR + client-рендеры.
  const cardStyled = theme.productCardStyle === "card";
  tokens["size-card-border"] = cardStyled ? `${theme.cardBorder ?? 0}px` : "0px";
  tokens["product-card-radius"] = cardStyled ? `${theme.cardRadius}px` : "0px";
  tokens["product-card-padding"] = cardStyled ? "12px" : "0px";
  const pcAlign = theme.productCardAlignment ?? "left";
  tokens["product-card-align"] = pcAlign;
  tokens["product-card-justify"] =
    pcAlign === "center" ? "center" : pcAlign === "right" ? "flex-end" : "flex-start";

  // Spacing
  if (theme.sectionPadding !== undefined) {
    tokens["spacing-section"] = `${theme.sectionPadding}px`;
  }

  // Extract global colors from the default color scheme (root :root values)
  const rootIdx = theme.defaultSchemeIndex ?? 0;
  const defaultScheme = theme.colorSchemes[rootIdx] ?? theme.colorSchemes[0];
  if (defaultScheme) {
    tokens["color-primary"] = defaultScheme.primaryButton.background;
    tokens["color-background"] = defaultScheme.background;
    tokens["color-foreground"] = defaultScheme.text;
    tokens["color-button"] = defaultScheme.primaryButton.background;
    tokens["color-button-text"] = defaultScheme.primaryButton.text;
    tokens["color-secondary"] = defaultScheme.secondaryButton.background;
    // Muted = 40% foreground blended on background (always readable)
    tokens["color-muted"] = blendColors(defaultScheme.text, defaultScheme.background, 0.4);
    // Border = 20% foreground blended on background (subtle but visible)
    tokens["color-border"] = defaultScheme.primaryButton.border
      ?? blendColors(defaultScheme.text, defaultScheme.background, 0.2);

    // Semantic tokens for auth / forms
    tokens["color-text-muted"] = blendColors(defaultScheme.text, defaultScheme.background, 0.4);
    tokens["color-border-active"] = defaultScheme.text;
    const errorColor = theme.errorColor ?? "#FCA5A5"; // red-300
    tokens["color-border-error"] = errorColor;
    tokens["color-error"] = errorColor;
    tokens["color-surface-muted"] = blendColors(defaultScheme.text, defaultScheme.background, 0.05);
  }

  // Convert color schemes — keys MUST match CSS var names (with "color-" prefix)
  const colorSchemes: GeneratorColorScheme[] = theme.colorSchemes.map(
    (scheme, index) => ({
      id: index + 1,
      label: scheme.name,
      colors: {
        "color-background": scheme.background,
        "color-foreground": scheme.text,
        "color-heading": scheme.heading,
        "color-primary": scheme.primaryButton.background,
        "color-button": scheme.primaryButton.background,
        "color-button-text": scheme.primaryButton.text,
        "color-button-hover": scheme.primaryButton.backgroundHover ?? scheme.primaryButton.background,
        "color-secondary": scheme.secondaryButton.background,
        "color-secondary-button-text": scheme.secondaryButton.text,
        "color-muted": blendColors(scheme.text, scheme.background, 0.4),
        "color-border": scheme.primaryButton.border
          ?? blendColors(scheme.text, scheme.background, 0.2),
      },
    }),
  );

  return {
    tokens,
    colorSchemes,
  };
}
