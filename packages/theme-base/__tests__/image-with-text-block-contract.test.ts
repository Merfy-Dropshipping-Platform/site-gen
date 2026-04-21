import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  ImageWithTextPuckConfig,
  ImageWithTextSchema,
  ImageWithTextTokens,
  ImageWithTextClasses,
  ImageWithTextVariants,
} from '../blocks/ImageWithText';

describe('ImageWithText block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/ImageWithText');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports ImageWithTextPuckConfig with required fields', () => {
    expect(ImageWithTextPuckConfig.label).toBe('Изображение с текстом');
    expect(ImageWithTextPuckConfig.category).toBe('content');
    expect(ImageWithTextPuckConfig.defaults.imagePosition).toBe('left');
    expect(ImageWithTextPuckConfig.defaults.button.text).toBeDefined();
  });

  it('ImageWithTextSchema parses valid props + rejects invalid imagePosition', () => {
    const ok = ImageWithTextSchema.safeParse({
      image: { url: '/x.jpg', alt: 'x' },
      heading: 'Title',
      text: 'Body',
      button: { text: 'Click', href: '/go' },
      imagePosition: 'right',
      colorScheme: 2,
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);

    const bad = ImageWithTextSchema.safeParse({
      image: { url: '', alt: '' },
      heading: '',
      text: '',
      button: { text: '', href: '' },
      imagePosition: 'top', // invalid
      colorScheme: 1,
      padding: { top: 0, bottom: 0 },
    });
    expect(bad.success).toBe(false);
  });

  it('ImageWithTextTokens includes --radius-media', () => {
    expect(ImageWithTextTokens.length).toBeGreaterThan(0);
    expect(ImageWithTextTokens).toContain('--radius-media');
  });

  it('ImageWithTextVariants has imageLeft + imageRight', () => {
    expect(Object.keys(ImageWithTextVariants)).toEqual(
      expect.arrayContaining(['imageLeft', 'imageRight']),
    );
    expect(ImageWithTextClasses.inner.imageLeft).toBeDefined();
    expect(ImageWithTextClasses.inner.imageRight).toBeDefined();
  });
});
