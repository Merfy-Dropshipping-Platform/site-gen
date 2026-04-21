describe('JsonLd.astro', () => {
  it('exists and contains all 4 schema builders', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const p = path.resolve(__dirname, '../../seo/JsonLd.astro');
    const content = await fs.readFile(p, 'utf-8');
    expect(content).toContain('buildOrganization');
    expect(content).toContain('buildWebSite');
    expect(content).toContain('buildProduct');
    expect(content).toContain('buildBreadcrumb');
  });

  it('emits schema.org context in all builders', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const p = path.resolve(__dirname, '../../seo/JsonLd.astro');
    const content = await fs.readFile(p, 'utf-8');
    const matches = content.match(/schema\.org/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it('Product builder includes offers and availability URL', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const p = path.resolve(__dirname, '../../seo/JsonLd.astro');
    const content = await fs.readFile(p, 'utf-8');
    expect(content).toContain('https://schema.org/${d.offers.availability}');
    expect(content).toContain('priceCurrency');
  });

  it('BreadcrumbList builder maps position index correctly', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const p = path.resolve(__dirname, '../../seo/JsonLd.astro');
    const content = await fs.readFile(p, 'utf-8');
    expect(content).toContain('position: index + 1');
  });

  it('emits <script type="application/ld+json">', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const p = path.resolve(__dirname, '../../seo/JsonLd.astro');
    const content = await fs.readFile(p, 'utf-8');
    expect(content).toContain('<script type="application/ld+json"');
    expect(content).toContain('set:html={JSON.stringify(json');
  });
});
