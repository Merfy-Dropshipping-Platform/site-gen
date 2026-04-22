import type { FigmaColor, FigmaNode, FigmaPaint, FigmaTypeStyle } from './types.js';

/**
 * Surface-level feature extraction from a Figma node.
 * Used for block coverage audit — NOT a full design-to-code engine.
 */

export interface BlockFeatures {
  nodeId: string;
  name: string;
  bbox: { w: number; h: number };
  layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'UNKNOWN';
  childCount: number;
  imageCount: number;
  textCount: number;
  ctaCount: number;
  formFieldCount: number;
  primaryFillHex?: string;
  primaryFontFamily?: string;
  typographyScale?: number[]; // unique fontSize values
  cornerRadii: number[]; // unique corner radii used inside
  columns?: number; // detected grid columns (heuristic)
  variantHints: string[]; // free-form tags inferred from structure
}

export function extractFeatures(node: FigmaNode): BlockFeatures {
  const bbox = node.absoluteBoundingBox ?? { width: 0, height: 0, x: 0, y: 0 };
  const feat: BlockFeatures = {
    nodeId: node.id,
    name: node.name,
    bbox: { w: Math.round(bbox.width), h: Math.round(bbox.height) },
    layoutMode: (node.layoutMode as BlockFeatures['layoutMode']) ?? 'UNKNOWN',
    childCount: node.children?.length ?? 0,
    imageCount: 0,
    textCount: 0,
    ctaCount: 0,
    formFieldCount: 0,
    cornerRadii: [],
    variantHints: [],
  };

  const cornerRadiiSet = new Set<number>();
  const fontSizesSet = new Set<number>();
  let firstHex: string | undefined;
  let firstFont: string | undefined;

  visit(node, (n, depth) => {
    if (depth === 0) return; // skip root

    const t = n.type;
    if (t === 'TEXT') {
      feat.textCount += 1;
      const style = n.style as FigmaTypeStyle | undefined;
      if (style?.fontFamily && !firstFont) firstFont = style.fontFamily;
      if (style?.fontSize) fontSizesSet.add(Math.round(style.fontSize));
      const chars = (n.characters ?? '').trim();
      const looksLikeCta =
        chars.length > 1 &&
        chars.length < 40 &&
        /(купить|подписаться|заказать|перейти|buy|shop|order|subscribe|submit|отправить|continue|далее|get started|start|learn|read)/i.test(
          chars,
        );
      if (looksLikeCta) feat.ctaCount += 1;
    }

    const fills = n.fills as FigmaPaint[] | undefined;
    if (fills && Array.isArray(fills)) {
      for (const fill of fills) {
        if (!fill.visible && fill.visible !== undefined) continue;
        if (fill.type === 'IMAGE') feat.imageCount += 1;
        if (fill.type === 'SOLID' && !firstHex && fill.color) {
          firstHex = colorToHex(fill.color);
        }
      }
    }

    if (typeof n.cornerRadius === 'number' && n.cornerRadius > 0) {
      cornerRadiiSet.add(n.cornerRadius);
    }
    if (Array.isArray(n.rectangleCornerRadii)) {
      for (const r of n.rectangleCornerRadii) {
        if (r > 0) cornerRadiiSet.add(r);
      }
    }

    if (n.name && /input|textfield|email|phone|text box|поле/i.test(n.name)) {
      feat.formFieldCount += 1;
    }

    return depth < 4; // limit descent
  });

  feat.primaryFillHex = firstHex;
  feat.primaryFontFamily = firstFont;
  feat.typographyScale = [...fontSizesSet].sort((a, b) => b - a);
  feat.cornerRadii = [...cornerRadiiSet].sort((a, b) => a - b);
  feat.columns = detectColumns(node);

  // Variant hints
  if (feat.imageCount >= 4) feat.variantHints.push('multi-image (grid/collage)');
  if (feat.columns && feat.columns >= 2) feat.variantHints.push(`grid-${feat.columns}col`);
  if (feat.formFieldCount >= 1) feat.variantHints.push('has-form');
  if ((feat.cornerRadii[feat.cornerRadii.length - 1] ?? 0) >= 60)
    feat.variantHints.push('pill (radius≥60)');
  if ((feat.cornerRadii[0] ?? 0) === 0 && feat.cornerRadii.length === 1)
    feat.variantHints.push('flat (radius=0)');

  return feat;
}

/** DFS with callback; callback returns false to stop descent. */
function visit(
  node: FigmaNode,
  cb: (n: FigmaNode, depth: number) => boolean | void,
  depth = 0,
) {
  const descend = cb(node, depth);
  if (descend === false) return;
  for (const child of node.children ?? []) visit(child, cb, depth + 1);
}

function colorToHex(c: FigmaColor): string {
  const to255 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${hex(to255(c.r))}${hex(to255(c.g))}${hex(to255(c.b))}`;
}

/**
 * Heuristic column counter.
 * If node has HORIZONTAL autolayout, children.length is roughly columns.
 * Otherwise measure children x-positions and group.
 */
function detectColumns(node: FigmaNode): number | undefined {
  const children = node.children ?? [];
  if (children.length < 2) return undefined;

  if (node.layoutMode === 'HORIZONTAL') return children.length;

  // Fallback: count distinct y-aligned children (rows) — skip
  return undefined;
}
