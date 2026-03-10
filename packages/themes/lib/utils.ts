/**
 * Utility functions for the @merfy/themes package.
 */

/**
 * Converts a hex color string to an RGB object.
 * Supports 3-digit (#fff) and 6-digit (#ffffff) hex, with or without hash prefix.
 * Returns null for invalid input.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
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

  return { r, g, b };
}

/**
 * Converts PascalCase to kebab-case.
 * e.g. "ProductGrid" -> "product-grid", "HeroBanner" -> "hero-banner"
 */
export function slugify(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Converts a slug (kebab-case) to Title Case.
 * e.g. "product-grid" -> "Product Grid", "hero-banner" -> "Hero Banner"
 */
export function capitalize(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Parses CLI arguments into a key-value record.
 * Supports: --key value, --flag (boolean true), --no-flag (boolean false)
 *
 * e.g. ["--name", "rose", "--island", "--no-cache"]
 * -> { name: "rose", island: true, cache: false }
 */
export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--no-')) {
      const key = arg.slice(5);
      result[key] = false;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];

      if (next === undefined || next.startsWith('--')) {
        result[key] = true;
      } else {
        result[key] = next;
        i++;
      }
    }
  }

  return result;
}
