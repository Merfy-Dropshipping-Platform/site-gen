import { resolveBoundPage, applyPageBinding } from '../page-transclude';

/**
 * Пункт 8 тестировщика: «В секции Страница моканые данные. Ожидаемый
 * результат: брать страницы из админки».
 *
 * «Выбор страницы» (`pageId`, pageContentPicker) до правки не доезжал до
 * рендера вообще: превью его игнорировало, а сборка подставляла контент
 * ТОЛЬКО для политик (`build.service.ts` policyByType — refund/privacy/tos/
 * shipping), тогда как пикер отдаёт id страниц конструктора (`page-about`,
 * `page-custom-…`). Мерчант выбирал страницу — секция продолжала показывать
 * свой старый (сид-дизайнерский) текст.
 */

const revision = {
  pages: [
    { id: 'page-about', name: 'О нас', slug: '/about' },
    { id: 'page-contacts', name: 'Контакты', slug: '/contacts' },
    { id: 'page-empty', name: 'Пустая', slug: '/empty' },
  ],
  pagesData: {
    'page-about': {
      content: [
        { type: 'Header', props: { id: 'Header-about' } },
        {
          type: 'Page',
          props: {
            id: 'Page-about',
            heading: 'О нас',
            content: '<p>Мы шьём сумки с 2019 года.</p>',
          },
        },
      ],
    },
    'page-contacts': {
      content: [
        {
          type: 'Page',
          props: { id: 'Page-contacts', heading: 'Контакты', content: '<p>Пишите.</p>' },
        },
      ],
    },
    'page-empty': {
      content: [{ type: 'Header', props: { id: 'Header-empty' } }],
    },
  },
};

const policies = [
  { type: 'privacy', content: 'Мы не продаём ваши данные.\n\nВторой абзац.' },
];

describe('привязка секции «Страница» к странице из админки', () => {
  it('пустой pageId — свободный режим, секция остаётся со своим контентом', () => {
    expect(resolveBoundPage('', { revision })).toBeNull();
    expect(resolveBoundPage(undefined, { revision })).toBeNull();
  });

  it('выбранная страница отдаёт свой заголовок и текст', () => {
    expect(resolveBoundPage('page-about', { revision })).toEqual({
      heading: 'О нас',
      content: '<p>Мы шьём сумки с 2019 года.</p>',
    });
  });

  it('страница без контентной секции — заголовок из админки, тело пустое', () => {
    expect(resolveBoundPage('page-empty', { revision })).toEqual({
      heading: 'Пустая',
      content: '',
    });
  });

  it('выбранной страницы больше нет — пусто, а НЕ старый текст секции', () => {
    expect(resolveBoundPage('page-deleted', { revision })).toEqual({
      heading: '',
      content: '',
    });
  });

  it('привязка страницы к самой себе не зацикливается', () => {
    expect(resolveBoundPage('page-about', { revision, selfPageId: 'page-about' })).toBeNull();
  });

  it('политика магазина по-прежнему подтягивается из site_policy', () => {
    expect(resolveBoundPage('privacy', { revision, policies })).toEqual({
      heading: 'Политика конфиденциальности',
      content: '<p>Мы не продаём ваши данные.</p><p>Второй абзац.</p>',
    });
  });

  it('политики не трогаются, если вызывающий их не передал (их ставит сборка)', () => {
    expect(resolveBoundPage('privacy', { revision })).toBeNull();
    expect(resolveBoundPage('privacy', { revision, policies: [] })).toEqual({
      heading: 'Политика конфиденциальности',
      content: '',
    });
  });

  it('applyPageBinding переписывает heading/content секции', () => {
    const out = applyPageBinding(
      { id: 'Page-1', pageId: 'page-contacts', heading: 'Старый', content: '<p>Старое</p>' },
      { revision },
    );
    expect(out.heading).toBe('Контакты');
    expect(out.content).toBe('<p>Пишите.</p>');
  });

  it('applyPageBinding в свободном режиме ничего не трогает', () => {
    const props = { id: 'Page-1', pageId: '', heading: 'Своё', content: '<p>Свой текст</p>' };
    expect(applyPageBinding(props, { revision })).toEqual(props);
  });

  it('applyPageBinding не транслирует секцию в саму себя (id блока страницы)', () => {
    const props = { id: 'Page-about', pageId: 'page-about', heading: 'Своё', content: '<p>Т</p>' };
    expect(applyPageBinding(props, { revision })).toEqual(props);
  });
});
