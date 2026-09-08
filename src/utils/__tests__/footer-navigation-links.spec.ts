import {
  buildFooterNavigationLinks,
  mergeFooterNavigationLinks,
  normalizeFooterNavHref,
} from '../footer-data';

describe('buildFooterNavigationLinks', () => {
  const pages = [
    { id: 'home', name: 'Главная', slug: '/' },
    { id: 'page-catalog', name: 'Коллекции', slug: '/catalog' },
    { id: 'page-about', name: 'О нас', slug: '/about' },
    { id: 'page-delivery', name: 'Доставка', slug: '/delivery' },
    { id: 'page-contacts', name: 'Контакты', slug: '/contacts' },
    { id: 'page-cart', name: 'Корзина', slug: '/cart' },
    { id: 'page-checkout', name: 'Checkout', slug: '/checkout' },
    {
      id: 'page-custom-1',
      name: 'FAQ',
      slug: '/faq',
      isCustom: true,
      createdAt: 100,
    },
  ];

  it('includes system content pages and custom pages, excludes cart/checkout', () => {
    const links = buildFooterNavigationLinks(pages);
    expect(links.map((l) => l.href)).toEqual([
      '/',
      '/catalog',
      '/about',
      '/delivery',
      '/contacts',
      '/faq',
    ]);
  });

  it('returns empty for non-array input', () => {
    expect(buildFooterNavigationLinks(null)).toEqual([]);
  });
});

describe('mergeFooterNavigationLinks', () => {
  it('uses page links when column links are empty', () => {
    const merged = mergeFooterNavigationLinks({ title: 'Nav', links: [] }, [
      { label: 'Доставка', href: '/delivery' },
    ]);
    expect(merged).toEqual([{ label: 'Доставка', href: '/delivery' }]);
  });

  it('appends missing page links without duplicating hrefs', () => {
    const merged = mergeFooterNavigationLinks(
      {
        links: [
          { label: 'Каталог', href: '/catalog' },
          { label: 'О нас', href: '/about' },
        ],
      },
      [
        { label: 'О нас', href: '/about' },
        { label: 'Доставка', href: '/delivery' },
      ],
    );
    expect(merged).toEqual([
      { label: 'Каталог', href: '/catalog' },
      { label: 'О нас', href: '/about' },
      { label: 'Доставка', href: '/delivery' },
    ]);
  });
});

describe('normalizeFooterNavHref', () => {
  it('strips trailing slashes', () => {
    expect(normalizeFooterNavHref('/about/')).toBe('/about');
    expect(normalizeFooterNavHref('/')).toBe('/');
  });
});
