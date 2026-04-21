import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  SlideshowPuckConfig,
  SlideshowSchema,
  SlideshowTokens,
  SlideshowClasses,
} from '../blocks/Slideshow';

describe('Slideshow block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/Slideshow');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports SlideshowPuckConfig with required fields', () => {
    expect(SlideshowPuckConfig.label).toBe('Слайд-шоу');
    expect(SlideshowPuckConfig.category).toBe('hero');
    expect(SlideshowPuckConfig.defaults.slides.length).toBe(3);
    expect(SlideshowPuckConfig.defaults.interval).toBe(5);
    expect(SlideshowPuckConfig.defaults.autoplay).toBe(true);
  });

  it('SlideshowSchema parses valid props', () => {
    const ok = SlideshowSchema.safeParse({
      slides: [
        {
          id: 's1',
          imageUrl: 'https://x.test/a.jpg',
          heading: 'Slide 1',
          subtitle: 'Sub',
          ctaText: 'Go',
          ctaUrl: '/',
        },
      ],
      interval: 5,
      autoplay: true,
      colorScheme: 1,
      padding: { top: 80, bottom: 80 },
    });
    expect(ok.success).toBe(true);
  });

  it('SlideshowSchema rejects invalid interval (e.g. 4)', () => {
    const bad = SlideshowSchema.safeParse({
      slides: [
        {
          id: 's1',
          imageUrl: '',
          heading: 'Slide',
          subtitle: '',
          ctaText: '',
          ctaUrl: '/',
        },
      ],
      interval: 4 as unknown as 3,
      autoplay: false,
      colorScheme: 1,
      padding: { top: 0, bottom: 0 },
    });
    expect(bad.success).toBe(false);
  });

  it('SlideshowTokens lists at least one CSS var', () => {
    expect(SlideshowTokens.length).toBeGreaterThan(0);
    expect(SlideshowTokens[0].startsWith('--')).toBe(true);
    expect(SlideshowTokens).toContain('--size-hero-heading');
  });

  it('SlideshowClasses exports root + slide + image', () => {
    expect(SlideshowClasses.root).toBeDefined();
    expect(SlideshowClasses.slide).toBeDefined();
    expect(SlideshowClasses.image).toBeDefined();
    expect(SlideshowClasses.ctaButton).toBeDefined();
  });
});
