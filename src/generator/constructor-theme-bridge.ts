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
  cardBorder?: number;
  cardRadius: number;
  mediaRadius: number;
  productCardStyle?: "standard" | "card";
  productCardAlignment?: "left" | "center" | "right";
  colorSchemes: ConstructorColorScheme[];
}

/**
 * Font definitions matching constructor's FONT_DEFINITIONS structure.
 * Only the fields we need for the bridge.
 */
interface FontDef {
  name: string;
  cssFamily: string;
}

/**
 * Subset of FONT_DEFINITIONS — maps font key to CSS family string.
 * This is duplicated here to avoid importing from the constructor package.
 * If a font is not found, we use the key as-is with a sans-serif fallback.
 */
const FONT_FAMILIES: Record<string, FontDef> = {
  inter: { name: "Inter", cssFamily: '"Inter Variable", sans-serif' },
  manrope: { name: "Manrope", cssFamily: '"Manrope Variable", sans-serif' },
  roboto: { name: "Roboto", cssFamily: '"Roboto Variable", sans-serif' },
  "roboto-flex": { name: "Roboto Flex", cssFamily: '"Roboto Flex Variable", sans-serif' },
  "roboto-condensed": { name: "Roboto Condensed", cssFamily: '"Roboto Condensed Variable", sans-serif' },
  raleway: { name: "Raleway", cssFamily: '"Raleway Variable", sans-serif' },
  "open-sans": { name: "Open Sans", cssFamily: '"Open Sans Variable", sans-serif' },
  montserrat: { name: "Montserrat", cssFamily: '"Montserrat Variable", sans-serif' },
  nunito: { name: "Nunito", cssFamily: '"Nunito Variable", sans-serif' },
  "nunito-sans": { name: "Nunito Sans", cssFamily: '"Nunito Sans Variable", sans-serif' },
  "pt-sans": { name: "PT Sans", cssFamily: '"PT Sans", sans-serif' },
  "source-sans-3": { name: "Source Sans 3", cssFamily: '"Source Sans 3 Variable", sans-serif' },
  urbanist: { name: "Urbanist", cssFamily: '"Urbanist Variable", sans-serif' },
  barlow: { name: "Barlow", cssFamily: '"Barlow Variable", sans-serif' },
  "dm-sans": { name: "DM Sans", cssFamily: '"DM Sans Variable", sans-serif' },
  comfortaa: { name: "Comfortaa", cssFamily: '"Comfortaa Variable", sans-serif' },
  "playfair-display": { name: "Playfair Display", cssFamily: '"Playfair Display Variable", serif' },
  "cormorant-garamond": { name: "Cormorant Garamond", cssFamily: '"Cormorant Garamond Variable", serif' },
  "eb-garamond": { name: "EB Garamond", cssFamily: '"EB Garamond Variable", serif' },
  merriweather: { name: "Merriweather", cssFamily: '"Merriweather", serif' },
  lora: { name: "Lora", cssFamily: '"Lora Variable", serif' },
  "pt-serif": { name: "PT Serif", cssFamily: '"PT Serif", serif' },
  "space-grotesk": { name: "Space Grotesk", cssFamily: '"Space Grotesk Variable", sans-serif' },
  "josefin-sans": { name: "Josefin Sans", cssFamily: '"Josefin Sans Variable", sans-serif' },
  "caveat": { name: "Caveat", cssFamily: '"Caveat Variable", cursive' },
  "bad-script": { name: "Bad Script", cssFamily: '"Bad Script", cursive' },
};

function resolveFontFamily(fontKey: string): string {
  return FONT_FAMILIES[fontKey]?.cssFamily ?? `"${fontKey}", sans-serif`;
}

function resolveFontName(fontKey: string): string {
  return FONT_FAMILIES[fontKey]?.name ?? fontKey;
}

/**
 * Generate a Google Fonts URL for the given font keys.
 */
export function generateGoogleFontsUrl(
  headingFont: string,
  bodyFont: string,
): string {
  const fonts = new Set<string>();
  const headingName = resolveFontName(headingFont);
  const bodyName = resolveFontName(bodyFont);

  fonts.add(headingName);
  fonts.add(bodyName);

  const families = [...fonts]
    .map((name) => `family=${name.replace(/ /g, "+")}:wght@100..900`)
    .join("&");

  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
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

  // Spacing
  if (theme.sectionPadding !== undefined) {
    tokens["spacing-section"] = `${theme.sectionPadding}px`;
  }

  // Extract global colors from first color scheme (default scheme)
  const defaultScheme = theme.colorSchemes[0];
  if (defaultScheme) {
    tokens["color-primary"] = defaultScheme.primaryButton.background;
    tokens["color-background"] = defaultScheme.background;
    tokens["color-foreground"] = defaultScheme.text;
    tokens["color-button"] = defaultScheme.primaryButton.background;
    tokens["color-button-text"] = defaultScheme.primaryButton.text;
    tokens["color-secondary"] = defaultScheme.secondaryButton.background;
    tokens["color-muted"] = defaultScheme.text; // fallback
    tokens["color-border"] = defaultScheme.primaryButton.border ?? defaultScheme.text;
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
        "color-border": scheme.primaryButton.border ?? scheme.text,
      },
    }),
  );

  return {
    tokens,
    colorSchemes,
  };
}
