describe('HrefLang.astro', () => {
  it('exists with alternates + xDefault props', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const p = path.resolve(__dirname, '../../seo/HrefLang.astro');
    const content = await fs.readFile(p, 'utf-8');
    expect(content).toContain('alternates:');
    expect(content).toContain('xDefault');
    expect(content).toContain('hreflang={locale}');
    expect(content).toContain('hreflang="x-default"');
  });
});
