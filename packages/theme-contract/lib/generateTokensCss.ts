import type { ColorScheme } from '../types.js';

/** A single setting entry from the settings_schema */
export interface SettingEntry {
  id: string;
  type: 'color' | 'font' | 'range' | 'select' | 'text' | 'checkbox';
  label: string;
  default?: unknown;
  unit?: string;
  min?: number;
  max?: number;
  enum?: string[];
}

/** A group of settings from settings_schema */
export interface SettingsGroup {
  name: string;
  settings: SettingEntry[];
}

/**
 * Converts a hex color string to an RGB triplet string.
 * Supports 3-digit (#fff) and 6-digit (#ffffff) hex, with or without hash prefix.
 * Returns null for invalid input.
 */
export function hexToRgb(hex: string): string | null {
  if (!hex) return null;

  // Remove hash if present
  let cleaned = hex.replace(/^#/, '');

  // Expand 3-digit shorthand to 6-digit
  if (cleaned.length === 3) {
    cleaned = cleaned[0] + cleaned[0] + cleaned[1] + cleaned[1] + cleaned[2] + cleaned[2];
  }

  if (cleaned.length !== 6) return null;

  // Validate hex characters
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;

  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);

  return `${r}, ${g}, ${b}`;
}

/**
 * Maps a setting ID to a CSS custom property name.
 * color_primary -> --color-primary
 * font_heading -> --font-heading
 * page_width -> --page-width
 * radius_base -> --radius-base
 */
function settingIdToProperty(id: string): string {
  return '--' + id.replace(/_/g, '-');
}

/**
 * Generates a CSS custom property value for a setting.
 */
function formatSettingValue(
  setting: SettingEntry,
  value: unknown,
): { property: string; value: string; extra?: { property: string; value: string } } {
  const prop = settingIdToProperty(setting.id);
  const raw = value ?? setting.default;

  switch (setting.type) {
    case 'color': {
      const colorStr = String(raw ?? '#000000');
      const rgb = hexToRgb(colorStr);
      const rgbValue = rgb ?? '0, 0, 0';
      return {
        property: prop,
        value: colorStr,
        extra: {
          property: prop + '-rgb',
          value: rgbValue,
        },
      };
    }
    case 'font': {
      return {
        property: prop,
        value: `'${String(raw ?? 'sans-serif')}'`,
      };
    }
    case 'range': {
      const num = Number(raw ?? 0);
      const unit = setting.unit ?? '';
      return {
        property: prop,
        value: `${num}${unit}`,
      };
    }
    default: {
      return {
        property: prop,
        value: String(raw ?? ''),
      };
    }
  }
}

/**
 * Generates CSS custom properties from theme settings_schema and merchant overrides.
 *
 * @param settingsSchema - Array of settings groups from theme.json settings_schema
 * @param overrides - Merchant-provided setting values (keyed by setting ID)
 * @param colorSchemes - Optional array of color scheme definitions
 * @returns CSS string with :root variables and .color-scheme-N classes
 */
export function generateTokensCss(
  settingsSchema: SettingsGroup[],
  overrides: Record<string, unknown>,
  colorSchemes?: ColorScheme[],
): string {
  const lines: string[] = [':root {'];

  // Process all settings groups
  for (const group of settingsSchema) {
    for (const setting of group.settings) {
      const value = setting.id in overrides ? overrides[setting.id] : undefined;
      const formatted = formatSettingValue(setting, value);

      lines.push(`  ${formatted.property}: ${formatted.value};`);
      if (formatted.extra) {
        lines.push(`  ${formatted.extra.property}: ${formatted.extra.value};`);
      }
    }
  }

  lines.push('}');

  // Generate color scheme classes
  if (colorSchemes && colorSchemes.length > 0) {
    for (let i = 0; i < colorSchemes.length; i++) {
      const scheme = colorSchemes[i];
      const className = `.color-scheme-${i + 1}`;

      lines.push('');
      lines.push(`${className} {`);

      // Background
      const bgRgb = hexToRgb(scheme.background);
      if (bgRgb) {
        lines.push(`  --color-background: ${bgRgb};`);
      }

      // Foreground
      const fgRgb = hexToRgb(scheme.foreground);
      if (fgRgb) {
        lines.push(`  --color-foreground: ${fgRgb};`);
      }

      // Button (optional)
      if (scheme.button) {
        const btnRgb = hexToRgb(scheme.button);
        if (btnRgb) {
          lines.push(`  --color-button: ${btnRgb};`);
        }
      }

      // Button Text (optional)
      if (scheme.buttonText) {
        const btnTextRgb = hexToRgb(scheme.buttonText);
        if (btnTextRgb) {
          lines.push(`  --color-button-text: ${btnTextRgb};`);
        }
      }

      // Primary (optional)
      if (scheme.primary) {
        const primaryRgb = hexToRgb(scheme.primary);
        if (primaryRgb) {
          lines.push(`  --color-primary: ${primaryRgb};`);
        }
      }

      lines.push('}');
    }
  }

  return lines.join('\n');
}
