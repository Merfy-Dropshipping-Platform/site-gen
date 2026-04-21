import fs from 'node:fs/promises';
import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CartSectionPuckConfig,
  CartSectionSchema,
  CartSectionTokens,
  CartSectionClasses,
} from '../blocks/CartSection';

describe('CartSection block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/CartSection');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports CartSectionPuckConfig with required fields', () => {
    expect(CartSectionPuckConfig.label).toBe('Корзина');
    expect(CartSectionPuckConfig.category).toBe('layout');
    expect(CartSectionPuckConfig.defaults.colorScheme).toBe(1);
    expect(CartSectionPuckConfig.defaults.padding).toEqual({ top: 80, bottom: 80 });
    expect(CartSectionPuckConfig.maxInstances).toBe(1);
  });

  it('CartSectionSchema parses valid props', () => {
    const ok = CartSectionSchema.safeParse({
      colorScheme: 1,
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
  });

  it('CartSectionTokens lists basic layout tokens', () => {
    expect(CartSectionTokens.length).toBeGreaterThan(0);
    expect(CartSectionTokens).toContain('--container-max-width');
    expect(CartSectionTokens).toContain('--spacing-section-y');
    expect(CartSectionTokens).toContain('--size-hero-heading');
  });

  it('CartSectionClasses has root + container + heading + empty', () => {
    expect(CartSectionClasses.root).toBeDefined();
    expect(CartSectionClasses.container).toBeDefined();
    expect(CartSectionClasses.heading).toBeDefined();
    expect(CartSectionClasses.empty).toBeDefined();
  });

  it('CartSection astro renders <h1>Корзина</h1>', async () => {
    const astroPath = path.resolve(__dirname, '../blocks/CartSection/CartSection.astro');
    const source = await fs.readFile(astroPath, 'utf-8');
    expect(source).toMatch(/<h1[^>]*>Корзина<\/h1>/);
  });
});
