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
    expect(ProductPuckConfig.label).toBe('Информация о товаре');
    expect(ProductPuckConfig.category).toBe('products');
    expect(ProductPuckConfig.defaults.productId).toBeDefined();
  });

  it('ProductPuckConfig declares new panel fields', () => {
    expect(ProductPuckConfig.fields).toHaveProperty('text');
    expect(ProductPuckConfig.fields).toHaveProperty('price');
    expect(ProductPuckConfig.fields).toHaveProperty('quantity');
    expect(ProductPuckConfig.fields).toHaveProperty('description');
    // Legacy badge field kept for back-compat with old revisions.
    expect(ProductPuckConfig.fields).toHaveProperty('badge');
  });

  it('ProductPuckConfig pins maxInstances to 1 (single PDP block per page)', () => {
    expect(ProductPuckConfig.maxInstances).toBe(1);
  });

  it('ProductSchema parses valid props', () => {
    const ok = ProductSchema.safeParse({
      productId: 'prod-123',
      colorScheme: '1',
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
  });

  it('ProductSchema parses old revision shape (back-compat with badge)', () => {
    const oldRevision = {
      productId: 'p-1',
      badge: { text: 'Новинка', textSize: 'medium' },
      padding: { top: 40, bottom: 80 },
    };
    expect(() => ProductSchema.parse(oldRevision)).not.toThrow();
  });

  it('ProductSchema parses new revision shape with text/price/quantity/description panels', () => {
    const newRevision = {
      productId: 'p-1',
      text: { content: 'Новая коллекция!', size: 'medium' },
      price: { show: 'true' },
      quantity: { enabled: 'true' },
      description: { content: 'Длинное описание', size: 'small' },
      padding: { top: 40, bottom: 80 },
    };
    expect(() => ProductSchema.parse(newRevision)).not.toThrow();
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
