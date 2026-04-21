describe('StoreLayout', () => {
  it('StoreLayout.astro imports BaseLayout, Header, Footer', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const astroPath = path.resolve(__dirname, '../../layouts/StoreLayout.astro');
    const content = await fs.readFile(astroPath, 'utf-8');

    expect(content).toMatch(/import\s+BaseLayout\s+from\s+['"]\.\/BaseLayout\.astro['"]/);
    expect(content).toMatch(/import\s+Header\s+from\s+['"]\.\.\/blocks\/Header\/Header\.astro['"]/);
    expect(content).toMatch(/import\s+Footer\s+from\s+['"]\.\.\/blocks\/Footer\/Footer\.astro['"]/);
  });

  it('StoreLayout.astro renders Header → main → Footer in order', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const astroPath = path.resolve(__dirname, '../../layouts/StoreLayout.astro');
    const content = await fs.readFile(astroPath, 'utf-8');

    const headerIdx = content.indexOf('<Header');
    const mainIdx = content.indexOf('<main>');
    const slotIdx = content.indexOf('<slot />');
    const footerIdx = content.indexOf('<Footer');

    expect(headerIdx).toBeGreaterThan(-1);
    expect(mainIdx).toBeGreaterThan(headerIdx);
    expect(slotIdx).toBeGreaterThan(mainIdx);
    expect(footerIdx).toBeGreaterThan(slotIdx);
  });

  it('StoreLayout forwards meta props to BaseLayout', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const astroPath = path.resolve(__dirname, '../../layouts/StoreLayout.astro');
    const content = await fs.readFile(astroPath, 'utf-8');

    // Verify {title}, {description}, {canonicalUrl}, {ogImage}, etc. are passed through
    expect(content).toMatch(/title={title}/);
    expect(content).toMatch(/description={description}/);
    expect(content).toMatch(/canonicalUrl={canonicalUrl}/);
  });
});
