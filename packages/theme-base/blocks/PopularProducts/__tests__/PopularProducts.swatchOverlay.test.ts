import {
  PopularProductsSchema,
  PopularProductsPuckConfig,
  PopularProductsClasses,
} from '../index';

/**
 * 084 vanilla pilot — additive variant: PopularProducts.swatchOverlay.
 * When true, vanilla home renders a 3-pip swatch indicator above the
 * product image (top-right). Default unset → identical pre-commit.
 */
describe('PopularProducts.swatchOverlay (additive variant)', () => {
  const baseValid = {
    cards: 4,
    columns: 4,
    padding: { top: 0, bottom: 0 },
    quickAdd: false,
    quickAddText: 'В КОРЗИНУ',
  };

  it('schema accepts swatchOverlay=true', () => {
    expect(
      PopularProductsSchema.safeParse({ ...baseValid, swatchOverlay: true }).success,
    ).toBe(true);
  });

  it('schema accepts swatchOverlay=false', () => {
    expect(
      PopularProductsSchema.safeParse({ ...baseValid, swatchOverlay: false }).success,
    ).toBe(true);
  });

  it('schema rejects non-boolean swatchOverlay', () => {
    expect(
      PopularProductsSchema.safeParse({
        ...baseValid,
        swatchOverlay: 'yes' as unknown as boolean,
      }).success,
    ).toBe(false);
  });

  it('schema works without swatchOverlay (backwards compat)', () => {
    expect(PopularProductsSchema.safeParse(baseValid).success).toBe(true);
  });

  it('PuckConfig exposes swatchOverlay field', () => {
    const fields = PopularProductsPuckConfig.fields as Record<string, unknown>;
    expect(fields.swatchOverlay).toBeDefined();
  });

  it('Classes export swatchOverlay container + dot definitions', () => {
    const c = PopularProductsClasses as Record<string, unknown>;
    expect(c.swatchOverlay).toBeDefined();
    const map = c.swatchOverlay as Record<string, string>;
    expect(map.container).toMatch(/absolute/);
    // 088 G3 fix — pips moved from top-right to bottom-right per Figma
    // 1:19004. Position is now `bottom-3 right-3` (not `top-3 right-3`).
    expect(map.container).toMatch(/bottom-/);
    expect(map.container).toMatch(/right-/);
    expect(map.container).not.toMatch(/top-/);
    expect(map.dot).toBeDefined();
  });
});
