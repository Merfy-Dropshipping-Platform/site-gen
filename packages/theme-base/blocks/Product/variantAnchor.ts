/**
 * Product variant deep-link anchor — pure parse/serialize logic (Phase 1).
 *
 * A variant is identified by its axis map `{ groupName → value }` (the runtime
 * `selectedOptions` in Product.astro), NOT by id. We encode that map into the
 * URL as one query param per axis, namespaced with the `opt.` prefix so it can
 * never collide with existing params (`?id=`, `?collection=`, catalog filters).
 *
 * Example: `{ 'Цвет': 'Белый', 'Размер': 'M' }` → `opt.Цвет=Белый&opt.Размер=M`
 * (Cyrillic and special chars `:`/`;`/`=`/`&`/`/` round-trip via URLSearchParams).
 *
 * Soft by design: on parse, only `opt.*` params are read as axes — anything
 * else is ignored; empty keys/values are dropped. Unknown/renamed values are
 * left for the DOM layer to ignore per-axis (apply what matches, default rest).
 *
 * This module is the CANONICAL implementation and the unit-test oracle. The
 * Product.astro `<script is:inline>` mirrors it verbatim (inline scripts cannot
 * import). The DOM integration test asserts the inline-produced URL equals this
 * module's output, so the mirror cannot silently drift.
 */

/** Namespace prefix for variant-axis query params. Collision-safe. */
export const VARIANT_ANCHOR_PREFIX = 'opt.';

/**
 * Parse a URL search string into an axis map `{ groupName → value }`.
 * Accepts with or without a leading `?`. Non-`opt.*` params are ignored.
 */
export function parseVariantAnchor(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  const params = new URLSearchParams(search || '');
  params.forEach((value, key) => {
    if (
      key.indexOf(VARIANT_ANCHOR_PREFIX) === 0 &&
      key.length > VARIANT_ANCHOR_PREFIX.length
    ) {
      const axis = key.slice(VARIANT_ANCHOR_PREFIX.length);
      if (axis && value) out[axis] = value;
    }
  });
  return out;
}

/**
 * Merge an axis selection into an existing search string, preserving all
 * non-axis params and replacing any stale `opt.*` params. Returns the query
 * string WITHOUT a leading `?`. This is the write path used on variant select.
 */
export function writeVariantAnchorToSearch(
  search: string,
  selected: Record<string, string>,
): string {
  const params = new URLSearchParams(search || '');
  // Drop any existing axis params first (collect then delete — mutating during
  // iteration is unsafe), so a re-selection never leaves stale axes behind.
  const drop: string[] = [];
  params.forEach((_value, key) => {
    if (key.indexOf(VARIANT_ANCHOR_PREFIX) === 0) drop.push(key);
  });
  drop.forEach((key) => params.delete(key));
  for (const axis of Object.keys(selected)) {
    const val = selected[axis];
    if (axis && val) params.set(VARIANT_ANCHOR_PREFIX + axis, val);
  }
  return params.toString();
}

/**
 * Axis-only serialization of a selection (canonical round-trip form, no other
 * params). Equivalent to merging into an empty search.
 */
export function serializeVariantAnchor(selected: Record<string, string>): string {
  return writeVariantAnchorToSearch('', selected);
}
