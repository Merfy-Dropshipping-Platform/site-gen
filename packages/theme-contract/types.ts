/** JSON Schema property definition for component props */
export interface PropDefinition {
  type: "string" | "number" | "boolean" | "enum" | "color" | "image" | "richtext" | "slot";
  label?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  required?: boolean;
}

/** Component category in the constructor */
export type ComponentCategory = "layout" | "hero" | "products" | "content" | "navigation";

/** Astro island hydration directive */
export type IslandDirective = "load" | "visible" | "idle";

/** Entry in the component registry linking Puck, Astro, and React */
export interface ComponentRegistryEntry {
  name: string;
  label: string;
  category: ComponentCategory;
  puckConfig: Record<string, unknown>;
  astroTemplate: string;
  island?: boolean;
  islandDirective?: IslandDirective;
  schema: Record<string, PropDefinition>;
  requiredFeatures?: string[];
  thumbnail?: string;
}

/** Theme feature flags — controls which components are available */
export type ThemeFeatures = Record<string, boolean>;

/** Color scheme definition */
export interface ColorScheme {
  name: string;
  background: string;
  foreground: string;
  primary?: string;
  button?: string;
  buttonText?: string;
}

/** Theme manifest (theme.json) */
export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  features: ThemeFeatures;
  settings?: {
    fonts?: string[];
    colorSchemes?: ColorScheme[];
  };
  pages?: string[];
}

/** Theme export contract — what a theme must provide to the platform */
export interface ThemeExport {
  manifest: ThemeManifest;
  registry: ComponentRegistryEntry[];
  tokens: string;
  layouts: Record<string, () => Promise<unknown>>;
  pages: Record<string, () => Promise<unknown>>;
}

// ──────────── Block Contract types ────────────

import type { z as Zod } from 'zod';

export type BlockCategory = 'hero' | 'products' | 'content' | 'layout' | 'navigation' | 'media' | 'form';

export interface BlockConstraints {
  padding?: { min: number; max: number; step: number };
  maxInstances?: number | null;
  [key: string]: unknown;
}

/** Puck field definition (loose shape, Puck-specific validation at runtime). */
export interface PuckFieldDef {
  type: string;
  label?: string;
  [key: string]: unknown;
}

export interface BlockPuckConfig<Props> {
  label: string;
  category: BlockCategory;
  fields: Record<keyof Props & string, PuckFieldDef>;
  defaults: Props;
  schema: Zod.ZodSchema<Props>;
  requiredFeatures?: string[];
  maxInstances?: number | null;
  constraints?: BlockConstraints;
}

/** CSS-variable whitelist for a block. Must be `as const satisfies readonly` at call site. */
export type BlockTokens = readonly `--${string}`[];

/** Tailwind class strings, keyed object. Shared between .astro and any renderer. */
export type BlockClasses = Readonly<Record<string, string | Readonly<Record<string, string>>>>;

/** Layout variant declarations — visual treatment at same props. */
export type BlockVariants = Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>;

/** Data migrations when this block is active in a theme and user migrates FROM another theme. */
export interface BlockMigrations<Props> {
  /** Keyed by source theme id ("rose", "base", "*" = any). Values map source fields → target field names. */
  from: Record<string, Partial<Record<keyof Props & string, string>>>;
}
