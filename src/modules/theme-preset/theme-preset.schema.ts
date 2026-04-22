import { z } from 'zod';

/**
 * Theme Preset — data-shaped "theme" (vs code-shaped package).
 * Stored in `theme` table (extended in migration 0013) and seeded from
 * `seed/theme-presets/<id>.json` committed files.
 *
 * Shape parity with `packages/theme-contract/ThemeManifestSchema` where sensible;
 * additional `content` + `fontsPreload` fields are preset-specific.
 */

const DesignTokenValue = z.record(z.string(), z.any());

export const ThemePresetSchema = z.object({
  /** kebab-case id — matches `packages/theme-<id>/` folder name. */
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, 'id must be kebab-case (a-z, 0-9, hyphens)'),
  /** preset schema version. Bump on breaking changes. */
  presetVersion: z.literal(1).default(1),
  /** Display name. */
  name: z.string().min(1),
  /** kebab-case slug (admin URLs). */
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  /** Short description for admin theme gallery. */
  description: z.string().optional(),
  /** Preview image URL (MinIO or static). Use landscape 16:9 or similar. */
  previewDesktop: z.string().optional(),
  previewMobile: z.string().optional(),
  /** `templateId` from the existing theme system — e.g. "rose-1.0". Used by
   *  the build pipeline to resolve per-theme packages/overrides. */
  templateId: z.string().min(1),
  /** Pricing (kopecks). 0 = free. */
  price: z.number().int().min(0).default(0),
  /** Search/filter tags. */
  tags: z.array(z.string()).default([]),
  /** Optional marketing badge ("new", "popular"). */
  badge: z.string().optional(),
  /** Design tokens — W3C shape, merged with theme-base defaults at render time. */
  tokens: DesignTokenValue,
  /** Default Puck content — copied into `site_revision.data` on apply. */
  content: z.record(z.string(), z.any()),
  /** Google Fonts families to preload in storefront `<head>`. */
  fontsPreload: z.array(z.string()).default([]),
  /** Author handle — typically "merfy" for seed presets. */
  author: z.string().default('merfy'),
  /** When present, preset is hidden from tenant-facing list but still applicable
   *  by API. Useful for deprecated/test presets. */
  isActive: z.boolean().default(true),
});

export type ThemePreset = z.infer<typeof ThemePresetSchema>;

/** Shape returned by list endpoint (omits large `content` + `tokens`). */
export const ThemePresetSummarySchema = ThemePresetSchema.pick({
  id: true,
  name: true,
  slug: true,
  description: true,
  previewDesktop: true,
  previewMobile: true,
  templateId: true,
  price: true,
  tags: true,
  badge: true,
  author: true,
  isActive: true,
  fontsPreload: true,
});

export type ThemePresetSummary = z.infer<typeof ThemePresetSummarySchema>;

/** Applied theme result for API response. */
export const ApplyThemeResultSchema = z.object({
  success: z.boolean(),
  siteId: z.string(),
  themeId: z.string(),
  newRevisionId: z.string().optional(),
  warnings: z.array(z.string()).default([]),
});

export type ApplyThemeResult = z.infer<typeof ApplyThemeResultSchema>;
