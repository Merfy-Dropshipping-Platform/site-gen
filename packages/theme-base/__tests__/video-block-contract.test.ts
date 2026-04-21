import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  VideoPuckConfig,
  VideoSchema,
  VideoTokens,
  VideoClasses,
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
  });

  it('VideoSchema parses valid props', () => {
    const ok = VideoSchema.safeParse({
      heading: 'Demo',
      videoUrl: 'https://youtu.be/abcd1234',
      poster: 'https://x.test/p.jpg',
      colorScheme: 2,
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
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
