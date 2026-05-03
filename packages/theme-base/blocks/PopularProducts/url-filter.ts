/**
 * Resolve effective collection filter for PopularProducts block.
 *
 * URL `?collection=` query takes precedence over block prop. Allows
 * /catalog?collection=URBAN deep-linking like the rose reference site.
 *
 * Falls back to block prop when no URL query, then to undefined when both
 * are absent. Whitespace is trimmed from both sources.
 */
export function resolveActiveCollection(
  urlQuery: string | null | undefined,
  blockProp: string | undefined,
): string | undefined {
  if (typeof urlQuery === 'string') {
    const trimmed = urlQuery.trim();
    if (trimmed.length > 0) return trimmed;
  }
  if (typeof blockProp === 'string') {
    const trimmed = blockProp.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}
