import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  GalleryPuckConfig,
  GallerySchema,
  GalleryTokens,
  GalleryClasses,
  GalleryVariants,
} from '../blocks/Gallery';

describe('Gallery block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/Gallery');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports GalleryPuckConfig with required fields', () => {
    expect(GalleryPuckConfig.label).toBe('Галерея');
    expect(GalleryPuckConfig.category).toBe('media');
    expect(GalleryPuckConfig.defaults.items.length).toBe(3);
  });

  it('GallerySchema parses items of all three types + rejects >3 items', () => {
    const ok = GallerySchema.safeParse({
      heading: 'Test',
      items: [
        { type: 'image', id: 'i1', url: '/x.jpg', alt: 'x' },
        { type: 'product', id: 'p1', productId: 'prod-1' },
        { type: 'collection', id: 'c1', collectionId: 'coll-1' },
      ],
      layout: 'grid',
      colorScheme: 1,
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);

    const tooMany = GallerySchema.safeParse({
      items: [
        { type: 'image', id: 'i1', url: '', alt: '' },
        { type: 'image', id: 'i2', url: '', alt: '' },
        { type: 'image', id: 'i3', url: '', alt: '' },
        { type: 'image', id: 'i4', url: '', alt: '' },
      ],
      layout: 'grid',
      colorScheme: 1,
      padding: { top: 0, bottom: 0 },
    });
    expect(tooMany.success).toBe(false);
  });

  it('GalleryTokens lists --radius-media', () => {
    expect(GalleryTokens.length).toBeGreaterThan(0);
    expect(GalleryTokens).toContain('--radius-media');
  });

  it('GalleryVariants has grid + side-by-side', () => {
    expect(Object.keys(GalleryVariants)).toEqual(
      expect.arrayContaining(['grid', 'side-by-side']),
    );
  });

  it('GalleryClasses has inner.grid and inner["side-by-side"]', () => {
    expect(GalleryClasses.inner.grid).toBeDefined();
    expect(GalleryClasses.inner['side-by-side']).toBeDefined();
  });
});
