import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  PopularProductsPuckConfig,
  PopularProductsSchema,
  PopularProductsTokens,
  PopularProductsClasses,
} from '../blocks/PopularProducts';

describe('PopularProducts block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/PopularProducts');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports PopularProductsPuckConfig with required fields', () => {
    expect(PopularProductsPuckConfig.label).toBe('Популярные товары');
    expect(PopularProductsPuckConfig.category).toBe('products');
    expect(PopularProductsPuckConfig.defaults.cards).toBe(4);
    expect(PopularProductsPuckConfig.defaults.columns).toBe(4);
  });

  it('PopularProductsSchema enforces cards bounds (2-24) and columns (1-6)', () => {
    const ok = PopularProductsSchema.safeParse({
      heading: 'Test',
      cards: 6,
      columns: 3,
      colorScheme: 1,
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);

    const tooFewCards = PopularProductsSchema.safeParse({
      heading: '',
      cards: 1,
      columns: 3,
      colorScheme: 1,
      padding: { top: 0, bottom: 0 },
    });
    expect(tooFewCards.success).toBe(false);

    const tooManyColumns = PopularProductsSchema.safeParse({
      heading: '',
      cards: 4,
      columns: 7,
      colorScheme: 1,
      padding: { top: 0, bottom: 0 },
    });
    expect(tooManyColumns.success).toBe(false);
  });

  it('PopularProductsTokens lists grid + card tokens', () => {
    expect(PopularProductsTokens.length).toBeGreaterThan(0);
    expect(PopularProductsTokens).toContain('--spacing-grid-col-gap');
    expect(PopularProductsTokens).toContain('--radius-card');
  });

  it('PopularProductsClasses has root + grid + placeholder card', () => {
    expect(PopularProductsClasses.root).toBeDefined();
    expect(PopularProductsClasses.grid).toBeDefined();
    expect(PopularProductsClasses.placeholderCard).toBeDefined();
    expect(PopularProductsClasses.placeholderMedia).toBeDefined();
  });
});
