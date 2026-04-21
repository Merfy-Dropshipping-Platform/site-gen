describe('MetaTags.astro', () => {
  it('MetaTags.astro exists and has expected structure', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const p = path.resolve(__dirname, '../../seo/MetaTags.astro');
    const content = await fs.readFile(p, 'utf-8');
    expect(content).toContain('titleTemplate');
    expect(content).toContain('<title>{finalTitle}</title>');
    expect(content).toContain('og:type');
    expect(content).toContain('twitter:card');
    expect(content).toContain('canonical');
    expect(content).toContain('og:site_name');
  });

  it('MetaTags.astro conditionally renders optional meta', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const p = path.resolve(__dirname, '../../seo/MetaTags.astro');
    const content = await fs.readFile(p, 'utf-8');
    expect(content).toMatch(/canonicalUrl\s*&&/);
    expect(content).toMatch(/ogImage\s*&&/);
    expect(content).toMatch(/author\s*&&/);
    expect(content).toMatch(/keywords\s*&&/);
  });
});
