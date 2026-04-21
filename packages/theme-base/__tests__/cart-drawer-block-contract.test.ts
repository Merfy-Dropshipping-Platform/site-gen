import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CartDrawerPuckConfig,
  CartDrawerSchema,
  CartDrawerTokens,
  CartDrawerClasses,
} from '../blocks/CartDrawer';

describe('CartDrawer chrome block', () => {
  it('conforms to validateBlock', async () => {
    const dir = path.resolve(__dirname, '../blocks/CartDrawer');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('is singleton (maxInstances: 1)', () => {
    expect(CartDrawerPuckConfig.maxInstances).toBe(1);
  });

  it('category is layout', () => {
    expect(CartDrawerPuckConfig.category).toBe('layout');
  });

  it('schema parses both position variants', () => {
    for (const position of ['left', 'right'] as const) {
      const result = CartDrawerSchema.safeParse({
        position,
        showCheckoutButton: true,
        colorScheme: 1,
        padding: { top: 24, bottom: 24 },
      });
      expect(result.success).toBe(true);
    }
  });

  it('classes contain distinct left and right position variants', () => {
    expect(CartDrawerClasses.position.left).toBeDefined();
    expect(CartDrawerClasses.position.right).toBeDefined();
    expect(CartDrawerClasses.position.left).not.toEqual(CartDrawerClasses.position.right);
  });

  it('tokens include surface + button primitives for checkout CTA', () => {
    expect(CartDrawerTokens).toContain('--color-surface');
    expect(CartDrawerTokens).toContain('--color-button-bg');
    expect(CartDrawerTokens).toContain('--radius-button');
    expect(CartDrawerTokens).toContain('--size-hero-button-h');
  });

  it('classes expose checkout button class', () => {
    expect(CartDrawerClasses.checkoutBtn).toBeDefined();
  });
});
