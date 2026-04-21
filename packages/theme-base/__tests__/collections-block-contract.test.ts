import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CollectionsPuckConfig,
  CollectionsSchema,
  CollectionsTokens,
  CollectionsClasses,
} from '../blocks/Collections';

describe('Collections block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/Collections');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports CollectionsPuckConfig with required fields', () => {
    expect(CollectionsPuckConfig.label).toBe('Коллекции');
    expect(CollectionsPuckConfig.category).toBe('products');
    expect(CollectionsPuckConfig.defaults.collections.length).toBe(3);
  });

  it('CollectionsSchema parses valid props', () => {
    const ok = CollectionsSchema.safeParse({
      heading: 'Test',
      collections: [
        { id: 'c1', collectionId: null, heading: 'C1', description: '' },
      ],
      columns: 3,
      colorScheme: 1,
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
  });

  it('CollectionsTokens lists grid spacing token', () => {
    expect(CollectionsTokens.length).toBeGreaterThan(0);
    expect(CollectionsTokens).toContain('--spacing-grid-col-gap');
  });

  it('CollectionsClasses has root + container + grid', () => {
    expect(CollectionsClasses.root).toBeDefined();
    expect(CollectionsClasses.container).toBeDefined();
    expect(CollectionsClasses.grid).toBeDefined();
  });
});
