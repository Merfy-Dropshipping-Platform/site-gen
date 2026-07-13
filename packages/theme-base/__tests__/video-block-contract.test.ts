import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  VideoPuckConfig,
  VideoSchema,
  VideoTokens,
  VideoClasses,
  resolveVideoHeadingSize,
  resolveVideoPosition,
  resolveVideoUrl,
  VideoStoredSchema,
} from '../blocks/Video';

describe('Video block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/Video');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports VideoPuckConfig with required fields', () => {
    expect(VideoPuckConfig.label).toBe('Видео');
    expect(VideoPuckConfig.category).toBe('media');
    expect(VideoPuckConfig.defaults.videoUrl).toBe('');
    expect(VideoPuckConfig.defaults.heading).toBe('');
    expect(VideoPuckConfig.defaults.poster).toBe('');
    expect(VideoPuckConfig.defaults.headingSize).toBe('medium');
  });

  it('VideoSchema parses valid props', () => {
    const ok = VideoSchema.safeParse({
      heading: 'Demo',
      videoUrl: 'https://youtu.be/abcd1234',
      poster: 'https://x.test/p.jpg',
      colorScheme: 'scheme-2',
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
  });

  it('exposes exactly the documented authoring controls', () => {
    const visibleKeys = Object.entries(VideoPuckConfig.fields)
      .filter(([, field]) => field.type !== 'hidden')
      .map(([key]) => key);
    expect(visibleKeys).toEqual([
      'videoUrl',
      'position',
      '_contentSection',
      'heading',
      'headingSize',
      'colorScheme',
      'padding',
    ]);
    expect(VideoPuckConfig.fields.position).toMatchObject({
      options: [
        { value: 'fullscreen' },
        { value: 'window' },
      ],
    });
  });

  it('uses window as the public position and keeps contained as a legacy alias', () => {
    const base = { heading: '', videoUrl: '', poster: '', padding: { top: 0, bottom: 0 } };
    expect(VideoSchema.safeParse({ ...base, position: 'window' }).success).toBe(true);
    expect(VideoSchema.safeParse({ ...base, position: 'contained' }).success).toBe(false);
    expect(VideoStoredSchema.safeParse({ ...base, position: 'contained' }).success).toBe(true);
    expect(resolveVideoPosition('window')).toBe('window');
    expect(resolveVideoPosition('contained')).toBe('window');
    expect(resolveVideoPosition('fullscreen')).toBe('fullscreen');
  });

  it('stores headingSize at top level and falls back to legacy nested content', () => {
    const parsed = VideoSchema.safeParse({
      heading: 'Demo',
      headingSize: 'large',
      videoUrl: '',
      poster: '',
      padding: { top: 0, bottom: 0 },
    });
    expect(parsed.success).toBe(true);
    expect(resolveVideoHeadingSize({ headingSize: 'small', content: { heading: { size: 'large' } } })).toBe('small');
    expect(resolveVideoHeadingSize({ content: { heading: { size: 'large' } } })).toBe('large');
    expect(resolveVideoHeadingSize({})).toBe('medium');
  });

  it('prefers canonical videoUrl over a genuine legacy video envelope', () => {
    expect(resolveVideoUrl({ videoUrl: 'canonical.mp4', video: { url: 'legacy.mp4' } })).toBe('canonical.mp4');
    expect(resolveVideoUrl({ videoUrl: '', video: { url: 'legacy.mp4' } })).toBe('legacy.mp4');
    expect(resolveVideoUrl({ video: { url: 'legacy.mp4' } })).toBe('legacy.mp4');
    expect(resolveVideoUrl({ videoUrl: 'blob:temporary' })).toBe('');
  });

  it('VideoTokens lists media radius + heading size tokens', () => {
    expect(VideoTokens.length).toBeGreaterThan(0);
    expect(VideoTokens).toContain('--radius-media');
    expect(VideoTokens).toContain('--size-hero-heading');
  });

  it('VideoClasses has root + container + media + iframe + video', () => {
    expect(VideoClasses.root).toBeDefined();
    expect(VideoClasses.container).toBeDefined();
    expect(VideoClasses.media).toBeDefined();
    expect(VideoClasses.iframe).toBeDefined();
    expect(VideoClasses.video).toBeDefined();
  });
});
