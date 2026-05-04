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

  // 084 vanilla pilot — additive `buttonStyle` variant.
  it('schema accepts buttonStyle="outlined"', () => {
    const ok = SlideshowSchema.safeParse({
      slides: [
        { id: 's1', imageUrl: '', heading: 'h', subtitle: 's', ctaText: '', ctaUrl: '/' },
      ],
      interval: 5,
      autoplay: true,
      padding: { top: 0, bottom: 0 },
      buttonStyle: 'outlined',
    });
    expect(ok.success).toBe(true);
  });

  it('schema rejects invalid buttonStyle value', () => {
    const bad = SlideshowSchema.safeParse({
      slides: [
        { id: 's1', imageUrl: '', heading: 'h', subtitle: 's', ctaText: '', ctaUrl: '/' },
      ],
      interval: 5,
      autoplay: true,
      padding: { top: 0, bottom: 0 },
      buttonStyle: 'ghost' as unknown as 'solid',
    });
    expect(bad.success).toBe(false);
  });

  it('Classes expose buttonStyle mapping with solid + outlined', () => {
    const c = SlideshowClasses as Record<string, unknown>;
    expect(c.buttonStyle).toBeDefined();
    const map = c.buttonStyle as Record<string, string>;
    expect(map.solid).toBe('');
    expect(map.outlined).toMatch(/!bg-transparent/);
    expect(map.outlined).toMatch(/border-\[1\.3px\]/);
    expect(map.outlined).toMatch(/uppercase/);
  });

  // 084 vanilla pilot — class-conflict cleanup.
  it('slide base class no longer hardcodes items-center', () => {
    const c = SlideshowClasses as Record<string, unknown>;
    expect(c.slide).not.toMatch(/items-center/);
  });

  it('content base class no longer hardcodes text-center', () => {
    const c = SlideshowClasses as Record<string, unknown>;
    expect(c.content).not.toMatch(/text-center/);
  });

  it('Classes expose align mapping for left/center/right', () => {
    const c = SlideshowClasses as Record<string, unknown>;
    expect(c.align).toBeDefined();
    const map = c.align as Record<string, string>;
    expect(map.left).toBe('text-left');
    expect(map.center).toBe('text-center');
    expect(map.right).toBe('text-right');
  });
});
