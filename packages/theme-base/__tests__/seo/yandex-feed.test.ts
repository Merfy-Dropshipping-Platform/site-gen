import { buildYandexFeed } from '../../seo/YandexFeed';

describe('buildYandexFeed', () => {
  const baseShop = {
    name: 'Test Shop',
    company: 'Test Ltd',
    url: 'https://shop.ru',
    currencyId: 'RUB' as const,
    categories: [{ id: 1, name: 'Все товары' }],
    offers: [],
  };

  it('emits valid YML header + shop element', () => {
    const xml = buildYandexFeed(baseShop);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<yml_catalog');
    expect(xml).toContain('<shop>');
    expect(xml).toContain('<name>Test Shop</name>');
    expect(xml).toContain('<company>Test Ltd</company>');
    expect(xml).toContain('<currency id="RUB"');
  });

  it('emits categories with optional parentId', () => {
    const xml = buildYandexFeed({
      ...baseShop,
      categories: [
        { id: 1, name: 'Одежда' },
        { id: 2, name: 'Футболки', parentId: 1 },
      ],
    });
    expect(xml).toContain('<category id="1">Одежда</category>');
    expect(xml).toContain('<category id="2" parentId="1">Футболки</category>');
  });

  it('emits offer with required fields', () => {
    const xml = buildYandexFeed({
      ...baseShop,
      offers: [{
        id: 'p1',
        available: true,
        url: 'https://shop.ru/p/p1',
        price: 999,
        currencyId: 'RUB',
        categoryId: 1,
        name: 'Футболка',
      }],
    });
    expect(xml).toContain('<offer id="p1" available="true">');
    expect(xml).toContain('<url>https://shop.ru/p/p1</url>');
    expect(xml).toContain('<price>999</price>');
    expect(xml).toContain('<name>Футболка</name>');
  });

  it('escapes XML special chars in strings', () => {
    const xml = buildYandexFeed({
      ...baseShop,
      offers: [{
        id: 'p1',
        available: true,
        url: 'https://shop.ru/p/p1?q=a&b=c',
        price: 100,
        currencyId: 'RUB',
        categoryId: 1,
        name: 'Футболка <strong>new</strong>',
      }],
    });
    expect(xml).toContain('https://shop.ru/p/p1?q=a&amp;b=c');
    expect(xml).toContain('Футболка &lt;strong&gt;new&lt;/strong&gt;');
  });
});
