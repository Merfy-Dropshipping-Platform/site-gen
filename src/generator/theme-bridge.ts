/**
 * Theme Bridge — adapts packages/themes/ types to generator types.
 *
 * The themes library (packages/themes/types.ts) defines ComponentRegistryEntry
 * with fields like `island`, `islandDirective`, `astroTemplate`.
 *
 * The generator (page-generator.ts) expects ComponentRegistryEntry with
 * fields like `kind`, `clientDirective`, `importPath`.
 *
 * This bridge converts between the two, and also converts theme
 * settings schema entries to the MerchantSettings format used by
 * tokens-generator.ts.
 */

import type {
  ComponentRegistryEntry as GeneratorRegistryEntry,
  ClientDirective,
} from "./page-generator";
import type {
  MerchantSettings,
  ColorScheme as GeneratorColorScheme,
} from "./tokens-generator";

// Re-export the theme library types under a distinct name so tests can
// import them without depending on the themes package path.

/** Shape matching packages/themes/types ComponentRegistryEntry */
export interface ThemeRegistryEntry {
  name: string;
  label: string;
  category: string;
  puckConfig: Record<string, unknown>;
  astroTemplate: string;
  island?: boolean;
  islandDirective?: "load" | "visible" | "idle";
  schema: Record<string, unknown>;
  requiredFeatures?: string[];
  thumbnail?: string;
}

/** Shape matching packages/themes/lib/generateTokensCss SettingEntry */
export interface ThemeSettingEntry {
  id: string;
  type: "color" | "font" | "range" | "select" | "text" | "checkbox";
  label: string;
  default?: unknown;
  unit?: string;
  min?: number;
  max?: number;
  enum?: string[];
}

/** Shape matching packages/themes/lib/generateTokensCss SettingsGroup */
export interface ThemeSettingsGroup {
  name: string;
  settings: ThemeSettingEntry[];
}

/** Shape matching packages/themes/types ColorScheme */
export interface ThemeColorScheme {
  name: string;
  background: string;
  foreground: string;
  primary?: string;
  button?: string;
  buttonText?: string;
}

export type ThemeFeatures = Record<string, boolean>;

interface RegistryConversionOptions {
  /** Base path for component imports (default: "../components") */
  componentsBasePath?: string;
  /** Feature flags — if provided, filters components by requiredFeatures */
  features?: ThemeFeatures;
}

/**
 * Map a theme islandDirective to a full Astro client: directive string.
 */
function toClientDirective(
  directive?: "load" | "visible" | "idle",
): ClientDirective {
  switch (directive) {
    case "visible":
      return "client:visible";
    case "idle":
      return "client:idle";
    case "load":
    default:
      return "client:load";
  }
}

/**
 * Filter entries by required features.
 * Components without requiredFeatures are always included.
 * Components with requiredFeatures are included only if ALL features are true.
 */
function filterByFeatures(
  entries: ThemeRegistryEntry[],
  features: ThemeFeatures,
): ThemeRegistryEntry[] {
  return entries.filter((entry) => {
    const required = entry.requiredFeatures ?? [];
    if (required.length === 0) return true;
    return required.every((f) => features[f] === true);
  });
}

/**
 * Convert a theme library ComponentRegistryEntry[] to the generator's
 * Record<string, ComponentRegistryEntry> format.
 *
 * - Static components → kind: "static", importPath: "{base}/astro/{template}"
 * - Island components → kind: "island", importPath: "{base}/react/{name}", clientDirective
 *
 * @param themeEntries - Array of theme registry entries
 * @param options - Optional conversion configuration
 * @returns Generator-compatible registry keyed by component name
 */
export function themeRegistryToGeneratorRegistry(
  themeEntries: ThemeRegistryEntry[],
  options?: RegistryConversionOptions,
): Record<string, GeneratorRegistryEntry> {
  const basePath = options?.componentsBasePath ?? "../components";
  const features = options?.features;

  // Filter by features if provided
  const filtered = features
    ? filterByFeatures(themeEntries, features)
    : themeEntries;

  const registry: Record<string, GeneratorRegistryEntry> = {};

  for (const entry of filtered) {
    const isIsland = entry.island === true;

    let importPath: string;
    if (isIsland) {
      // React islands: import from react/ subdirectory without .astro extension
      importPath = `${basePath}/react/${entry.name}`;
    } else {
      // Astro static components: import from astro/ subdirectory
      const astroFile = entry.astroTemplate || `${entry.name}.astro`;
      importPath = `${basePath}/astro/${astroFile}`;
    }

    const genEntry: GeneratorRegistryEntry = {
      name: entry.name,
      kind: isIsland ? "island" : "static",
      importPath,
    };

    if (isIsland) {
      genEntry.clientDirective = toClientDirective(entry.islandDirective);
    }

    registry[entry.name] = genEntry;
  }

  return registry;
}

/**
 * Convert a setting ID to a CSS custom property-compatible key.
 * color_primary -> color-primary
 */
function settingIdToKey(id: string): string {
  return id.replace(/_/g, "-");
}

/**
 * Format a setting value based on its type.
 */
function formatSettingValue(
  setting: ThemeSettingEntry,
  value: unknown,
): string {
  const raw = value ?? setting.default;
  if (raw === undefined || raw === null) return "";

  switch (setting.type) {
    case "range": {
      const num = Number(raw);
      const unit = setting.unit ?? "";
      return `${num}${unit}`;
    }
    case "color":
    case "font":
    case "text":
    case "select":
    default:
      return String(raw);
  }
}

/**
 * Convert theme settings schema + merchant overrides to MerchantSettings.
 *
 * This allows the generator's tokens-generator to consume theme settings
 * without knowing about the themes library's format.
 *
 * @param settingsSchema - Settings groups from theme.json settings_schema
 * @param overrides - Merchant-provided setting values
 * @param colorSchemes - Optional color schemes from theme manifest
 * @returns MerchantSettings compatible with tokens-generator
 */
export function themeSettingsToMerchantSettings(
  settingsSchema: ThemeSettingsGroup[],
  overrides: Record<string, unknown>,
  colorSchemes?: ThemeColorScheme[],
): MerchantSettings {
  const tokens: Record<string, string> = {};

  for (const group of settingsSchema) {
    for (const setting of group.settings) {
      const value =
        setting.id in overrides ? overrides[setting.id] : undefined;
      const formatted = formatSettingValue(setting, value);
      if (formatted !== "") {
        tokens[settingIdToKey(setting.id)] = formatted;
      }
    }
  }

  // Convert theme color schemes to generator color schemes
  let generatorSchemes: GeneratorColorScheme[] | undefined;
  if (colorSchemes && colorSchemes.length > 0) {
    generatorSchemes = colorSchemes.map((scheme, index) => {
      const colors: Record<string, string> = {
        background: scheme.background,
        foreground: scheme.foreground,
      };
      if (scheme.primary) colors["primary"] = scheme.primary;
      if (scheme.button) colors["button"] = scheme.button;
      if (scheme.buttonText) colors["button-text"] = scheme.buttonText;

      return {
        id: index + 1,
        label: scheme.name,
        colors,
      };
    });
  }

  return {
    tokens,
    colorSchemes: generatorSchemes,
  };
}
