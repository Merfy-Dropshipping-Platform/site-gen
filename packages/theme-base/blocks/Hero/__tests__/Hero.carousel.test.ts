import { HeroSchema } from '../Hero.puckConfig';

describe('Hero schema — carousel additions (T-H1)', () => {
  it('accepts mode="carousel" with slides array', () => {
    const result = HeroSchema.safeParse({
      title: 'X',
      subtitle: 'Y',
      image: { url: '', alt: '' },
      cta: { text: '', href: '' },
      variant: 'overlay',
      mode: 'carousel',
      slides: [
        { id: 's1', imageUrl: 'https://x.com/1.jpg', heading: { text: 'A', size: 'large' }, text: { content: 'a', size: 'medium' }, buttonText: 'go', buttonLink: '/a' },
      ],
      pagination: 'numbers',
      autoplay: true,
      interval: 5,
      imageFullBleed: true,
      contentAlign: 'left',
      buttonStyle: 'solid',
      padding: { top: 0, bottom: 0 },
    });
    expect(result.success).toBe(true);
  });

  it('mode is optional (rose default works)', () => {
    const result = HeroSchema.safeParse({
      title: 'X',
      subtitle: 'Y',
      image: { url: '', alt: '' },
      cta: { text: '', href: '' },
      variant: 'centered',
      padding: { top: 0, bottom: 0 },
    });
    expect(result.success).toBe(true);
  });

  it('slides max 8', () => {
    const tooMany = Array.from({ length: 9 }, (_, i) => ({
      id: `s${i}`, imageUrl: `https://x/${i}.jpg`,
    }));
    const result = HeroSchema.safeParse({
      title: 'X', subtitle: 'Y',
      image: { url: '', alt: '' },
      cta: { text: '', href: '' },
      variant: 'overlay',
      mode: 'carousel',
      slides: tooMany,
      padding: { top: 0, bottom: 0 },
    });
    expect(result.success).toBe(false);
  });
});
