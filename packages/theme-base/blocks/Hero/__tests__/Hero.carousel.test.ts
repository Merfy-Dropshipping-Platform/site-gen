import { HeroSchema } from '../Hero.puckConfig';
import fs from 'node:fs';
import path from 'node:path';

const HERO_ASTRO = fs.readFileSync(
  path.join(__dirname, '..', 'Hero.astro'),
  'utf-8',
);

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

/**
 * Hero render — carousel branch (T-H1..T-H5).
 * Source-text assertions on Hero.astro: verifies carousel branch
 * exists alongside the single render and references the correct
 * markup (data-merfy-hero-carousel, slides loop, pagination buttons,
 * imageFullBleed class, hidden-class for non-first slides).
 *
 * Astro Container rendering in Jest is brittle (needs precompiled
 * dist + ESM) — text assertions stay within the unit-test runner.
 */
describe('Hero render — carousel branch (T-H1..T-H5)', () => {
  it('carousel branch renders slides with hidden class for non-first (T-H1)', () => {
    // single render must remain wrapped in `effectiveMode === 'single'`
    expect(HERO_ASTRO).toMatch(/\{effectiveMode === 'single' && \(/);
    // carousel branch present and emits the slide loop
    expect(HERO_ASTRO).toMatch(/\{effectiveMode === 'carousel' && \(/);
    expect(HERO_ASTRO).toContain('data-merfy-hero-carousel');
    // slides.map produces data-slide-index for each slide
    expect(HERO_ASTRO).toMatch(/rawSlides\.map\(\(slide,\s*idx\)\s*=>/);
    expect(HERO_ASTRO).toMatch(/data-slide-index=\{idx\}/);
    // first slide visible, others hidden via slideHidden class
    expect(HERO_ASTRO).toMatch(/idx === 0 \? '' : C\.slideHidden/);
  });

  it('mode=undefined falls back to single — single branch unchanged (T-H2 — rose regression)', () => {
    // effectiveMode resolution: requires both 'carousel' string AND non-empty slides
    expect(HERO_ASTRO).toMatch(/\(Astro\.props as any\)\.mode === 'carousel' && rawSlides\.length > 0/);
    // single branch wraps the original section with data-puck-component-id
    expect(HERO_ASTRO).toMatch(/\{effectiveMode === 'single' && \(\s*<section/);
    // existing single-mode markers preserved
    expect(HERO_ASTRO).toContain('data-puck-component-id={id}');
    expect(HERO_ASTRO).toContain('variant === \'overlay\'');
  });

  it('empty slides[] forces single mode (T-H3)', () => {
    // The conditional explicitly checks rawSlides.length > 0
    expect(HERO_ASTRO).toMatch(/rawSlides\.length > 0/);
    // rawSlides is normalized — non-array becomes []
    expect(HERO_ASTRO).toMatch(/Array\.isArray\(\(Astro\.props as any\)\.slides\)/);
  });

  it('pagination renders buttons with data-pagination-index when count > 1 (T-H4)', () => {
    // pagination guarded by !== 'none' AND length > 1
    expect(HERO_ASTRO).toMatch(/heroPagination !== 'none' && rawSlides\.length > 1/);
    // each button gets data-pagination-index from idx
    expect(HERO_ASTRO).toMatch(/data-pagination-index=\{idx\}/);
    // prev/next arrows present
    expect(HERO_ASTRO).toContain('data-pagination-prev');
    expect(HERO_ASTRO).toContain('data-pagination-next');
  });

  it('imageFullBleed=true applies imageFullBleed class to slide image (T-H5)', () => {
    // boolean resolution
    expect(HERO_ASTRO).toMatch(/heroImageFullBleed = \(Astro\.props as any\)\.imageFullBleed === true/);
    // class:list applies C.imageFullBleed conditionally on heroImageFullBleed
    expect(HERO_ASTRO).toMatch(/heroImageFullBleed && C\.imageFullBleed/);
  });
});

