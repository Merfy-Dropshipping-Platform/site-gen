import { describe, expect, it } from 'vitest';
import { pageLocals } from '../src/head';
import type { BuildInputs } from '../src/inputs';
import { renderShopPage, type ShopTheme } from '../src/page';
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
  recordPage,
} from './support-records';
import { fakeRender, novaTokens } from './support-theme';

// SEO страницы записи (блок 8 «Секций и SDK», часть 8б-2; design.md 8.6): заголовок, описание, адрес и теги для
// соцсетей — по записи, ключевых слов нет. Главная — как раньше.
const theme: ShopTheme = { tokens: novaTokens, render: fakeRender };
const TEMPLATES = {
  product: [placed('product-1')],
  collection: [placed('collection-1')],
  blog: [placed('blog-1')],
  article: [placed('article-1')],
};
const headAt = (inputs: BuildInputs, path: string) => pageLocals(inputs, routeOf(path, inputs), novaTokens).head;

describe('SEO страницы записи', () => {
  it('товар: SEO-заголовок и описание мерчанта; нет — название и описание без HTML; ключевых слов нет', () => {
    const inputs = recordInputs(
      [
        product(P1, { seo: { title: 'Купить льняной шарф', description: 'Шарф из льна ручной работы' } }),
        product(P2, { title: 'Плед', handle: 'pled', description: '<p>Тёплый <b>плед</b></p>' }),
      ],
      TEMPLATES,
    );
    expect(headAt(inputs, '/product/sharf')).toMatchObject({
      title: 'Купить льняной шарф',
      description: 'Шарф из льна ручной работы',
      keywords: '',
      canonical: 'https://nova-stand.example/product/sharf',
    });
    expect(headAt(inputs, '/product/pled')).toMatchObject({ title: 'Плед', description: 'Тёплый плед', keywords: '' });
  });

  it('og:type — product у товара, article у статьи, website у коллекции и блога; картинка — записи', () => {
    const inputs = recordInputs(
      [product(P1), collection(C1), blog(B1), article(A1, { cover: 'https://s3.merfy.ru/a/1.webp' })],
      TEMPLATES,
    );
    const social = (path: string) => headAt(inputs, path).social;
    expect(social('/product/sharf')).toMatchObject({ type: 'product', image: 'https://s3.merfy.ru/p/1.jpg' });
    expect(social('/blogs/novosti/linen')).toMatchObject({ type: 'article', image: 'https://s3.merfy.ru/a/1.webp' });
    expect(social('/collections/kashemir')).toMatchObject({ type: 'website', image: '' });
    expect(social('/blogs/novosti')).toMatchObject({ type: 'website', image: '' });
  });

  it('картинки у записи нет или она не для соцсетей (SVG) — логотип магазина, как у главной', () => {
    const inputs = recordInputs([product(P1, { images: ['https://s3.merfy.ru/p/1.svg'] }), collection(C1)], TEMPLATES);
    inputs.site.logoUrl = 'https://s3.merfy.ru/logo.png';
    expect(headAt(inputs, '/product/sharf').social.image).toBe('https://s3.merfy.ru/logo.png');
    expect(headAt(inputs, '/collections/kashemir').social.image).toBe('https://s3.merfy.ru/logo.png');
  });

  it('политика: заголовок — её название, описания и ключевых слов нет', () => {
    const inputs = recordInputs([policy('privacy', 'Мы бережём данные покупателей')]);
    expect(headAt(inputs, '/legal/privacy')).toMatchObject({
      title: 'Политика конфиденциальности',
      description: '',
      keywords: '',
      canonical: 'https://nova-stand.example/legal/privacy',
    });
  });

  it('главная — как раньше: SEO магазина, website', () => {
    const head = headAt(recordInputs([product(P1)], TEMPLATES), '/');
    expect(head).toMatchObject({ title: 'Стенд Nova', description: 'Магазин-стенд новой темы', keywords: '' });
    expect(head.social.type).toBe('website');
  });

  it('страницы записей проходят проверку SEO сборки', async () => {
    const inputs = recordInputs(
      [product(P1), collection(C1), blog(B1), article(A1), policy('privacy', 'Мы бережём данные покупателей')],
      TEMPLATES,
    );
    const paths = [
      '/product/sharf',
      '/collections/kashemir',
      '/blogs/novosti',
      '/blogs/novosti/linen',
      '/legal/privacy',
    ];
    for (const path of paths)
      await expect(renderShopPage(inputs, path, theme, recordPage())).resolves.toMatchObject({ row: { path } });
  });
});
