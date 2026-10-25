import { describe, expect, it } from 'vitest';
import { pageLocals } from '../src/head';
import type { BuildInputs } from '../src/inputs';
import { routeOf } from '../src/routes';
import {
  A1,
  B1,
  C1,
  P1,
  P2,
  article,
  blog,
  collection,
  placed,
  policy,
  product,
  recordInputs,
} from './support-records';
import { novaTokens } from './support-theme';

// Разметка товара для поиска (блок 8 «Секций и SDK», часть 8б-2, Р8б-12): JSON-LD Product в structuredData головы —
// пишет платформа; у других страниц поля нет.
const TEMPLATES = {
  product: [placed('product-1')],
  collection: [placed('collection-1')],
  blog: [placed('blog-1')],
  article: [placed('article-1')],
};
const PREFIX = '<script type="application/ld+json">';
const SUFFIX = '</script>';
const headAt = (inputs: BuildInputs, path: string) => pageLocals(inputs, routeOf(path, inputs), novaTokens).head;
const dataAt = (inputs: BuildInputs, path: string): unknown => {
  const tag = headAt(inputs, path).structuredData ?? '';
  return JSON.parse(tag.slice(PREFIX.length, tag.length - SUFFIX.length));
};

describe('разметка товара для поиска', () => {
  it('товар: название, описание, картинки, адрес и предложение — цена в рублях, наличие', () => {
    const inputs = recordInputs([product(P1)], TEMPLATES);
    const offers = {
      '@type': 'Offer',
      price: 1900,
      priceCurrency: 'RUB',
      availability: 'https://schema.org/InStock',
      url: 'https://nova-stand.example/product/sharf',
    };
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Шарф',
      description: 'Тёплый шарф из льна',
      image: ['https://s3.merfy.ru/p/1.jpg'],
      url: 'https://nova-stand.example/product/sharf',
      offers,
    };
    expect(headAt(inputs, '/product/sharf').structuredData).toBe(`${PREFIX}${JSON.stringify(data)}${SUFFIX}`);
  });

  it('цена 0 — без предложения; нет в наличии — OutOfStock; картинки не https и пустое описание — без ключей', () => {
    const images = ['http://s3.merfy.ru/p/1.jpg', 'data:image/png;base64,AA=='];
    const inputs = recordInputs(
      [
        product(P1, { price: 0, description: '', images }),
        product(P2, { title: 'Плед', handle: 'pled', available: false }),
      ],
      TEMPLATES,
    );
    expect(dataAt(inputs, '/product/sharf')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Шарф',
      url: 'https://nova-stand.example/product/sharf',
    });
    expect(dataAt(inputs, '/product/pled')).toMatchObject({
      offers: { price: 1900, availability: 'https://schema.org/OutOfStock' },
    });
  });

  it('«</script>» в названии тег не закрывает; разбор даёт то же название', () => {
    const title = 'Шарф </script><script>alert(1)</script>';
    const inputs = recordInputs([product(P1, { title })], TEMPLATES);
    const tag = headAt(inputs, '/product/sharf').structuredData ?? '';
    expect(tag.match(/<\/script>/g)).toHaveLength(1);
    expect(tag.endsWith(SUFFIX)).toBe(true);
    expect(dataAt(inputs, '/product/sharf')).toMatchObject({ name: title });
  });

  it('коллекция, блог, статья, политика и главная — без разметки', () => {
    const inputs = recordInputs(
      [collection(C1), blog(B1), article(A1), policy('privacy', 'Мы бережём данные')],
      TEMPLATES,
    );
    for (const path of ['/collections/kashemir', '/blogs/novosti', '/blogs/novosti/linen', '/legal/privacy', '/'])
      expect(headAt(inputs, path)).not.toHaveProperty('structuredData');
  });
});
