import {
  CollectionsSchema,
  CollectionsPuckConfig,
  CollectionsClasses,
} from '../index';

/**
 * 084 vanilla pilot — additive variants on Collections:
 *   - cardCaptionStyle: 'default' | 'uppercase'
 *   - gridAspect: 'auto' | '1:1'
 * Default behavior unchanged when these props are omitted.
 */
describe('Collections additive variants (084)', () => {
  const baseValid = {
    heading: 'h',
    collections: [{ id: 'c1', collectionId: null, heading: 'X' }],
    columns: 3,
    padding: { top: 0, bottom: 0 },
  };

  it('schema accepts cardCaptionStyle="uppercase"', () => {
    expect(
      CollectionsSchema.safeParse({ ...baseValid, cardCaptionStyle: 'uppercase' }).success,
    ).toBe(true);
  });

  it('schema accepts cardCaptionStyle="default"', () => {
    expect(
      CollectionsSchema.safeParse({ ...baseValid, cardCaptionStyle: 'default' }).success,
    ).toBe(true);
  });

  it('schema accepts gridAspect="1:1"', () => {
    expect(CollectionsSchema.safeParse({ ...baseValid, gridAspect: '1:1' }).success).toBe(true);
  });

  it('schema accepts gridAspect="auto"', () => {
    expect(CollectionsSchema.safeParse({ ...baseValid, gridAspect: 'auto' }).success).toBe(true);
  });

  it('schema rejects invalid cardCaptionStyle', () => {
    expect(
      CollectionsSchema.safeParse({
        ...baseValid,
        cardCaptionStyle: 'lower' as unknown as 'uppercase',
      }).success,
    ).toBe(false);
  });

  it('schema rejects invalid gridAspect', () => {
    expect(
      CollectionsSchema.safeParse({ ...baseValid, gridAspect: '4:3' as unknown as '1:1' }).success,
    ).toBe(false);
  });

  it('default (no variants) still parses (backwards compat)', () => {
    expect(CollectionsSchema.safeParse(baseValid).success).toBe(true);
  });

  it('PuckConfig exposes cardCaptionStyle + gridAspect fields', () => {
    const fields = CollectionsPuckConfig.fields as Record<string, unknown>;
    expect(fields.cardCaptionStyle).toBeDefined();
    expect(fields.gridAspect).toBeDefined();
  });

  it('Classes export cardCaption mapping with uppercase variant', () => {
    const c = CollectionsClasses as Record<string, unknown>;
    expect(c.cardCaption).toBeDefined();
    const map = c.cardCaption as Record<string, string>;
    expect(map.uppercase).toMatch(/uppercase/);
  });

  it('Classes export gridAspect mapping for 1:1', () => {
    const c = CollectionsClasses as Record<string, unknown>;
    expect(c.gridAspect).toBeDefined();
    const map = c.gridAspect as Record<string, string>;
    expect(map['1:1']).toMatch(/aspect-square|aspect-\[1\/1\]/);
  });
});
