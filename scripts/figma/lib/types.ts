/**
 * Figma REST API types (minimal shape we use in scripts).
 * Full types: https://www.figma.com/developers/api
 */

export interface FigmaFile {
  name: string;
  lastModified: string;
  version: string;
  document: FigmaNode;
  components: Record<string, unknown>;
  styles: Record<string, unknown>;
}

export interface FigmaBbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FigmaNode {
  id: string;
  name: string;
  type:
    | 'DOCUMENT'
    | 'CANVAS'
    | 'FRAME'
    | 'GROUP'
    | 'SECTION'
    | 'COMPONENT'
    | 'COMPONENT_SET'
    | 'INSTANCE'
    | 'TEXT'
    | 'RECTANGLE'
    | 'ELLIPSE'
    | 'VECTOR'
    | 'LINE'
    | 'POLYGON'
    | 'STAR'
    | 'BOOLEAN_OPERATION'
    | 'REGULAR_POLYGON';
  children?: FigmaNode[];
  absoluteBoundingBox?: FigmaBbox;
  characters?: string;
  style?: FigmaTypeStyle;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  effects?: FigmaEffect[];
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  componentProperties?: Record<string, { value: string; type: string }>;
  imageRef?: string;
  [key: string]: unknown;
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontPostScriptName?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  textCase?: string;
  textDecoration?: string;
}

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaPaint {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'IMAGE' | string;
  color?: FigmaColor;
  opacity?: number;
  imageRef?: string;
  visible?: boolean;
}

export interface FigmaEffect {
  type: 'INNER_SHADOW' | 'DROP_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  visible?: boolean;
  radius?: number;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  spread?: number;
}

export interface FigmaImagesResponse {
  err?: string;
  images: Record<string, string>;
}

export type Viewport = '1920' | '1280' | '375';

export type ThemeId = 'rose' | 'vanila' | 'satin' | 'bloom' | 'flux';

export const THEME_IDS: readonly ThemeId[] = ['rose', 'vanila', 'satin', 'bloom', 'flux'] as const;

/** Canonical block names — aligned with `packages/theme-base/blocks/`. */
export const BLOCK_WHITELIST = [
  'AccountLayout',
  'AuthModal',
  'CartDrawer',
  'CartSection',
  'CheckoutHeader',
  'CheckoutLayout',
  'CheckoutSection',
  'CollapsibleSection',
  'Collections',
  'ContactForm',
  'Footer',
  'Gallery',
  'Header',
  'Hero',
  'ImageWithText',
  'MainText',
  'MultiColumns',
  'MultiRows',
  'Newsletter',
  'PopularProducts',
  'Product',
  'PromoBanner',
  'Publications',
  'Slideshow',
  'Video',
] as const;

export type BlockName = (typeof BLOCK_WHITELIST)[number];

/** Inventory JSON shape — single source of truth for theme × block × viewport → Figma node. */
export interface FigmaInventory {
  fileKey: string;
  fileName: string;
  pulledAt: string;
  figmaUserHandle?: string;
  sharedComponents: {
    pageNodeId: string;
    pageName: string;
    components: Partial<Record<BlockName, InventoryEntry>>;
  };
  themes: Record<
    ThemeId,
    {
      pageNodeId: string;
      pageName: string;
      viewports: Viewport[];
      blocks: Partial<Record<BlockName, Partial<Record<Viewport, InventoryEntry>>>>;
      unmapped: UnmappedFrame[];
      missingBlocks: BlockName[];
      notes?: string;
    }
  >;
}

export interface InventoryEntry {
  nodeId: string;
  name: string;
  bbox?: { w: number; h: number };
  figmaLabel?: string;
}

export interface UnmappedFrame {
  nodeId: string;
  name: string;
  bbox: { w: number; h: number };
  reason:
    | 'no_whitelist_match'
    | 'viewport_unclear'
    | 'multiple_matches'
    | 'non_frame_node'
    | string;
}
