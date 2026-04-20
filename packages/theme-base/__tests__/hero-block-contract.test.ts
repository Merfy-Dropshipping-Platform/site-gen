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

  it('HeroVariants has centered/split/overlay', () => {
    expect(Object.keys(HeroVariants)).toEqual(expect.arrayContaining(['centered', 'split', 'overlay']));
  });

  it('HeroClasses exports root + variant keys', () => {
    expect(HeroClasses).toBeDefined();
    expect(typeof HeroClasses.root).toBe('string');
  });
});
