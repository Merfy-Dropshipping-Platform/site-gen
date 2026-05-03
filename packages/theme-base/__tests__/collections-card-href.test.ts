/**
 * Collections card href builder — pure helper extracted from Collections.astro.
 *
 * The default href format is `/catalog?collection=<id>` so the catalog page
 * filters its product grid (matching rose.merfy.ru/catalog reference). The
 * merchant can override the base via the `cardLinkBase` Puck field if they
 * want dedicated /collections/<id> pages.
 */
import { buildCollectionHref } from '../blocks/Collections/card-href';

describe('Collections card href', () => {
  it('uses default cardLinkBase when not configured', () => {
    expect(buildCollectionHref('riviera-id', undefined)).toBe(
      '/catalog?collection=riviera-id',
    );
  });

  it('uses configured cardLinkBase template (legacy /collections/ format)', () => {
    expect(buildCollectionHref('riviera-id', '/collections/')).toBe(
      '/collections/riviera-id',
    );
  });

  it('uses configured cardLinkBase template (custom catalog query)', () => {
    expect(buildCollectionHref('riviera-id', '/catalog?collection=')).toBe(
      '/catalog?collection=riviera-id',
    );
  });

  it('returns # when collectionId is null', () => {
    expect(buildCollectionHref(null, '/catalog?collection=')).toBe('#');
  });

  it('returns # when collectionId is empty string', () => {
    expect(buildCollectionHref('', undefined)).toBe('#');
  });

  it('returns # when collectionId is whitespace only', () => {
    expect(buildCollectionHref('   ', undefined)).toBe('#');
  });

  it('trims whitespace from collectionId before appending', () => {
    expect(buildCollectionHref('  riviera-id  ', undefined)).toBe(
      '/catalog?collection=riviera-id',
    );
  });

  it('treats empty cardLinkBase as default', () => {
    expect(buildCollectionHref('riviera-id', '')).toBe(
      '/catalog?collection=riviera-id',
    );
  });
});
