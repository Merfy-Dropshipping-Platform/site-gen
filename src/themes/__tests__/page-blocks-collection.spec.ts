import { extractPageBlocks } from '../page-blocks';

// Изолируем подстановку плейсхолдеров коллекции от темо-манифеста и резолвера:
// блоки подаём напрямую через data.pagesData['page-collection'].content.
jest.mock('../theme-manifest-loader', () => ({
  getThemeManifest: jest.fn().mockReturnValue(null),
  googleFontHead: jest.fn().mockReturnValue(''),
}));
jest.mock('../page-resolver-instance', () => ({
  getPageResolver: jest.fn(),
}));

/**
 * 098 wiring (пункт 4): extractPageBlocks подставляет {{COLLECTION_*}} в
 * строковые props блоков страницы page-collection — зеркало substituteVars
 * из generatePuckCollectionsSlugPage на live.
 */
describe('extractPageBlocks — подстановка плейсхолдеров коллекции', () => {
  function revWithCollectionPage(props: Record<string, unknown>) {
    return {
      pagesData: {
        'page-collection': {
          content: [{ type: 'Hero', props }],
        },
      },
    } as Record<string, unknown>;
  }

  it('подставляет name/description/image в строковые props (вкл. arrayFields)', async () => {
    const data = revWithCollectionPage({
      title: '{{COLLECTION_NAME}}',
      subtitle: 'Коллекция: {{COLLECTION_NAME}} — {{COLLECTION_DESCRIPTION}}',
      bg: '{{COLLECTION_IMAGE}}',
      items: [{ label: '{{COLLECTION_NAME}}' }],
    });

    const blocks = await extractPageBlocks(
      data,
      'page-collection',
      null,
      null, // themeId=null → getThemeManifest замокан в null
      'site-1',
      undefined,
      undefined,
      { name: 'Зима 2026', description: 'Тёплая одежда', image: '/img/winter.jpg' },
    );

    expect(blocks).not.toBeNull();
    const props = blocks![0].props;
    expect(props.title).toBe('Зима 2026');
    expect(props.subtitle).toBe('Коллекция: Зима 2026 — Тёплая одежда');
    expect(props.bg).toBe('/img/winter.jpg');
    expect((props.items as Array<{ label: string }>)[0].label).toBe('Зима 2026');
  });

  it('без данных коллекции — имя дефолтится в "Каталог", description/image пустые', async () => {
    const data = revWithCollectionPage({
      title: '{{COLLECTION_NAME}}',
      subtitle: '{{COLLECTION_DESCRIPTION}}',
      bg: '{{COLLECTION_IMAGE}}',
    });

    const blocks = await extractPageBlocks(
      data,
      'page-collection',
      null,
      null,
      'site-1',
      undefined,
      undefined,
      {}, // пресет preview / неизвестный slug — нет данных
    );

    const props = blocks![0].props;
    expect(props.title).toBe('Каталог');
    expect(props.subtitle).toBe('');
    expect(props.bg).toBe('');
  });

  it('НЕ трогает плейсхолдеры на НЕ-коллекционной странице (page-home)', async () => {
    const data = {
      pagesData: {
        'page-home': {
          content: [{ type: 'Hero', props: { title: '{{COLLECTION_NAME}}' } }],
        },
      },
    } as Record<string, unknown>;

    const blocks = await extractPageBlocks(
      data,
      'page-home',
      null,
      null,
      'site-1',
      undefined,
      undefined,
      { name: 'Зима 2026' },
    );

    // На обычной странице плейсхолдер остаётся как есть (подстановка только для page-collection).
    expect(blocks![0].props.title).toBe('{{COLLECTION_NAME}}');
  });
});
