describe('TrackingScripts.astro', () => {
  it('includes all 4 tracker integrations + GSC verification', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const p = path.resolve(__dirname, '../../seo/TrackingScripts.astro');
    const content = await fs.readFile(p, 'utf-8');

    expect(content).toContain('googletagmanager.com/gtag/js');
    expect(content).toContain('mc.yandex.ru/metrika/tag.js');
    expect(content).toContain('connect.facebook.net');
    expect(content).toContain('vk.com/js/api/openapi.js');
    expect(content).toContain('google-site-verification');
  });

  it('all trackers are conditionally rendered', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const p = path.resolve(__dirname, '../../seo/TrackingScripts.astro');
    const content = await fs.readFile(p, 'utf-8');

    expect(content).toMatch(/ga4MeasurementId\s*&&/);
    expect(content).toMatch(/yandexMetrikaCounterId\s*&&/);
    expect(content).toMatch(/facebookPixelId\s*&&/);
    expect(content).toMatch(/vkPixelId\s*&&/);
  });

  it('Yandex.Metrika includes webvisor + noscript fallback', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const p = path.resolve(__dirname, '../../seo/TrackingScripts.astro');
    const content = await fs.readFile(p, 'utf-8');
    expect(content).toContain('webvisor:true');
    expect(content).toContain('<noscript>');
    expect(content).toContain('mc.yandex.ru/watch');
  });
});
