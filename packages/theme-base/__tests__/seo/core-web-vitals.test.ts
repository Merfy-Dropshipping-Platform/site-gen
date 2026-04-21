import { extractCriticalCss } from '../../seo/CoreWebVitals/CriticalCss';

describe('CoreWebVitals', () => {
  describe('FontPreload.astro', () => {
    it('exists and accepts fonts prop', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const p = path.resolve(__dirname, '../../seo/CoreWebVitals/FontPreload.astro');
      const content = await fs.readFile(p, 'utf-8');
      expect(content).toContain('fonts: FontDef[]');
      expect(content).toContain('rel="preload"');
      expect(content).toContain('as="font"');
      expect(content).toContain('crossorigin');
    });

    it('defaults font/woff2 + anonymous crossorigin', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const p = path.resolve(__dirname, '../../seo/CoreWebVitals/FontPreload.astro');
      const content = await fs.readFile(p, 'utf-8');
      expect(content).toContain("'font/woff2'");
      expect(content).toContain("'anonymous'");
    });
  });

  describe('ImageOptimized.astro', () => {
    it('exists and REQUIRES alt (SEO invariant)', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const p = path.resolve(__dirname, '../../seo/CoreWebVitals/ImageOptimized.astro');
      const content = await fs.readFile(p, 'utf-8');
      expect(content).toContain('src: string;');
      expect(content).toContain('alt: string;');  // note: string, not string? — required
      expect(content).toContain('loading');
      expect(content).toContain('fetchpriority');
      expect(content).toContain('decoding="async"');
    });

    it('defaults loading=lazy', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const p = path.resolve(__dirname, '../../seo/CoreWebVitals/ImageOptimized.astro');
      const content = await fs.readFile(p, 'utf-8');
      expect(content).toMatch(/loading\s*=\s*['"]lazy['"]/);
    });
  });

  describe('extractCriticalCss (stub)', () => {
    it('returns full css as critical for Phase 1b', () => {
      const result = extractCriticalCss({
        html: '<body></body>',
        css: ':root{--x:1}',
      });
      expect(result.critical).toBe(':root{--x:1}');
      expect(result.deferred).toBe('');
    });

    it('exports CriticalCssOptions and CriticalCssResult types', () => {
      // Compile-time check via explicit variable typing
      const opts: import('../../seo/CoreWebVitals/CriticalCss').CriticalCssOptions = {
        html: '',
        css: '',
      };
      const res: import('../../seo/CoreWebVitals/CriticalCss').CriticalCssResult =
        extractCriticalCss(opts);
      expect(res).toBeDefined();
    });
  });
});
