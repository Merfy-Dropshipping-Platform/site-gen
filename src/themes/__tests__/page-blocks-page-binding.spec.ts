import { extractPageBlocks } from '../page-blocks';

/**
 * Пункт 8 тестировщика: «В секции Страница моканые данные. Ожидаемый
 * результат: брать страницы из админки».
 *
 * `extractPageBlocks` — общая точка и для превью конструктора, и для сборки
 * витрины (v2-live-pages), поэтому привязка секции «Страница» проверяется
 * именно здесь: один резолв ⇒ превью и live показывают одно и то же.
 */

const revision = () => ({
  pages: [
    { id: 'home', name: 'Главная', slug: '/' },
    { id: 'page-about', name: 'О нас', slug: '/about' },
    { id: 'page-delivery', name: 'Доставка', slug: '/delivery' },
  ],
  pagesData: {
    home: {
      content: [
        {
          type: 'Page',
          props: {
            id: 'Page-home-1',
            pageId: 'page-about',
            heading: 'Старый заголовок секции',
            content: '<p>Старый текст секции</p>',
            padding: { top: 40, bottom: 40 },
          },
        },
      ],
    },
    'page-about': {
      content: [
        {
          type: 'Page',
          props: {
            id: 'Page-about',
            pageId: '',
            heading: 'О нас',
            content: '<p>Мы шьём сумки с 2019 года.</p>',
          },
        },
      ],
    },
    'page-delivery': {
      content: [{ type: 'Header', props: { id: 'Header-delivery' } }],
    },
  },
});

async function pageBlock(props: Record<string, unknown>, policies?: unknown) {
  const data = revision();
  (data.pagesData.home.content[0] as { props: Record<string, unknown> }).props = {
    ...(data.pagesData.home.content[0] as { props: Record<string, unknown> }).props,
    ...props,
  };
  const blocks = await extractPageBlocks(
    data,
    'home',
    null,
    null,
    'site-1',
    undefined,
    undefined,
    undefined,
    policies as never,
  );
  return blocks?.[0].props ?? {};
}

describe('секция «Страница» берёт контент выбранной страницы', () => {
  it('привязка к странице магазина подменяет заголовок и текст секции', async () => {
    const props = await pageBlock({ pageId: 'page-about' });
    expect(props.heading).toBe('О нас');
    expect(props.content).toBe('<p>Мы шьём сумки с 2019 года.</p>');
  });

  it('свободный режим (pageId пуст) оставляет контент секции мерчанту', async () => {
    const props = await pageBlock({ pageId: '' });
    expect(props.heading).toBe('Старый заголовок секции');
    expect(props.content).toBe('<p>Старый текст секции</p>');
  });

  it('страница без контента — заголовок из админки, тело пустое (не старый текст)', async () => {
    const props = await pageBlock({ pageId: 'page-delivery' });
    expect(props.heading).toBe('Доставка');
    expect(props.content).toBe('');
  });

  it('выбранная страница удалена — пусто, старый текст не протекает', async () => {
    const props = await pageBlock({ pageId: 'page-custom-удалённая' });
    expect(props.heading).toBe('');
    expect(props.content).toBe('');
  });

  it('политика подставляется, когда вызывающий передал site_policy', async () => {
    const props = await pageBlock({ pageId: 'privacy' }, [
      { type: 'privacy', content: 'Мы не продаём ваши данные.' },
    ]);
    expect(props.heading).toBe('Политика конфиденциальности');
    expect(props.content).toBe('<p>Мы не продаём ваши данные.</p>');
  });

  it('без переданных политик привязка к политике не затирается пустотой', async () => {
    const props = await pageBlock({
      pageId: 'privacy',
      heading: 'Политика конфиденциальности',
      content: '<p>Текст, подставленный сборкой</p>',
    });
    expect(props.content).toBe('<p>Текст, подставленный сборкой</p>');
  });

  it('секция на самой странице «О нас» не привязывается сама к себе', async () => {
    const data = revision();
    const about = data.pagesData['page-about'].content[0] as {
      props: Record<string, unknown>;
    };
    about.props = { ...about.props, pageId: 'page-about', heading: 'Своё', content: '<p>Своё</p>' };
    const blocks = await extractPageBlocks(data, 'page-about', null, null, 'site-1');
    expect(blocks?.[0].props.heading).toBe('Своё');
    expect(blocks?.[0].props.content).toBe('<p>Своё</p>');
  });
});
