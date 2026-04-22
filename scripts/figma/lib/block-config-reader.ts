import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { BlockName } from './types.js';

/**
 * Read block's puckConfig.ts (+ classes.ts) without TS compiler reflection — use regex on source.
 * Good enough for surface-level audit (variants, prop names, token usage). Not a full AST parse.
 */
export interface BlockConfigInfo {
  name: BlockName;
  hasFile: boolean;
  path: string;
  variants: string[]; // parsed from z.enum([...]) on a property named "variant"
  propNames: string[]; // top-level keys in the Zod schema
  schemaRaw?: string; // raw source snippet for manual inspection

  // ── capabilities — used by audit.ts to suppress false-positive gap hints
  /** Block exposes a numeric `columns`-like prop → grid-Ncol hints are already covered. */
  hasColumnsProp: boolean;
  /** Block exposes an array-typed prop (navigationLinks, socialLinks, collections, etc.)
   *  → "grid-Ncol" in Figma is expressible via array length. */
  hasArrayProps: string[];
  /** Block has a prop whose shape signals embedded form (newsletter.enabled, form.submitLabel…) */
  hasFormCapability: boolean;
  /** Block has a prop to switch multi-image layouts (images[], gallery[], etc.). */
  hasMultiImageCapability: boolean;
  /** Tokens the block pulls dynamically → pill/flat per-theme radii already supported. */
  tokensUsed: string[];
}

const PACKAGES_ROOT = resolve(process.cwd(), 'packages');

export function readBlockConfig(block: BlockName): BlockConfigInfo {
  const base: BlockConfigInfo = {
    name: block,
    hasFile: false,
    path: '',
    variants: [],
    propNames: [],
    hasColumnsProp: false,
    hasArrayProps: [],
    hasFormCapability: false,
    hasMultiImageCapability: false,
    tokensUsed: [],
  };

  const path = resolve(PACKAGES_ROOT, 'theme-base/blocks', block, `${block}.puckConfig.ts`);
  if (!existsSync(path)) return { ...base, path };
  const src = readFileSync(path, 'utf8');

  const variants = extractVariantEnum(src);
  const propNames = extractTopLevelProps(src);
  const arrayProps = extractArrayProps(src);

  // ── classes.ts — to detect token usage
  const classesPath = resolve(PACKAGES_ROOT, 'theme-base/blocks', block, `${block}.classes.ts`);
  const classesSrc = existsSync(classesPath) ? readFileSync(classesPath, 'utf8') : '';
  const astroPath = resolve(PACKAGES_ROOT, 'theme-base/blocks', block, `${block}.astro`);
  const astroSrc = existsSync(astroPath) ? readFileSync(astroPath, 'utf8') : '';

  const tokensUsed = extractTokensUsed(classesSrc + '\n' + astroSrc);

  const hasColumnsProp = /\bcolumns\s*:\s*z\.number/.test(src);
  const hasFormCapability =
    /\bnewsletter\s*:\s*z\.object/.test(src) ||
    /\bform\s*:\s*z\.object/.test(src) ||
    /\bsubmit\w*\s*:\s*z\.string/.test(src) ||
    arrayProps.some((p) => /\b(fields|inputs)\b/i.test(p)) ||
    // placeholder/buttonText/submitLabel at any depth is strong form hint
    /\bplaceholder\s*:\s*z\.string/.test(src) ||
    /\bbuttonText\s*:\s*z\.string/.test(src) ||
    /\bsubmitLabel\s*:\s*z\.string/.test(src) ||
    // Block's own template renders a form — it IS a form block (Newsletter, ContactForm)
    /<form\b/.test(astroSrc) ||
    /type="email"|type="submit"|type="text"\s/.test(astroSrc);
  const hasMultiImageCapability =
    /\bimages?\s*:\s*z\.array/.test(src) ||
    /\bgallery\s*:\s*z\.array/.test(src) ||
    arrayProps.some((p) =>
      /\b(images|gallery|collections|slides|items|products)\b/i.test(p),
    );

  return {
    ...base,
    hasFile: true,
    path,
    variants,
    propNames,
    schemaRaw: src.slice(0, 2000),
    hasColumnsProp,
    hasArrayProps: arrayProps,
    hasFormCapability,
    hasMultiImageCapability,
    tokensUsed,
  };
}

/** Match `variant: z.enum(['a', 'b', 'c'])` */
function extractVariantEnum(src: string): string[] {
  const m = src.match(/variant\s*:\s*z\.enum\(\[([^\]]+)\]\)/);
  if (!m) return [];
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

/**
 * Parse top-level props from a `z.object({...})` in the file.
 * Heuristic: capture identifiers immediately followed by ':' at indent 2.
 */
function extractTopLevelProps(src: string): string[] {
  const schemaStart = src.match(/=\s*z\.object\(\{([\s\S]*?)\}\)\s*;/);
  if (!schemaStart) return [];
  const body = schemaStart[1];
  const props = new Set<string>();
  for (const line of body.split('\n')) {
    const m = line.match(/^\s{2,}(\w+)\s*:\s*z\./);
    if (m) props.add(m[1]);
  }
  return [...props];
}

/** Extract props that are z.array(...) at top level. */
function extractArrayProps(src: string): string[] {
  const props: string[] = [];
  const re = /(\w+)\s*:\s*z\.array\(/g;
  for (const m of src.matchAll(re)) props.push(m[1]);
  return [...new Set(props)];
}

/** Extract CSS var names used in `var(--...)` references inside classes.ts + astro. */
function extractTokensUsed(src: string): string[] {
  const tokens = new Set<string>();
  for (const m of src.matchAll(/var\(\s*(--[\w-]+)/g)) {
    tokens.add(m[1]);
  }
  return [...tokens];
}
