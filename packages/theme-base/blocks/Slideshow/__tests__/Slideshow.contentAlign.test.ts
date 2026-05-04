import {
  SlideshowSchema,
  SlideshowPuckConfig,
  SlideshowClasses,
} from '../index';

/**
 * 084 vanilla pilot — additive variant: Slideshow.contentAlign.
 * Default behavior unchanged when contentAlign is undefined.
 */
describe('Slideshow.contentAlign (additive variant)', () => {
  it('schema accepts contentAlign="left"', () => {
    const ok = SlideshowSchema.safeParse({
      slides: [
        { id: 's1', imageUrl: '', heading: 'h', subtitle: 's', ctaText: '', ctaUrl: '/' },
      ],
      interval: 5,
      autoplay: true,
      padding: { top: 0, bottom: 0 },
      contentAlign: 'left',
    });
    expect(ok.success).toBe(true);
  });

  it('schema accepts contentAlign="center"', () => {
    const ok = SlideshowSchema.safeParse({
      slides: [
        { id: 's1', imageUrl: '', heading: 'h', subtitle: 's', ctaText: '', ctaUrl: '/' },
      ],
      interval: 5,
      autoplay: true,
      padding: { top: 0, bottom: 0 },
      contentAlign: 'center',
    });
    expect(ok.success).toBe(true);
  });

  it('schema rejects invalid contentAlign value', () => {
    const bad = SlideshowSchema.safeParse({
      slides: [
        { id: 's1', imageUrl: '', heading: 'h', subtitle: 's', ctaText: '', ctaUrl: '/' },
      ],
      interval: 5,
      autoplay: true,
      padding: { top: 0, bottom: 0 },
      contentAlign: 'top' as unknown as 'left',
    });
    expect(bad.success).toBe(false);
  });

  it('schema is optional (default behaviour preserved)', () => {
    const ok = SlideshowSchema.safeParse({
      slides: [
        { id: 's1', imageUrl: '', heading: 'h', subtitle: 's', ctaText: '', ctaUrl: '/' },
      ],
      interval: 5,
      autoplay: true,
      padding: { top: 0, bottom: 0 },
    });
    expect(ok.success).toBe(true);
  });

  it('PuckConfig exposes contentAlign field', () => {
    const fields = SlideshowPuckConfig.fields as Record<string, unknown>;
    expect(fields.contentAlign).toBeDefined();
  });

  it('Classes expose contentAlign mapping with left + center', () => {
    const c = SlideshowClasses as Record<string, unknown>;
    expect(c.contentAlign).toBeDefined();
    const map = c.contentAlign as Record<string, string>;
    expect(map.left).toMatch(/items-start/);
    expect(map.center).toMatch(/items-center/);
  });
});
