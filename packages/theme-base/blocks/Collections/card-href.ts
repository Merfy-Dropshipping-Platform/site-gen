/**
 * Build href for a Collections card link.
 *
 * By default, points the card at /catalog?collection=<id> so that the catalog
 * page filters its product list to the chosen collection (matching the rose
 * reference behaviour). The merchant can override the prefix through the
 * `cardLinkBase` Puck field if they want dedicated /collections/<id> pages.
 *
 * Returns "#" if no collection id is supplied (renders as a no-op anchor).
 */
const DEFAULT_LINK_BASE = '/catalog?collection=';

export function buildCollectionHref(
  collectionId: string | null | undefined,
  cardLinkBase: string | undefined,
): string {
  if (typeof collectionId !== 'string') return '#';
  const trimmedId = collectionId.trim();
  if (trimmedId.length === 0) return '#';
  const base =
    typeof cardLinkBase === 'string' && cardLinkBase.trim().length > 0
      ? cardLinkBase
      : DEFAULT_LINK_BASE;
  return `${base}${trimmedId}`;
}
