import path from 'node:path';
import fs from 'node:fs/promises';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  ProductPuckConfig,
  ProductSchema,
  ProductTokens,
  ProductClasses,
} from '../blocks/Product';

describe('Product block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/Product');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports ProductPuckConfig with required fields', () => {
    expect(ProductPuckConfig.label).toBe('Товар (PDP)');
    expect(ProductPuckConfig.category).toBe('products');
    expect(ProductPuckConfig.defaults.productId).toBeDefined();
  });

  it('ProductSchema parses valid props', () => {
    const ok = ProductSchema.safeParse({
      productId: 'prod-123',
      colorScheme: 1,
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
  });

  it('ProductTokens includes button + media tokens', () => {
    expect(ProductTokens.length).toBeGreaterThan(0);
    expect(ProductTokens).toContain('--radius-button');
    expect(ProductTokens).toContain('--radius-media');
    expect(ProductTokens).toContain('--color-button-bg');
    expect(ProductTokens).toContain('--size-hero-button-h');
  });

  it('Product.astro emits JSON-LD placeholder + h1 for SEO invariant', async () => {
    const astroPath = path.resolve(
      __dirname,
      '../blocks/Product/Product.astro',
    );
    const content = await fs.readFile(astroPath, 'utf-8');
    // Spec §11 SEO invariant: JSON-LD Product schema must be emitted.
    expect(content).toContain('application/ld+json');
    expect(content).toContain('schema.org');
    expect(content).toMatch(/@type['"]?\s*:\s*['"]Product/);
    // h1 for product name (SEO invariant).
    expect(content).toMatch(/<h1[^>]*>/);
    expect(ProductClasses.title).toBeDefined();
    expect(ProductClasses.addToCart).toBeDefined();
  });
});
