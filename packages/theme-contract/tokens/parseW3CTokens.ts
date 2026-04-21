export interface W3CTokenNode {
  $value?: unknown;
  $type?: string;
  $description?: string;
  [key: string]: unknown;
}

export interface ParsedToken {
  value: string;
  type: string | undefined;
}

export type W3CTokensJson = Record<string, W3CTokenNode | Record<string, unknown>>;

/**
 * Flatten W3C Design Tokens JSON to a map of CSS custom property keys → value+type.
 * Group names are joined with dashes and prefixed with `--`.
 *
 * Example: `{ color: { primary: { $value: "#fff" } } }` → `{ "--color-primary": { value: "#fff", type: ... } }`
 */
export function parseW3CTokens(tokens: W3CTokensJson): Record<string, ParsedToken> {
  const out: Record<string, ParsedToken> = {};
  walk(tokens, [], out);
  return out;
}

function walk(
  node: unknown,
  path: string[],
  out: Record<string, ParsedToken>,
): void {
  if (!node || typeof node !== 'object') return;

  const n = node as W3CTokenNode;

  // Leaf: has $value → emit
  if ('$value' in n) {
    const key = '--' + path.join('-');
    out[key] = {
      value: String(n.$value),
      type: typeof n.$type === 'string' ? n.$type : undefined,
    };
    return;
  }

  // Intermediate: recurse into non-$-prefixed keys
  for (const [k, v] of Object.entries(n)) {
    if (k.startsWith('$')) continue;
    walk(v, [...path, k], out);
  }
}
