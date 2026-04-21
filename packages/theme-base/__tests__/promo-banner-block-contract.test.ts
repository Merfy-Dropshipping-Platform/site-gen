import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  PromoBannerPuckConfig,
  PromoBannerSchema,
  PromoBannerTokens,
  PromoBannerClasses,
} from '../blocks/PromoBanner';

describe('PromoBanner block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/PromoBanner');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports PromoBannerPuckConfig with required fields', () => {
    expect(PromoBannerPuckConfig.label).toBe('Промо-баннер');
    expect(PromoBannerPuckConfig.category).toBe('hero');
    expect(PromoBannerPuckConfig.defaults.text).toBeDefined();
  });

  it('PromoBannerSchema parses valid props', () => {
    const ok = PromoBannerSchema.safeParse({
      text: 'Test',
      linkText: 'Go',
      linkUrl: '/test',
      colorScheme: 1,
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
  });

  it('PromoBannerTokens lists at least one CSS var', () => {
    expect(PromoBannerTokens.length).toBeGreaterThan(0);
    expect(PromoBannerTokens[0].startsWith('--')).toBe(true);
  });

  it('PromoBannerClasses has root + container', () => {
    expect(PromoBannerClasses.root).toBeDefined();
    expect(PromoBannerClasses.container).toBeDefined();
  });
});
