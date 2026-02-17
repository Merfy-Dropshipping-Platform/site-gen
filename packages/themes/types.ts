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
