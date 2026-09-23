import { extractPageBlocks } from '../page-blocks';
import { composeV2Page } from '../v2-page-composer';

// Цепочка превью конструктора: extractPageBlocks готовит пропсы с publicUrl
// `/__theme/<тема>` (относительная картинка получает префикс уже в пропсах), а
// composeV2Page переписывает разметку блоков тем же префиксом. 23.09 картинка
// «О нас» bloom приходила в конструктор как `/__theme/bloom/__theme/bloom/…` → 404.

const SHELL =
  '<html><head></head><body><header>h</header><main>m</main><footer>f</footer></body></html>';
const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'] as const;

const revision = () => ({
  pagesData: {
    'page-about': {
      content: [
        {
          type: 'ImageWithText',
          props: { id: 'ImageWithText-1', image: { url: '/images/about-photo.webp', alt: 'Фото' } },
        },
      ],
    },
  },
});

describe.each(THEMES)('картинка страницы в превью — один префикс темы, %s', (theme) => {
  const prefix = `/__theme/${theme}`;

  it('адрес из пропсов с префиксом не получает второй при сборке страницы', async () => {
    const blocks = await extractPageBlocks(revision(), 'page-about', prefix, theme, 'site-1');
    const url = (blocks!.find((b) => b.type === 'ImageWithText')!.props.image as { url: string }).url;
    expect(url).toBe(`${prefix}/images/about-photo.webp`);

    const html = composeV2Page({
      shellHtml: SHELL,
      blocksHtml: [`<section><img src="${url}"></section>`],
      blockTypes: ['ImageWithText'],
      assetPrefix: prefix,
    });
    expect(html).toContain(`src="${prefix}/images/about-photo.webp"`);
    expect(html).not.toContain(`${prefix}/__theme/`);
  });
});
