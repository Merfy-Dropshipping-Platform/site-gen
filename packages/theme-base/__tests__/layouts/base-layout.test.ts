describe('BaseLayout', () => {
  it('BaseLayout.astro file exists with expected structure', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const astroPath = path.resolve(__dirname, '../../layouts/BaseLayout.astro');
    const content = await fs.readFile(astroPath, 'utf-8');

    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('<html lang={locale}>');
    expect(content).toContain('<meta name="description"');
    expect(content).toContain('og:title');
    expect(content).toContain('twitter:card');
    expect(content).toContain('<slot />');
    expect(content).toContain('<slot name="head" />');
    expect(content).toContain('<slot name="body-end" />');
  });

  it('BaseLayout.astro conditionally renders canonical and noindex', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const astroPath = path.resolve(__dirname, '../../layouts/BaseLayout.astro');
    const content = await fs.readFile(astroPath, 'utf-8');

    // Verify conditional rendering patterns
    expect(content).toMatch(/canonicalUrl\s*&&/);
    expect(content).toMatch(/noIndex\s*&&/);
  });

  it('BaseLayout.astro injects tokens.css into <style>', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const astroPath = path.resolve(__dirname, '../../layouts/BaseLayout.astro');
    const content = await fs.readFile(astroPath, 'utf-8');

    expect(content).toContain('<style set:html={tokensCss}');
  });
});
