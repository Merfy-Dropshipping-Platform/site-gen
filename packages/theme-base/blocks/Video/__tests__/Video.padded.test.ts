import { VideoSchema, VideoPuckConfig, VideoClasses } from '../index';

/**
 * 084 vanilla pilot — additive variants on Video:
 *   - padded: boolean (default true → identical pre-commit behaviour)
 *   - align: 'container' | 'fullbleed'
 * When both omitted, render is identical pre-084.
 */
describe('Video padded + align (084 additive)', () => {
  const baseValid = {
    heading: '',
    videoUrl: '',
    poster: '',
    padding: { top: 0, bottom: 0 },
  };

  it('schema accepts padded=false', () => {
    expect(VideoSchema.safeParse({ ...baseValid, padded: false }).success).toBe(true);
  });

  it('schema accepts padded=true', () => {
    expect(VideoSchema.safeParse({ ...baseValid, padded: true }).success).toBe(true);
  });

  it('schema accepts align="fullbleed"', () => {
    expect(VideoSchema.safeParse({ ...baseValid, align: 'fullbleed' }).success).toBe(true);
  });

  it('schema accepts align="container"', () => {
    expect(VideoSchema.safeParse({ ...baseValid, align: 'container' }).success).toBe(true);
  });

  it('schema rejects invalid align', () => {
    expect(
      VideoSchema.safeParse({ ...baseValid, align: 'wide' as unknown as 'container' }).success,
    ).toBe(false);
  });

  it('schema works without padded/align (backwards compat)', () => {
    expect(VideoSchema.safeParse(baseValid).success).toBe(true);
  });

  it('PuckConfig exposes padded + align fields', () => {
    const fields = VideoPuckConfig.fields as Record<string, unknown>;
    expect(fields.padded).toBeDefined();
    expect(fields.align).toBeDefined();
  });

  it('Classes export align mapping with container + fullbleed', () => {
    const c = VideoClasses as Record<string, unknown>;
    expect(c.align).toBeDefined();
    const map = c.align as Record<string, string>;
    expect(map.container).toBeDefined();
    expect(map.fullbleed).toBeDefined();
    // fullbleed should not be a max-width container
    expect(map.fullbleed).not.toMatch(/max-w-\[var\(--container-max-width\)\]/);
  });
});
