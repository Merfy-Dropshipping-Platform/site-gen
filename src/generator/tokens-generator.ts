/**
 * Tokens Generator — Merchant Settings → override.css
 *
 * Merges merchant settings with theme defaults and generates CSS with:
 * - :root CSS custom properties (design tokens)
 * - .color-scheme-N classes for color scheme variants
 * - Colors as RGB triplets for rgba() support
 */

/** A single color value — can be hex, rgb string, or pre-parsed RGB triplet */
export interface ColorValue {
  /** Display name for the color (e.g. "Primary", "Background") */
  name: string;
  /** Color value: "#ff5733", "rgb(255, 87, 51)", or already an RGB triplet "255 87 51" */
  value: string;
}

/** A named color scheme with multiple color slots */
export interface ColorScheme {
  /** Unique scheme identifier */
  id: string | number;
  /** Human-readable name */
  label?: string;
  /** Map of token name → color value */
  colors: Record<string, string>;
}

/** Merchant's custom settings that override theme defaults */
export interface MerchantSettings {
  /** Base design tokens as CSS custom property name → value */
  tokens?: Record<string, string>;
  /** Font family override */
  fontFamily?: string;
  /** Font size base (px) */
  fontSizeBase?: number;
  /** Border radius base (px) */
  borderRadius?: number;
  /** Color schemes */
  colorSchemes?: ColorScheme[];
  /** Additional raw CSS to append */
  customCss?: string;
}

/** Theme default values — same shape as MerchantSettings */
export type ThemeDefaults = MerchantSettings;

/**
 * Parse a color string into an RGB triplet "R G B" for use with rgba().
 *
 * Supports:
 * - Hex: #RGB, #RRGGBB, #RRGGBBAA
 * - rgb(R, G, B) / rgba(R, G, B, A)
 * - Already-triplet "R G B"
 *
 * Returns the original string if parsing fails.
 */
export function toRgbTriplet(color: string): string {
  const trimmed = color.trim();

  // Already an RGB triplet? (e.g. "255 87 51")
  if (/^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/.test(trimmed)) {
    return trimmed;
  }

  // Hex color
  const hexMatch = trimmed.match(
    /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
  );
  if (hexMatch) {
    let hex = hexMatch[1];
    // Expand shorthand (#RGB or #RGBA → #RRGGBB or #RRGGBBAA)
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `${r} ${g} ${b}`;
  }

  // rgb(R, G, B) or rgba(R, G, B, A)
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/,
  );
  if (rgbMatch) {
    return `${rgbMatch[1]} ${rgbMatch[2]} ${rgbMatch[3]}`;
  }

  // Can't parse — return as-is
  return trimmed;
}

/**
 * Merge merchant settings with theme defaults.
 * Merchant values take precedence over theme defaults.
 */
function mergeSettings(
  merchant: MerchantSettings,
  defaults: ThemeDefaults,
): MerchantSettings {
  return {
    tokens: { ...defaults.tokens, ...merchant.tokens },
    fontFamily: merchant.fontFamily ?? defaults.fontFamily,
    fontSizeBase: merchant.fontSizeBase ?? defaults.fontSizeBase,
    borderRadius: merchant.borderRadius ?? defaults.borderRadius,
    colorSchemes:
      merchant.colorSchemes && merchant.colorSchemes.length > 0
        ? merchant.colorSchemes
        : defaults.colorSchemes,
    customCss: [defaults.customCss, merchant.customCss]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Generate a CSS block with :root custom properties from merged tokens.
 */
function generateRootTokens(settings: MerchantSettings): string {
  const props: string[] = [];

  // Base tokens
  if (settings.tokens) {
    for (const [key, value] of Object.entries(settings.tokens)) {
      // Convert color-looking values to RGB triplets
      const isColor =
        key.includes("color") ||
        key.includes("bg") ||
        key.includes("background") ||
        key.includes("border") ||
        key.includes("text") ||
        key.includes("accent") ||
        key.includes("primary") ||
        key.includes("secondary");

      if (isColor && (value.startsWith("#") || value.startsWith("rgb"))) {
        props.push(`  --${key}: ${toRgbTriplet(value)};`);
      } else {
        props.push(`  --${key}: ${value};`);
      }
    }
  }

  // Font family
  if (settings.fontFamily) {
    props.push(`  --font-family: ${settings.fontFamily};`);
  }

  // Font size base
  if (settings.fontSizeBase) {
    props.push(`  --font-size-base: ${settings.fontSizeBase}px;`);
  }

  // Border radius
  if (settings.borderRadius !== undefined) {
    props.push(`  --border-radius: ${settings.borderRadius}px;`);
  }

  if (props.length === 0) return "";
  return `:root {\n${props.join("\n")}\n}`;
}

/**
 * Generate .color-scheme-N classes from color schemes.
 * Each color in the scheme is output as an RGB triplet for rgba() support.
 */
function generateColorSchemeClasses(schemes: ColorScheme[]): string {
  if (!schemes || schemes.length === 0) return "";

  return schemes
    .map((scheme) => {
      const id =
        typeof scheme.id === "number" ? scheme.id : scheme.id.toString();
      const props = Object.entries(scheme.colors)
        .map(([token, color]) => `  --${token}: ${toRgbTriplet(color)};`)
        .join("\n");
      const comment = scheme.label ? ` /* ${scheme.label} */` : "";
      return `.color-scheme-${id} {${comment}\n${props}\n}`;
    })
    .join("\n\n");
}

/**
 * Generate the complete override.css content.
 *
 * @param merchantSettings - Merchant-specific overrides
 * @param themeDefaults    - Theme default values (base layer)
 * @returns CSS string with :root overrides and .color-scheme-N classes
 */
export function generateTokensCss(
  merchantSettings: MerchantSettings,
  themeDefaults: ThemeDefaults = {},
): string {
  const merged = mergeSettings(merchantSettings, themeDefaults);

  const sections: string[] = [
    "/* Auto-generated by Merfy — do not edit manually */",
  ];

  // :root tokens
  const rootBlock = generateRootTokens(merged);
  if (rootBlock) {
    sections.push(rootBlock);
  }

  // Color scheme classes
  const schemeBlocks = generateColorSchemeClasses(merged.colorSchemes ?? []);
  if (schemeBlocks) {
    sections.push(schemeBlocks);
  }

  // Custom CSS appended at the end
  if (merged.customCss) {
    sections.push(`/* Custom CSS */\n${merged.customCss}`);
  }

  return sections.join("\n\n") + "\n";
}
