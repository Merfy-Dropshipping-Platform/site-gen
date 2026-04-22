import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { BlockName } from './types.js';

/**
 * Read block's puckConfig.ts without TS compiler reflection — use regex on source.
 * Good enough for surface-level audit (variants, prop names). Not a full AST parse.
 */
export interface BlockConfigInfo {
  name: BlockName;
  hasFile: boolean;
  path: string;
  variants: string[]; // parsed from z.enum([...]) on a property named "variant"
  propNames: string[]; // top-level keys in the Zod schema
  schemaRaw?: string; // raw source snippet for manual inspection
}

const PACKAGES_ROOT = resolve(process.cwd(), 'packages');

export function readBlockConfig(block: BlockName): BlockConfigInfo {
  const path = resolve(PACKAGES_ROOT, 'theme-base/blocks', block, `${block}.puckConfig.ts`);
  if (!existsSync(path)) {
    return { name: block, hasFile: false, path, variants: [], propNames: [] };
  }
  const src = readFileSync(path, 'utf8');

  const variants = extractVariantEnum(src);
  const propNames = extractTopLevelProps(src);

  return {
    name: block,
    hasFile: true,
    path,
    variants,
    propNames,
    schemaRaw: src.slice(0, 2000),
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
