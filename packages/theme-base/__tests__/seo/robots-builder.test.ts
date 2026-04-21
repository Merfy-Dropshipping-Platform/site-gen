import { buildRobots } from '../../seo/RobotsBuilder';

describe('buildRobots', () => {
  it('emits blanket disallow when allowIndex is false', () => {
    const txt = buildRobots({ allowIndex: false });
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Disallow: /');
    expect(txt).not.toContain('Allow:');
  });

  it('allows specific paths when allowIndex is true', () => {
    const txt = buildRobots({
      allowIndex: true,
      disallow: ['/admin', '/api'],
      allow: ['/api/public'],
    });
    expect(txt).toContain('Disallow: /admin');
    expect(txt).toContain('Disallow: /api');
    expect(txt).toContain('Allow: /api/public');
  });

  it('emits Sitemap directive when sitemapUrl provided', () => {
    const txt = buildRobots({
      allowIndex: true,
      sitemapUrl: 'https://shop.ru/sitemap.xml',
    });
    expect(txt).toContain('Sitemap: https://shop.ru/sitemap.xml');
  });

  it('emits Host directive for Yandex', () => {
    const txt = buildRobots({
      allowIndex: true,
      host: 'shop.ru',
    });
    expect(txt).toContain('Host: shop.ru');
  });

  it('emits Clean-param directives for Yandex', () => {
    const txt = buildRobots({
      allowIndex: true,
      cleanParam: ['utm_source /', 'gclid /'],
    });
    expect(txt).toContain('Clean-param: utm_source /');
    expect(txt).toContain('Clean-param: gclid /');
  });
});
