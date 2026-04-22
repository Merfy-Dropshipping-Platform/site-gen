import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import { HeroPuckConfig, HeroSchema, HeroTokens, HeroClasses, HeroVariants } from '../blocks/Hero';

describe('Hero pilot block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/Hero');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports HeroPuckConfig with required fields', () => {
    expect(HeroPuckConfig.label).toBe('Hero');
    expect(HeroPuckConfig.category).toBe('hero');
    expect(HeroPuckConfig.defaults.title).toBeDefined();
  });

  it('HeroSchema parses a valid props object', () => {
    const ok = HeroSchema.safeParse({
      title: 'Hi',
      subtitle: '',
      image: { url: 'https://x.test/a.jpg', alt: 'a' },
      cta: { text: 'Go', href: '/' },
      variant: 'centered',
      colorScheme: 1,
      padding: { top: 80, bottom: 80 },
    });
    expect(ok.success).toBe(true);
  });

  it('HeroTokens lists at least one CSS var', () => {
    expect(HeroTokens.length).toBeGreaterThan(0);
    expect(HeroTokens[0].startsWith('--')).toBe(true);
  });

  it('HeroVariants has centered/split/overlay/grid-4', () => {
    expect(Object.keys(HeroVariants)).toEqual(
      expect.arrayContaining(['centered', 'split', 'overlay', 'grid-4']),
    );
  });

  it('HeroClasses exports root + variant keys + grid tiles', () => {
    expect(HeroClasses).toBeDefined();
    expect(typeof HeroClasses.root).toBe('string');
    expect(typeof HeroClasses.inner['grid-4']).toBe('string');
    expect(typeof HeroClasses.gridContainer).toBe('string');
    expect(typeof HeroClasses.gridTile).toBe('string');
  });

  it('HeroSchema accepts grid-4 variant with images array', () => {
    const result = HeroSchema.safeParse({
      title: 'Grid hero',
      subtitle: '',
      image: { url: '', alt: '' },
      images: [
        { url: '/a.jpg', alt: 'a' },
        { url: '/b.jpg', alt: 'b' },
        { url: '/c.jpg', alt: 'c' },
        { url: '/d.jpg', alt: 'd' },
      ],
      cta: { text: 'Go', href: '/' },
      variant: 'grid-4',
      colorScheme: 1,
      padding: { top: 80, bottom: 80 },
    });
    expect(result.success).toBe(true);
  });

  it('HeroSchema caps images array at 8', () => {
    const result = HeroSchema.safeParse({
      title: 'x',
      subtitle: '',
      image: { url: '', alt: '' },
      images: Array.from({ length: 9 }, (_, i) => ({ url: `/${i}.jpg`, alt: `${i}` })),
      cta: { text: 'Go', href: '/' },
      variant: 'grid-4',
      colorScheme: 1,
      padding: { top: 80, bottom: 80 },
    });
    expect(result.success).toBe(false);
  });

  it('HeroSchema allows omitting images (for non-grid variants)', () => {
    const result = HeroSchema.safeParse({
      title: 'centered',
      subtitle: '',
      image: { url: '/bg.jpg', alt: 'bg' },
      cta: { text: 'Go', href: '/' },
      variant: 'centered',
      colorScheme: 1,
      padding: { top: 80, bottom: 80 },
    });
    expect(result.success).toBe(true);
  });
});
